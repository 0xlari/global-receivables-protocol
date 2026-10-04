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
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { expect } from "chai";

import type { GlobalReceivablesProtocol } from "../target/types/global_receivables_protocol";

describe("GRP on-chain happy path", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace
    .globalReceivablesProtocol as Program<GlobalReceivablesProtocol>;

  const requester = Keypair.generate();
  const payer = Keypair.generate();
  const investor = Keypair.generate();
  const originator = Keypair.generate();

  let usdcMint: PublicKey;

  const receivableId = Uint8Array.from([
    1, 2, 3, 4, 5, 6, 7, 8,
    9, 10, 11, 12, 13, 14, 15, 16,
  ]);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
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

  const [payerAuthorizationPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("payer-authorization"), receivablePda.toBuffer()],
    program.programId,
  );

  const [settlementVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("settlement-vault"), receivablePda.toBuffer()],
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

  async function airdrop(pubkey: PublicKey) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      2 * anchor.web3.LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
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
      .initializePassport()
      .accounts({
        passport: passportPda,
        subject: requester.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([requester])
      .rpc();
  });

  it("creates, confirms, validates and funds a receivable using USDC", async () => {
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
    const dueAt = new anchor.BN(now + 7 * 86_400);
    const fundingDeadline = new anchor.BN(now + 2 * 86_400);

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
        usdcMint,
        settlementVault: settlementVaultPda,
        payerTokenAccount: payerAta.address,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();

    const payerAccount = await provider.connection.getTokenAccountBalance(
      payerAta.address,
    );
    expect(payerAccount.value.amount).to.equal("2000000");

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
        new anchor.BN(900_000),
        5_000,
        1_000,
        fundingDeadline,
      )
      .accounts({
        config: configPda,
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

    await program.methods
      .fundPool(new anchor.BN(900_000))
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

    const receivable = await program.account.receivable.fetch(receivablePda);
    const pool = await program.account.pool.fetch(poolPda);
    const contribution = await program.account.contribution.fetch(contributionPda);
    const passport = await program.account.receivablePassport.fetch(passportPda);

    expect(receivable.payerWallet.toBase58()).to.equal(payer.publicKey.toBase58());
    expect(receivable.payerAuthorization.toBase58()).to.equal(
      payerAuthorizationPda.toBase58(),
    );
    expect(pool.fundedAmount.toString()).to.equal("900000");
    expect(contribution.amount.toString()).to.equal("900000");
    expect(passport.receivablesCreated.toString()).to.equal("1");
  });
});
