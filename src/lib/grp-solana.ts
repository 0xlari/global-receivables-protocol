"use client";

import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } from "@solana/spl-token";

const DEFAULT_GRP_PROGRAM_ID = "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY";

function safePublicKey(value: string | undefined, fallback: string) {
  const candidate = value?.trim();
  try {
    return new PublicKey(candidate || fallback);
  } catch {
    return new PublicKey(fallback);
  }
}

export const GRP_PROGRAM_ID = safePublicKey(
  process.env.NEXT_PUBLIC_GRP_PROGRAM_ID,
  DEFAULT_GRP_PROGRAM_ID,
);

export const GRP_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const RECORD_PAYER_CONFIRMATION_DISCRIMINATOR = Uint8Array.from([
  0xf9, 0xf7, 0xca, 0x52, 0x09, 0x02, 0xcb, 0xc6,
]);

export type BrowserSolanaProvider = {
  publicKey?: { toBase58(): string };
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  signMessage?(message: Uint8Array, display?: "utf8"): Promise<{ signature: Uint8Array }>;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
  signAndSendTransaction(transaction: Transaction): Promise<{ signature: string }>;
};

export function uuidToBytes(uuid: string) {
  const hex = uuid.replaceAll("-", "");
  if (!/^[a-f0-9]{32}$/i.test(hex)) throw new Error("Invalid receivable ID.");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export function u64le(value: bigint) {
  if (value <= 0n || value > 18_446_744_073_709_551_615n) {
    throw new Error("Invalid USDC amount.");
  }
  const result = new Uint8Array(8);
  let remaining = value;
  for (let index = 0; index < 8; index += 1) {
    result[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return result;
}

export function u16le(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error("Invalid basis points.");
  }
  return Uint8Array.of(value & 0xff, (value >> 8) & 0xff);
}

async function marketIdHash(slug: string) {
  const bytes = new TextEncoder().encode(slug.trim().toLowerCase());
  if (!bytes.length) throw new Error("INVALID_MARKET_SLUG");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function deriveMarketPdas(input: {
  marketSlug: string;
  receivable?: PublicKey;
}) {
  const hash = await marketIdHash(input.marketSlug);
  const [marketConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("market-config"), Buffer.from(hash)],
    GRP_PROGRAM_ID,
  );
  const receivableMarket = input.receivable
    ? PublicKey.findProgramAddressSync(
        [Buffer.from("receivable-market"), input.receivable.toBuffer()],
        GRP_PROGRAM_ID,
      )[0]
    : null;
  return { marketIdHash: hash, marketConfig, receivableMarket };
}

export function deriveGrpPdas(input: {
  requester: PublicKey;
  receivableId: string;
}) {
  const receivableIdBytes = uuidToBytes(input.receivableId);
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    GRP_PROGRAM_ID,
  );
  const [receivable] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("receivable"),
      input.requester.toBuffer(),
      Buffer.from(receivableIdBytes),
    ],
    GRP_PROGRAM_ID,
  );
  const [payerAuthorization] = PublicKey.findProgramAddressSync(
    [Buffer.from("payer-authorization"), receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [settlementVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("settlement-vault"), receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  return { config, receivable, payerAuthorization, settlementVault };
}

export async function buildPayerConfirmationTransaction(input: {
  payer: PublicKey;
  requester: PublicKey;
  receivableId: string;
  authorizedAmount: bigint;
  payerCommitmentHash: Uint8Array;
}) {
  if (input.payerCommitmentHash.length !== 32) {
    throw new Error("Invalid payer commitment.");
  }

  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });

  const [configInfo, receivableInfo, payerBalance] = await Promise.all([
    connection.getAccountInfo(pdas.config, "confirmed"),
    connection.getAccountInfo(pdas.receivable, "confirmed"),
    connection.getBalance(input.payer, "confirmed"),
  ]);

  if (!configInfo) throw new Error("GRP_PROTOCOL_NOT_AVAILABLE_ON_DEVNET");
  if (!receivableInfo) throw new Error("GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET");
  if (payerBalance === 0) throw new Error("PAYER_NEEDS_DEVNET_SOL");

  const data = Buffer.concat([
    Buffer.from(RECORD_PAYER_CONFIRMATION_DISCRIMINATOR),
    Buffer.from(input.payerCommitmentHash),
    Buffer.from(u64le(input.authorizedAmount)),
  ]);

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.receivable, isSigner: false, isWritable: true },
      { pubkey: pdas.payerAuthorization, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.payer,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection,
    transaction,
    ...pdas,
    blockhash,
    lastValidBlockHeight,
  };
}


export async function buildCreatePoolTransaction(input: {
  requester: PublicKey;
  receivableId: string;
  marketSlug: string;
  usdcMint: PublicKey;
  targetAmountUsdcMinor: bigint;
  minimumPartialBps: number;
  discountBps: number;
  fundingDeadlineUnix: bigint;
}) {
  if (input.minimumPartialBps < 0 || input.minimumPartialBps > 10_000) {
    throw new Error("INVALID_MINIMUM_PARTIAL_BPS");
  }
  if (input.discountBps < 0 || input.discountBps > 10_000) {
    throw new Error("INVALID_DISCOUNT_BPS");
  }

  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), pdas.receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [poolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool-vault"), pool.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const market = await deriveMarketPdas({
    marketSlug: input.marketSlug,
    receivable: pdas.receivable,
  });
  if (!market.receivableMarket) throw new Error("GRP_RECEIVABLE_MARKET_PDA_FAILED");

  const [configInfo, marketInfo, receivableInfo, existingPool, payerBalance] = await Promise.all([
    connection.getAccountInfo(pdas.config, "confirmed"),
    connection.getAccountInfo(market.marketConfig, "confirmed"),
    connection.getAccountInfo(pdas.receivable, "confirmed"),
    connection.getAccountInfo(pool, "confirmed"),
    connection.getBalance(input.requester, "confirmed"),
  ]);

  if (!configInfo) throw new Error("GRP_PROTOCOL_NOT_AVAILABLE_ON_DEVNET");
  if (!marketInfo) throw new Error("GRP_MARKET_NOT_INITIALIZED_ON_DEVNET");
  if (!receivableInfo) throw new Error("GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET");
  if (existingPool) throw new Error("GRP_POOL_ALREADY_EXISTS");
  if (payerBalance === 0) throw new Error("REQUESTER_NEEDS_DEVNET_SOL");

  const data = Buffer.concat([
    Buffer.from(await anchorDiscriminator("create_pool")),
    Buffer.from(u64le(input.targetAmountUsdcMinor)),
    Buffer.from(Uint8Array.of(
      input.minimumPartialBps & 0xff,
      (input.minimumPartialBps >> 8) & 0xff,
    )),
    Buffer.from(Uint8Array.of(
      input.discountBps & 0xff,
      (input.discountBps >> 8) & 0xff,
    )),
    Buffer.from(i64le(input.fundingDeadlineUnix)),
  ]);

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: market.marketConfig, isSigner: false, isWritable: false },
      { pubkey: market.receivableMarket, isSigner: false, isWritable: true },
      { pubkey: pdas.receivable, isSigner: false, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: poolVault, isSigner: false, isWritable: true },
      { pubkey: input.requester, isSigner: true, isWritable: true },
      { pubkey: input.usdcMint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.requester,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection,
    transaction,
    pool,
    poolVault,
    marketConfig: market.marketConfig,
    receivableMarket: market.receivableMarket,
    blockhash,
    lastValidBlockHeight,
  };
}


export async function buildFundPoolTransaction(input: {
  investor: PublicKey;
  requester: PublicKey;
  receivableId: string;
  usdcMint: PublicKey;
  amountUsdcMinor: bigint;
}) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), pdas.receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [poolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool-vault"), pool.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [contribution] = PublicKey.findProgramAddressSync(
    [Buffer.from("contribution"), pool.toBuffer(), input.investor.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const investorTokenAccount = await getAssociatedTokenAddress(
    input.usdcMint,
    input.investor,
  );

  const [
    configInfo,
    receivableInfo,
    poolInfo,
    contributionInfo,
    investorTokenInfo,
    investorSolBalance,
  ] = await Promise.all([
    connection.getAccountInfo(pdas.config, "confirmed"),
    connection.getAccountInfo(pdas.receivable, "confirmed"),
    connection.getAccountInfo(pool, "confirmed"),
    connection.getAccountInfo(contribution, "confirmed"),
    connection.getAccountInfo(investorTokenAccount, "confirmed"),
    connection.getBalance(input.investor, "confirmed"),
  ]);

  if (!configInfo) throw new Error("GRP_PROTOCOL_NOT_AVAILABLE_ON_DEVNET");
  if (!receivableInfo) throw new Error("GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET");
  if (!poolInfo) throw new Error("GRP_POOL_NOT_FOUND_ON_DEVNET");
  if (contributionInfo) throw new Error("GRP_INVESTOR_ALREADY_FUNDED_POOL");
  if (!investorTokenInfo) throw new Error("INVESTOR_USDC_ACCOUNT_NOT_FOUND");
  if (investorSolBalance === 0) throw new Error("INVESTOR_NEEDS_DEVNET_SOL");
  if (investorTokenInfo.data.length < 72) throw new Error("INVALID_USDC_TOKEN_ACCOUNT");

  const investorUsdcBalance = investorTokenInfo.data.readBigUInt64LE(64);
  if (investorUsdcBalance < input.amountUsdcMinor) {
    throw new Error("INSUFFICIENT_DEVNET_USDC");
  }

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.receivable, isSigner: false, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: contribution, isSigner: false, isWritable: true },
      { pubkey: input.investor, isSigner: true, isWritable: true },
      { pubkey: input.usdcMint, isSigner: false, isWritable: false },
      { pubkey: investorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: poolVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from(await anchorDiscriminator("fund_pool")),
      Buffer.from(u64le(input.amountUsdcMinor)),
    ]),
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.investor,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection,
    transaction,
    pool,
    poolVault,
    contribution,
    investorTokenAccount,
    investorUsdcBalance,
    blockhash,
    lastValidBlockHeight,
  };
}


export async function buildAcceptPartialFundingTransaction(input: {
  requester: PublicKey;
  receivableId: string;
}) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), pdas.receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );

  const [poolInfo, requesterBalance] = await Promise.all([
    connection.getAccountInfo(pool, "confirmed"),
    connection.getBalance(input.requester, "confirmed"),
  ]);
  if (!poolInfo) throw new Error("GRP_POOL_NOT_FOUND_ON_DEVNET");
  if (requesterBalance === 0) throw new Error("REQUESTER_NEEDS_DEVNET_SOL");

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.receivable, isSigner: false, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: input.requester, isSigner: true, isWritable: true },
    ],
    data: Buffer.from(await anchorDiscriminator("accept_partial_funding")),
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.requester,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return { connection, transaction, pool, blockhash, lastValidBlockHeight };
}

export async function buildDisbursePoolTransaction(input: {
  requester: PublicKey;
  receivableId: string;
  usdcMint: PublicKey;
}) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), pdas.receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [poolVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool-vault"), pool.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const requesterTokenAccount = await getAssociatedTokenAddress(
    input.usdcMint,
    input.requester,
  );

  const [poolInfo, requesterTokenInfo, requesterSolBalance] = await Promise.all([
    connection.getAccountInfo(pool, "confirmed"),
    connection.getAccountInfo(requesterTokenAccount, "confirmed"),
    connection.getBalance(input.requester, "confirmed"),
  ]);
  if (!poolInfo) throw new Error("GRP_POOL_NOT_FOUND_ON_DEVNET");
  if (requesterSolBalance === 0) throw new Error("REQUESTER_NEEDS_DEVNET_SOL");

  const transaction = new Transaction();

  if (!requesterTokenInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        input.requester,
        requesterTokenAccount,
        input.requester,
        input.usdcMint,
      ),
    );
  }

  transaction.add(
    new TransactionInstruction({
      programId: GRP_PROGRAM_ID,
      keys: [
        { pubkey: pdas.config, isSigner: false, isWritable: false },
        { pubkey: pdas.receivable, isSigner: false, isWritable: true },
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: input.requester, isSigner: true, isWritable: true },
        { pubkey: input.usdcMint, isSigner: false, isWritable: false },
        { pubkey: requesterTokenAccount, isSigner: false, isWritable: true },
        { pubkey: poolVault, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(await anchorDiscriminator("disburse_pool")),
    }),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = input.requester;
  transaction.recentBlockhash = blockhash;

  return {
    connection,
    transaction,
    pool,
    poolVault,
    requesterTokenAccount,
    blockhash,
    lastValidBlockHeight,
  };
}


export async function getPayerCommitmentStatus(input: {
  requester: PublicKey;
  receivableId: string;
}) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const account = await connection.getAccountInfo(
    pdas.payerAuthorization,
    "confirmed",
  );
  return {
    exists: Boolean(account),
    payerAuthorization: pdas.payerAuthorization,
  };
}

export async function buildManualRepaymentTransaction(input: {
  payer: PublicKey;
  requester: PublicKey;
  receivableId: string;
  usdcMint: PublicKey;
  amountUsdcMinor: bigint;
}) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), pdas.receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [passport] = PublicKey.findProgramAddressSync(
    [Buffer.from("passport"), input.requester.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const payerTokenAccount = await getAssociatedTokenAddress(
    input.usdcMint,
    input.payer,
  );
  const settlementVault = await getAssociatedTokenAddress(
    input.usdcMint,
    pdas.payerAuthorization,
    true,
  );

  const [
    receivableInfo,
    payerAuthorizationInfo,
    poolInfo,
    passportInfo,
    payerTokenInfo,
    settlementVaultInfo,
    payerSolBalance,
  ] = await Promise.all([
    connection.getAccountInfo(pdas.receivable, "confirmed"),
    connection.getAccountInfo(pdas.payerAuthorization, "confirmed"),
    connection.getAccountInfo(pool, "confirmed"),
    connection.getAccountInfo(passport, "confirmed"),
    connection.getAccountInfo(payerTokenAccount, "confirmed"),
    connection.getAccountInfo(settlementVault, "confirmed"),
    connection.getBalance(input.payer, "confirmed"),
  ]);

  if (!receivableInfo) throw new Error("GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET");
  if (!payerAuthorizationInfo) throw new Error("GRP_PAYER_COMMITMENT_NOT_FOUND");
  if (!poolInfo) throw new Error("GRP_POOL_NOT_FOUND_ON_DEVNET");
  if (!passportInfo) throw new Error("GRP_PASSPORT_NOT_FOUND_ON_DEVNET");
  if (!payerTokenInfo) throw new Error("PAYER_USDC_ACCOUNT_NOT_FOUND");
  if (settlementVaultInfo) throw new Error("GRP_SETTLEMENT_ALREADY_STARTED");
  if (payerSolBalance < 3_000_000) throw new Error("PAYER_NEEDS_MORE_DEVNET_SOL");

  const payerUsdcBalance = payerTokenInfo.data.readBigUInt64LE(64);
  if (payerUsdcBalance < input.amountUsdcMinor) {
    throw new Error("INSUFFICIENT_DEVNET_USDC");
  }

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.receivable, isSigner: false, isWritable: true },
      { pubkey: pdas.payerAuthorization, isSigner: false, isWritable: true },
      { pubkey: input.payer, isSigner: true, isWritable: true },
      { pubkey: input.usdcMint, isSigner: false, isWritable: false },
      { pubkey: payerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: settlementVault, isSigner: false, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: passport, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from(await anchorDiscriminator("manual_repayment")),
      Buffer.from(u64le(input.amountUsdcMinor)),
    ]),
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.payer,
    blockhash,
    lastValidBlockHeight,
  });

  if (!settlementVaultInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        input.payer,
        settlementVault,
        pdas.payerAuthorization,
        input.usdcMint,
      ),
    );
  }

  transaction.add(instruction);

  const simulation = await connection.simulateTransaction(transaction);
  if (simulation.value.err) {
    const logs = simulation.value.logs ?? [];
    const usefulLog =
      [...logs].reverse().find((line) =>
        line.includes("AnchorError") ||
        line.includes("Error Code:") ||
        line.includes("Program log: Error") ||
        line.includes("custom program error") ||
        line.includes("insufficient")
      ) ?? logs.at(-1) ?? JSON.stringify(simulation.value.err);
    throw new Error("GRP_REPAYMENT_SIMULATION_FAILED::" + usefulLog);
  }

  return {
    connection,
    transaction,
    receivable: pdas.receivable,
    payerAuthorization: pdas.payerAuthorization,
    settlementVault,
    payerTokenAccount,
    pool,
    passport,
    blockhash,
    lastValidBlockHeight,
  };
}

export async function buildClaimDistributionTransaction(input: {
  investor: PublicKey;
  requester: PublicKey;
  receivableId: string;
  usdcMint: PublicKey;
}) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), pdas.receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [contribution] = PublicKey.findProgramAddressSync(
    [Buffer.from("contribution"), pool.toBuffer(), input.investor.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const investorTokenAccount = await getAssociatedTokenAddress(
    input.usdcMint,
    input.investor,
  );
  const settlementVault = await getAssociatedTokenAddress(
    input.usdcMint,
    pdas.payerAuthorization,
    true,
  );

  const [contributionInfo, settlementVaultInfo, investorTokenInfo] =
    await Promise.all([
      connection.getAccountInfo(contribution, "confirmed"),
      connection.getAccountInfo(settlementVault, "confirmed"),
      connection.getAccountInfo(investorTokenAccount, "confirmed"),
    ]);

  if (!contributionInfo) throw new Error("GRP_CONTRIBUTION_NOT_FOUND_ON_DEVNET");
  if (!settlementVaultInfo) throw new Error("GRP_SETTLEMENT_VAULT_NOT_FOUND");
  if (!investorTokenInfo) throw new Error("INVESTOR_USDC_ACCOUNT_NOT_FOUND");

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.receivable, isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: contribution, isSigner: false, isWritable: true },
      { pubkey: pdas.payerAuthorization, isSigner: false, isWritable: false },
      { pubkey: input.investor, isSigner: true, isWritable: false },
      { pubkey: input.usdcMint, isSigner: false, isWritable: false },
      { pubkey: investorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: settlementVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(await anchorDiscriminator("claim_distribution")),
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.investor,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection,
    transaction,
    contribution,
    investorTokenAccount,
    settlementVault,
    blockhash,
    lastValidBlockHeight,
  };
}



export async function buildClaimSettlementResidualTransaction(input: {
  requester: PublicKey;
  receivableId: string;
  marketSlug: string;
  usdcMint: PublicKey;
}) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), pdas.receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [settlementDistribution] = PublicKey.findProgramAddressSync(
    [Buffer.from("settlement-distribution"), pool.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const market = await deriveMarketPdas({
    marketSlug: input.marketSlug,
    receivable: pdas.receivable,
  });
  if (!market.receivableMarket) throw new Error("GRP_RECEIVABLE_MARKET_PDA_FAILED");

  const [configInfo, marketInfo, receivableMarketInfo, receivableInfo, poolInfo, distributionInfo, requesterSol] =
    await Promise.all([
      connection.getAccountInfo(pdas.config, "confirmed"),
      connection.getAccountInfo(market.marketConfig, "confirmed"),
      connection.getAccountInfo(market.receivableMarket, "confirmed"),
      connection.getAccountInfo(pdas.receivable, "confirmed"),
      connection.getAccountInfo(pool, "confirmed"),
      connection.getAccountInfo(settlementDistribution, "confirmed"),
      connection.getBalance(input.requester, "confirmed"),
    ]);

  if (!configInfo || configInfo.data.length < 72) {
    throw new Error("GRP_PROTOCOL_NOT_AVAILABLE_ON_DEVNET");
  }
  if (!marketInfo || marketInfo.data.length < 134) {
    throw new Error("GRP_MARKET_NOT_INITIALIZED_ON_DEVNET");
  }
  if (!receivableMarketInfo) {
    throw new Error("GRP_RECEIVABLE_MARKET_NOT_BOUND");
  }
  if (!receivableInfo || receivableInfo.data.length < 88) {
    throw new Error("GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET");
  }
  if (!poolInfo) throw new Error("GRP_POOL_NOT_FOUND_ON_DEVNET");
  if (distributionInfo) throw new Error("GRP_SETTLEMENT_RESIDUAL_ALREADY_CLAIMED");
  if (requesterSol === 0) throw new Error("REQUESTER_NEEDS_DEVNET_SOL");

  const protocolTreasury = new PublicKey(configInfo.data.subarray(40, 72));
  const marketTreasury = new PublicKey(marketInfo.data.subarray(72, 104));

  const requesterTokenAccount = await getAssociatedTokenAddress(
    input.usdcMint,
    input.requester,
  );
  const marketTokenAccount = await getAssociatedTokenAddress(
    input.usdcMint,
    marketTreasury,
  );
  const protocolTokenAccount = await getAssociatedTokenAddress(
    input.usdcMint,
    protocolTreasury,
  );
  const settlementVault = await getAssociatedTokenAddress(
    input.usdcMint,
    pdas.payerAuthorization,
    true,
  );

  const [
    requesterTokenInfo,
    marketTokenInfo,
    protocolTokenInfo,
    settlementVaultInfo,
  ] = await Promise.all([
    connection.getAccountInfo(requesterTokenAccount, "confirmed"),
    connection.getAccountInfo(marketTokenAccount, "confirmed"),
    connection.getAccountInfo(protocolTokenAccount, "confirmed"),
    connection.getAccountInfo(settlementVault, "confirmed"),
  ]);

  if (!settlementVaultInfo) throw new Error("GRP_SETTLEMENT_VAULT_NOT_FOUND");

  const transaction = new Transaction();

  if (!requesterTokenInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        input.requester,
        requesterTokenAccount,
        input.requester,
        input.usdcMint,
      ),
    );
  }
  if (!marketTokenInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        input.requester,
        marketTokenAccount,
        marketTreasury,
        input.usdcMint,
      ),
    );
  }
  if (!protocolTokenInfo && !protocolTokenAccount.equals(marketTokenAccount)) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        input.requester,
        protocolTokenAccount,
        protocolTreasury,
        input.usdcMint,
      ),
    );
  }

  transaction.add(
    new TransactionInstruction({
      programId: GRP_PROGRAM_ID,
      keys: [
        { pubkey: pdas.config, isSigner: false, isWritable: false },
        { pubkey: market.marketConfig, isSigner: false, isWritable: false },
        { pubkey: market.receivableMarket, isSigner: false, isWritable: false },
        { pubkey: pdas.receivable, isSigner: false, isWritable: false },
        { pubkey: pool, isSigner: false, isWritable: false },
        { pubkey: pdas.payerAuthorization, isSigner: false, isWritable: false },
        { pubkey: input.requester, isSigner: true, isWritable: true },
        { pubkey: input.usdcMint, isSigner: false, isWritable: false },
        { pubkey: settlementVault, isSigner: false, isWritable: true },
        { pubkey: settlementDistribution, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: requesterTokenAccount, isSigner: false, isWritable: true },
        { pubkey: marketTokenAccount, isSigner: false, isWritable: true },
        { pubkey: protocolTokenAccount, isSigner: false, isWritable: true },
      ],
      data: Buffer.from(await anchorDiscriminator("claim_settlement_residual")),
    }),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = input.requester;
  transaction.recentBlockhash = blockhash;

  return {
    connection,
    transaction,
    settlementDistribution,
    requesterTokenAccount,
    marketTokenAccount,
    protocolTokenAccount,
    marketTreasury,
    protocolTreasury,
    blockhash,
    lastValidBlockHeight,
  };
}

export async function buildProcessDelinquencyTransaction(input: {
  feePayer: PublicKey;
  requester: PublicKey;
  receivableId: string;
}) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [pool] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), pdas.receivable.toBuffer()],
    GRP_PROGRAM_ID,
  );
  const [passport] = PublicKey.findProgramAddressSync(
    [Buffer.from("passport"), input.requester.toBuffer()],
    GRP_PROGRAM_ID,
  );

  const [receivableInfo, poolInfo, payerAuthorizationInfo, passportInfo, feeBalance] =
    await Promise.all([
      connection.getAccountInfo(pdas.receivable, "confirmed"),
      connection.getAccountInfo(pool, "confirmed"),
      connection.getAccountInfo(pdas.payerAuthorization, "confirmed"),
      connection.getAccountInfo(passport, "confirmed"),
      connection.getBalance(input.feePayer, "confirmed"),
    ]);

  if (!receivableInfo) throw new Error("GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET");
  if (!poolInfo) throw new Error("GRP_POOL_NOT_FOUND_ON_DEVNET");
  if (!payerAuthorizationInfo) throw new Error("GRP_PAYER_COMMITMENT_NOT_FOUND");
  if (!passportInfo) throw new Error("GRP_PASSPORT_NOT_FOUND_ON_DEVNET");
  if (feeBalance === 0) throw new Error("DELINQUENCY_KEEPER_NEEDS_DEVNET_SOL");

  const dueAtUnix = receivableInfo.data.readBigInt64LE(299);
  const nowUnix = BigInt(Math.floor(Date.now() / 1000));
  if (nowUnix < dueAtUnix + 86_400n) {
    throw new Error("DELINQUENCY_WINDOW_NOT_REACHED");
  }

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.receivable, isSigner: false, isWritable: true },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: pdas.payerAuthorization, isSigner: false, isWritable: true },
      { pubkey: passport, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(await anchorDiscriminator("process_delinquency")),
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.feePayer,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection,
    transaction,
    receivable: pdas.receivable,
    pool,
    payerAuthorization: pdas.payerAuthorization,
    passport,
    blockhash,
    lastValidBlockHeight,
  };
}

export async function payerCommitmentHash(input: {
  receivableId: string;
  amountUsdcMinor: bigint;
  dueAt: string;
  usdcMint: string;
}) {
  const payload = new TextEncoder().encode(
    [
      "GRP:PAYER_COMMITMENT:v1",
      input.receivableId,
      input.amountUsdcMinor.toString(),
      input.dueAt,
      input.usdcMint,
      GRP_PROGRAM_ID.toBase58(),
    ].join("|"),
  );
  return new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
}


export type GrpValidationDecision = "NEEDS_INFORMATION" | "APPROVED" | "REJECTED";

function validationDecisionByte(decision: GrpValidationDecision) {
  if (decision === "NEEDS_INFORMATION") return 0;
  if (decision === "APPROVED") return 1;
  return 2;
}

export async function validationDecisionCommitment(input: {
  receivableId: string;
  decision: GrpValidationDecision;
  reason: string;
}) {
  const payload = new TextEncoder().encode(
    [
      "GRP:VALIDATION:v1",
      input.receivableId,
      input.decision,
      input.reason.trim(),
      GRP_PROGRAM_ID.toBase58(),
    ].join("|"),
  );
  return new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
}

export async function buildRecordValidationTransaction(input: {
  validator: PublicKey;
  requester: PublicKey;
  receivableId: string;
  decision: GrpValidationDecision;
  decisionCommitment: Uint8Array;
  rulesVersion?: number;
}) {
  if (input.decisionCommitment.length !== 32) {
    throw new Error("Invalid validation commitment.");
  }

  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [validation] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("validation"),
      pdas.receivable.toBuffer(),
      input.validator.toBuffer(),
    ],
    GRP_PROGRAM_ID,
  );

  const [configInfo, receivableInfo, payerAuthorizationInfo] = await Promise.all([
    connection.getAccountInfo(pdas.config, "confirmed"),
    connection.getAccountInfo(pdas.receivable, "confirmed"),
    connection.getAccountInfo(pdas.payerAuthorization, "confirmed"),
  ]);

  if (!configInfo) throw new Error("GRP_PROTOCOL_NOT_AVAILABLE_ON_DEVNET");
  if (!receivableInfo) throw new Error("GRP_RECEIVABLE_NOT_FOUND_ON_DEVNET");
  if (!payerAuthorizationInfo) {
    throw new Error("GRP_PAYER_AUTHORIZATION_NOT_FOUND_ON_DEVNET");
  }

  const data = Buffer.concat([
    Buffer.from(await anchorDiscriminator("record_validation")),
    Buffer.from([validationDecisionByte(input.decision)]),
    Buffer.from(input.decisionCommitment),
    Buffer.from(Uint8Array.of(
      (input.rulesVersion ?? 1) & 0xff,
      ((input.rulesVersion ?? 1) >> 8) & 0xff,
    )),
  ]);

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: pdas.config, isSigner: false, isWritable: false },
      { pubkey: pdas.receivable, isSigner: false, isWritable: true },
      { pubkey: validation, isSigner: false, isWritable: true },
      { pubkey: input.validator, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.validator,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection,
    transaction,
    validation,
    receivable: pdas.receivable,
    blockhash,
    lastValidBlockHeight,
  };
}


async function anchorDiscriminator(name: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`global:${name}`),
    ),
  );
  return digest.slice(0, 8);
}

function i64le(value: bigint) {
  const result = new Uint8Array(8);
  let encoded = value < 0 ? (1n << 64n) + value : value;
  for (let index = 0; index < 8; index += 1) {
    result[index] = Number(encoded & 0xffn);
    encoded >>= 8n;
  }
  return result;
}

export async function buildCreateReceivableTransaction(input: {
  requester: PublicKey;
  receivableId: string;
  originator: PublicKey;
  evidenceCommitment: Uint8Array;
  nominalAmountMinor: bigint;
  dueAtUnix: bigint;
}) {
  if (input.evidenceCommitment.length !== 32) {
    throw new Error("Invalid evidence commitment.");
  }

  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const receivableIdBytes = uuidToBytes(input.receivableId);
  const { config, receivable } = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });
  const [passport] = PublicKey.findProgramAddressSync(
    [Buffer.from("passport"), input.requester.toBuffer()],
    GRP_PROGRAM_ID,
  );

  const transaction = new Transaction();
  const passportInfo = await connection.getAccountInfo(passport, "confirmed");

  if (!passportInfo) {
    transaction.add(
      new TransactionInstruction({
        programId: GRP_PROGRAM_ID,
        keys: [
          { pubkey: passport, isSigner: false, isWritable: true },
          { pubkey: input.requester, isSigner: true, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(await anchorDiscriminator("initialize_passport")),
      }),
    );
  }

  const createData = Buffer.concat([
    Buffer.from(await anchorDiscriminator("create_receivable")),
    Buffer.from(receivableIdBytes),
    input.originator.toBuffer(),
    Buffer.from(input.evidenceCommitment),
    Buffer.from("USD"),
    Buffer.from(u64le(input.nominalAmountMinor)),
    Buffer.from(i64le(input.dueAtUnix)),
  ]);

  transaction.add(
    new TransactionInstruction({
      programId: GRP_PROGRAM_ID,
      keys: [
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: receivable, isSigner: false, isWritable: true },
        { pubkey: passport, isSigner: false, isWritable: true },
        { pubkey: input.requester, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: createData,
    }),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = input.requester;
  transaction.recentBlockhash = blockhash;

  return {
    connection,
    transaction,
    receivable,
    passport,
    lastValidBlockHeight,
    blockhash,
  };
}

export function hexToBytes(hex: string) {
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error("Invalid SHA-256 value.");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}


export async function getGrpProtocolStatus() {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const [config] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    GRP_PROGRAM_ID,
  );
  const account = await connection.getAccountInfo(config, "confirmed");
  if (!account) {
    return { initialized: false as const, config, connection };
  }
  if (account.data.length < 108) {
    throw new Error("GRP ProtocolConfig account has an unexpected size.");
  }
  const authority = new PublicKey(account.data.subarray(8, 40));
  const treasury = new PublicKey(account.data.subarray(40, 72));
  const usdcMint = new PublicKey(account.data.subarray(72, 104));
  const protocolVersion = account.data.readUInt16LE(104);
  const paused = account.data[106] === 1;
  return {
    initialized: true as const,
    config,
    connection,
    authority,
    treasury,
    usdcMint,
    protocolVersion,
    paused,
  };
}

export async function getGrpMarketConfigStatus(marketSlug: string) {
  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const derived = await deriveMarketPdas({ marketSlug });
  const account = await connection.getAccountInfo(derived.marketConfig, "confirmed");
  if (!account) {
    return {
      initialized: false as const,
      connection,
      marketConfig: derived.marketConfig,
      marketIdHash: derived.marketIdHash,
    };
  }
  if (account.data.length < 134) {
    throw new Error("GRP MarketConfig account has an unexpected size.");
  }

  return {
    initialized: true as const,
    connection,
    marketConfig: derived.marketConfig,
    marketIdHash: derived.marketIdHash,
    operator: new PublicKey(account.data.subarray(40, 72)),
    marketTreasury: new PublicKey(account.data.subarray(72, 104)),
    status: account.data[104] ?? 0,
    advanceBps: account.data.readUInt16LE(105),
    minimumPartialBps: account.data.readUInt16LE(107),
    investorReturnBps: account.data.readUInt16LE(109),
    marketFeeBps: account.data.readUInt16LE(111),
    protocolFeeBps: account.data.readUInt16LE(113),
    rulesVersion: account.data.readUInt16LE(115),
  };
}

export async function buildInitializeMarketTransaction(input: {
  authority: PublicKey;
  marketSlug: string;
  operator: PublicKey;
  marketTreasury: PublicKey;
  status: "PROPOSED" | "SANDBOX" | "ACTIVE" | "PAUSED" | "SUSPENDED" | "RETIRED";
  advanceBps: number;
  minimumPartialBps: number;
  investorReturnBps: number;
  marketFeeBps: number;
  protocolFeeBps: number;
  rulesVersion: number;
}) {
  const status = await getGrpMarketConfigStatus(input.marketSlug);
  if (status.initialized) throw new Error("GRP_MARKET_ALREADY_INITIALIZED");

  const statusIndex = {
    PROPOSED: 0,
    SANDBOX: 1,
    ACTIVE: 2,
    PAUSED: 3,
    SUSPENDED: 4,
    RETIRED: 5,
  }[input.status];

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: deriveGrpPdas({ requester: input.authority, receivableId: "00000000-0000-0000-0000-000000000000" }).config, isSigner: false, isWritable: false },
      { pubkey: status.marketConfig, isSigner: false, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from(await anchorDiscriminator("initialize_market")),
      Buffer.from(status.marketIdHash),
      input.operator.toBuffer(),
      input.marketTreasury.toBuffer(),
      Buffer.from([statusIndex]),
      Buffer.from(u16le(input.advanceBps)),
      Buffer.from(u16le(input.minimumPartialBps)),
      Buffer.from(u16le(input.investorReturnBps)),
      Buffer.from(u16le(input.marketFeeBps)),
      Buffer.from(u16le(input.protocolFeeBps)),
      Buffer.from(u16le(input.rulesVersion)),
    ]),
  });

  const { blockhash, lastValidBlockHeight } =
    await status.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.authority,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection: status.connection,
    transaction,
    marketConfig: status.marketConfig,
    blockhash,
    lastValidBlockHeight,
  };
}

export async function buildUpdateMarketTreasuryTransaction(input: {
  authority: PublicKey;
  marketSlug: string;
  newMarketTreasury: PublicKey;
}) {
  const market = await getGrpMarketConfigStatus(input.marketSlug);
  if (!market.initialized) throw new Error("GRP_MARKET_NOT_INITIALIZED_ON_DEVNET");
  if (market.marketTreasury.equals(input.newMarketTreasury)) {
    throw new Error("GRP_MARKET_TREASURY_ALREADY_SET");
  }

  const config = deriveGrpPdas({
    requester: input.authority,
    receivableId: "00000000-0000-0000-0000-000000000000",
  }).config;

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: market.marketConfig, isSigner: false, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from(await anchorDiscriminator("update_market_treasury")),
      input.newMarketTreasury.toBuffer(),
    ]),
  });

  const { blockhash, lastValidBlockHeight } =
    await market.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.authority,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection: market.connection,
    transaction,
    marketConfig: market.marketConfig,
    blockhash,
    lastValidBlockHeight,
  };
}

export async function buildInitializeProtocolTransaction(input: {
  authority: PublicKey;
  treasury: PublicKey;
  usdcMint: PublicKey;
}) {
  const status = await getGrpProtocolStatus();
  if (status.initialized) {
    throw new Error("GRP_PROTOCOL_ALREADY_INITIALIZED");
  }

  const instructionData = Buffer.concat([
    Buffer.from(await anchorDiscriminator("initialize_protocol")),
    input.usdcMint.toBuffer(),
    input.treasury.toBuffer(),
  ]);

  const instruction = new TransactionInstruction({
    programId: GRP_PROGRAM_ID,
    keys: [
      { pubkey: status.config, isSigner: false, isWritable: true },
      { pubkey: input.authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: instructionData,
  });

  const { blockhash, lastValidBlockHeight } =
    await status.connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: input.authority,
    blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  return {
    connection: status.connection,
    transaction,
    config: status.config,
    blockhash,
    lastValidBlockHeight,
  };
}
