import { createHash } from "node:crypto";

import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import {
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";

import type { GlobalReceivablesProtocol } from "../target/types/global_receivables_protocol";

describe("GRP current MarketConfig happy path", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace
    .globalReceivablesProtocol as Program<GlobalReceivablesProtocol>;

  const requester = Keypair.generate();
  const payer = Keypair.generate();
  const investor = Keypair.generate();
  const originator = Keypair.generate();
  const marketTreasury = Keypair.generate();

  let usdcMint: PublicKey;

  const receivableId = Uint8Array.from([
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16,
  ]);

  const marketSlug = "elas-recebem-hoje";
  const marketIdHash = createHash("sha256").update(marketSlug).digest();

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId,
  );

  const [marketConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market-config"), marketIdHash],
    program.programId,
  );

  const [passportPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("passport"), requester.publicKey.toBuffer()],
    program.programId,
  );

  const [receivablePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("receivable"),
      requester.publicKey.toBuffer(),
      Buffer.from(receivableId),
    ],
    program.programId,
  );

  const [receivableMarketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("receivable-market"), receivablePda.toBuffer()],
    program.programId,
  );

  const [payerAuthorizationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("payer-authorization"), receivablePda.toBuffer()],
    program.programId,
  );

  const [validationPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("validation"),
      receivablePda.toBuffer(),
      originator.publicKey.toBuffer(),
    ],
    program.programId,
  );

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), receivablePda.toBuffer()],
    program.programId,
  );

  const [poolVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool-vault"), poolPda.toBuffer()],
    program.programId,
  );

  const [contributionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("contribution"),
      poolPda.toBuffer(),
      investor.publicKey.toBuffer(),
    ],
    program.programId,
  );

  const [settlementDistributionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("settlement-distribution"), poolPda.toBuffer()],
    program.programId,
  );

  async function airdrop(pubkey: PublicKey) {
    const signature = await provider.connection.requestAirdrop(
      pubkey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(signature, "confirmed");
  }

  before(async () => {
    await Promise.all([
      airdrop(requester.publicKey),
      airdrop(payer.publicKey),
      airdrop(investor.publicKey),
      airdrop(originator.publicKey),
    ]);

    usdcMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      provider.wallet.publicKey,
      null,
      6,
    );

    await program.methods
      .initializeProtocol(usdcMint, provider.wallet.publicKey)
      .accounts({
        config: configPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeMarket(
        Array.from(marketIdHash),
        originator.publicKey,
        marketTreasury.publicKey,
        { active: {} },
        8_000,
        5_000,
        350,
        100,
        50,
        1,
      )
      .accounts({
        config: configPda,
        marketConfig: marketConfigPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializePassport()
      .accounts({
        passport: passportPda,
        subject: requester.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([requester])
      .rpc();
  });

  it("enforces MarketConfig and runs create -> fund -> advance -> settle -> distribute -> Passport", async () => {
    const payerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      payer.publicKey,
    );

    const investorAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      investor.publicKey,
    );

    const requesterAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      requester.publicKey,
    );

    const marketTreasuryAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      marketTreasury.publicKey,
    );

    const protocolTreasuryAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      provider.wallet.publicKey,
    );

    const settlementVault = await getAssociatedTokenAddress(
      usdcMint,
      payerAuthorizationPda,
      true,
    );

    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      payerAuthorizationPda,
      true,
    );

    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      payerAta.address,
      provider.wallet.publicKey,
      2_000_000,
    );

    await mintTo(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer,
      usdcMint,
      investorAta.address,
      provider.wallet.publicKey,
      2_000_000,
    );

    const now = Math.floor(Date.now() / 1000);
    const fundingDeadline = new anchor.BN(now + 60);
    const dueAt = new anchor.BN(now + 120);

    await program.methods
      .createReceivable(
        Array.from(receivableId),
        originator.publicKey,
        Array(32).fill(7),
        Array.from(Buffer.from("USD")),
        new anchor.BN(1_000_000),
        dueAt,
      )
      .accounts({
        config: configPda,
        receivable: receivablePda,
        passport: passportPda,
        requester: requester.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([requester])
      .rpc();

    await program.methods
      .recordPayerConfirmation(
        Array(32).fill(9),
        new anchor.BN(1_000_000),
      )
      .accounts({
        config: configPda,
        receivable: receivablePda,
        payerAuthorization: payerAuthorizationPda,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const payerAfterCommitment = await getAccount(
      provider.connection,
      payerAta.address,
    );
    expect(payerAfterCommitment.delegate).to.equal(null);
    expect(payerAfterCommitment.delegatedAmount.toString()).to.equal("0");
    expect(payerAfterCommitment.amount.toString()).to.equal("2000000");

    await program.methods
      .recordValidation(
        { approved: {} },
        Array(32).fill(11),
        1,
      )
      .accounts({
        config: configPda,
        receivable: receivablePda,
        validation: validationPda,
        validator: originator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([originator])
      .rpc();

    await program.methods
      .createPool(
        new anchor.BN(800_000),
        5_000,
        350,
        fundingDeadline,
      )
      .accounts({
        config: configPda,
        marketConfig: marketConfigPda,
        receivableMarket: receivableMarketPda,
        receivable: receivablePda,
        pool: poolPda,
        poolVault: poolVaultPda,
        requester: requester.publicKey,
        usdcMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([requester])
      .rpc();

    const marketBinding = await program.account.receivableMarket.fetch(
      receivableMarketPda,
    );
    expect(marketBinding.marketConfig.toBase58()).to.equal(
      marketConfigPda.toBase58(),
    );

    await program.methods
      .fundPool(new anchor.BN(800_000))
      .accounts({
        config: configPda,
        receivable: receivablePda,
        pool: poolPda,
        contribution: contributionPda,
        investor: investor.publicKey,
        usdcMint,
        investorTokenAccount: investorAta.address,
        poolVault: poolVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([investor])
      .rpc();

    await program.methods
      .disbursePool()
      .accounts({
        config: configPda,
        receivable: receivablePda,
        pool: poolPda,
        requester: requester.publicKey,
        usdcMint,
        requesterTokenAccount: requesterAta.address,
        poolVault: poolVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([requester])
      .rpc();

    const requesterAfterAdvance = await getAccount(
      provider.connection,
      requesterAta.address,
    );
    expect(requesterAfterAdvance.amount.toString()).to.equal("800000");

    // Early voluntary settlement is valid after disbursement. A fresh payer
    // signature moves USDC; the commitment step did not authorize future debit.
    await program.methods
      .manualRepayment(new anchor.BN(1_000_000))
      .accounts({
        config: configPda,
        receivable: receivablePda,
        payerAuthorization: payerAuthorizationPda,
        payer: payer.publicKey,
        usdcMint,
        payerTokenAccount: payerAta.address,
        settlementVault,
        pool: poolPda,
        passport: passportPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([payer])
      .rpc();

    const investorBeforeClaim = await getAccount(
      provider.connection,
      investorAta.address,
    );

    await program.methods
      .claimDistribution()
      .accounts({
        config: configPda,
        receivable: receivablePda,
        pool: poolPda,
        contribution: contributionPda,
        payerAuthorization: payerAuthorizationPda,
        investor: investor.publicKey,
        usdcMint,
        investorTokenAccount: investorAta.address,
        settlementVault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([investor])
      .rpc();

    const investorAfterClaim = await getAccount(
      provider.connection,
      investorAta.address,
    );
    expect(
      (investorAfterClaim.amount - investorBeforeClaim.amount).toString(),
    ).to.equal("828000");

    const requesterBeforeResidual = await getAccount(
      provider.connection,
      requesterAta.address,
    );
    const marketBefore = await getAccount(
      provider.connection,
      marketTreasuryAta.address,
    );
    const protocolBefore = await getAccount(
      provider.connection,
      protocolTreasuryAta.address,
    );

    await program.methods
      .claimSettlementResidual()
      .accounts({
        config: configPda,
        marketConfig: marketConfigPda,
        receivableMarket: receivableMarketPda,
        receivable: receivablePda,
        pool: poolPda,
        payerAuthorization: payerAuthorizationPda,
        requester: requester.publicKey,
        usdcMint,
        settlementVault,
        settlementDistribution: settlementDistributionPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        {
          pubkey: requesterAta.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: marketTreasuryAta.address,
          isSigner: false,
          isWritable: true,
        },
        {
          pubkey: protocolTreasuryAta.address,
          isSigner: false,
          isWritable: true,
        },
      ])
      .signers([requester])
      .rpc();

    const requesterAfterResidual = await getAccount(
      provider.connection,
      requesterAta.address,
    );
    const marketAfter = await getAccount(
      provider.connection,
      marketTreasuryAta.address,
    );
    const protocolAfter = await getAccount(
      provider.connection,
      protocolTreasuryAta.address,
    );
    const settlementAfter = await getAccount(
      provider.connection,
      settlementVault,
    );

    expect(
      (requesterAfterResidual.amount - requesterBeforeResidual.amount).toString(),
    ).to.equal("157000");
    expect((marketAfter.amount - marketBefore.amount).toString()).to.equal(
      "10000",
    );
    expect(
      (protocolAfter.amount - protocolBefore.amount).toString(),
    ).to.equal("5000");
    expect(settlementAfter.amount.toString()).to.equal("0");

    const receivable = await program.account.receivable.fetch(receivablePda);
    const pool = await program.account.pool.fetch(poolPda);
    const contribution = await program.account.contribution.fetch(
      contributionPda,
    );
    const passport = await program.account.receivablePassport.fetch(
      passportPda,
    );
    const distribution = await program.account.settlementDistribution.fetch(
      settlementDistributionPda,
    );
    const marketConfig = await program.account.marketConfig.fetch(
      marketConfigPda,
    );

    expect(receivable.payerWallet.toBase58()).to.equal(
      payer.publicKey.toBase58(),
    );
    expect(receivable.settlementVault.toBase58()).to.equal(
      settlementVault.toBase58(),
    );
    expect(pool.targetAmount.toString()).to.equal("800000");
    expect(pool.fundedAmount.toString()).to.equal("800000");
    expect(pool.repaidAmount.toString()).to.equal("1000000");
    expect(pool.distributedAmount.toString()).to.equal("828000");
    expect(contribution.amount.toString()).to.equal("800000");
    expect(contribution.distributedAmount.toString()).to.equal("828000");

    expect(marketConfig.advanceBps).to.equal(8_000);
    expect(marketConfig.minimumPartialBps).to.equal(5_000);
    expect(marketConfig.investorReturnBps).to.equal(350);
    expect(marketConfig.marketFeeBps).to.equal(100);
    expect(marketConfig.protocolFeeBps).to.equal(50);

    expect(distribution.marketFeeAmount.toString()).to.equal("10000");
    expect(distribution.protocolFeeAmount.toString()).to.equal("5000");
    expect(distribution.requesterResidualAmount.toString()).to.equal("157000");

    expect(passport.receivablesCreated.toString()).to.equal("1");
    expect(passport.receivablesSettled.toString()).to.equal("1");
    expect(passport.settledOnTime.toString()).to.equal("1");
    expect(passport.settledLate.toString()).to.equal("0");
    expect(passport.defaults.toString()).to.equal("0");
    expect(passport.defaultsCured.toString()).to.equal("0");
    expect(passport.totalSettledAmount.toString()).to.equal("1000000");
  });

  it("rejects pool economics that do not match the MarketConfig", async () => {
    const secondRequester = Keypair.generate();
    const secondPayer = Keypair.generate();
    const secondReceivableId = Uint8Array.from([
      16, 15, 14, 13, 12, 11, 10, 9,
      8, 7, 6, 5, 4, 3, 2, 1,
    ]);

    await Promise.all([
      airdrop(secondRequester.publicKey),
      airdrop(secondPayer.publicKey),
    ]);

    const [secondPassport] = PublicKey.findProgramAddressSync(
      [Buffer.from("passport"), secondRequester.publicKey.toBuffer()],
      program.programId,
    );
    const [secondReceivable] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("receivable"),
        secondRequester.publicKey.toBuffer(),
        Buffer.from(secondReceivableId),
      ],
      program.programId,
    );
    const [secondAuthorization] = PublicKey.findProgramAddressSync(
      [Buffer.from("payer-authorization"), secondReceivable.toBuffer()],
      program.programId,
    );
    const [secondValidation] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("validation"),
        secondReceivable.toBuffer(),
        originator.publicKey.toBuffer(),
      ],
      program.programId,
    );
    const [secondPool] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), secondReceivable.toBuffer()],
      program.programId,
    );
    const [secondPoolVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool-vault"), secondPool.toBuffer()],
      program.programId,
    );
    const [secondReceivableMarket] = PublicKey.findProgramAddressSync(
      [Buffer.from("receivable-market"), secondReceivable.toBuffer()],
      program.programId,
    );

    await program.methods
      .initializePassport()
      .accounts({
        passport: secondPassport,
        subject: secondRequester.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([secondRequester])
      .rpc();

    const now = Math.floor(Date.now() / 1000);

    await program.methods
      .createReceivable(
        Array.from(secondReceivableId),
        originator.publicKey,
        Array(32).fill(3),
        Array.from(Buffer.from("USD")),
        new anchor.BN(1_000_000),
        new anchor.BN(now + 120),
      )
      .accounts({
        config: configPda,
        receivable: secondReceivable,
        passport: secondPassport,
        requester: secondRequester.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([secondRequester])
      .rpc();

    await program.methods
      .recordPayerConfirmation(
        Array(32).fill(4),
        new anchor.BN(1_000_000),
      )
      .accounts({
        config: configPda,
        receivable: secondReceivable,
        payerAuthorization: secondAuthorization,
        payer: secondPayer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([secondPayer])
      .rpc();

    await program.methods
      .recordValidation(
        { approved: {} },
        Array(32).fill(5),
        1,
      )
      .accounts({
        config: configPda,
        receivable: secondReceivable,
        validation: secondValidation,
        validator: originator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([originator])
      .rpc();

    let rejected = false;
    try {
      await program.methods
        .createPool(
          new anchor.BN(900_000),
          5_000,
          1_000,
          new anchor.BN(now + 60),
        )
        .accounts({
          config: configPda,
          marketConfig: marketConfigPda,
          receivableMarket: secondReceivableMarket,
          receivable: secondReceivable,
          pool: secondPool,
          poolVault: secondPoolVault,
          requester: secondRequester.publicKey,
          usdcMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([secondRequester])
        .rpc();
    } catch (error) {
      rejected = true;
      expect(String(error)).to.match(
        /MarketRulesMismatch|transaction does not match the Market rules/i,
      );
    }

    expect(rejected).to.equal(true);
  });
});
