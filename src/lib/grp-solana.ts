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

export const GRP_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_GRP_PROGRAM_ID ??
    "CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY",
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
  usdcMint: PublicKey;
  authorizedAmount: bigint;
  payerCommitmentHash: Uint8Array;
}) {
  if (input.payerCommitmentHash.length !== 32) {
    throw new Error("Invalid payer commitment.");
  }

  const connection = new Connection(GRP_RPC_URL, "confirmed");
  const payerTokenAccount = await getAssociatedTokenAddress(
    input.usdcMint,
    input.payer,
  );
  const pdas = deriveGrpPdas({
    requester: input.requester,
    receivableId: input.receivableId,
  });

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
      { pubkey: input.usdcMint, isSigner: false, isWritable: false },
      { pubkey: pdas.settlementVault, isSigner: false, isWritable: true },
      { pubkey: payerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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

  return { connection, transaction, payerTokenAccount, ...pdas };
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
