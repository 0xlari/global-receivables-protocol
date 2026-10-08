"use client";

import { Buffer } from "buffer";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

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
