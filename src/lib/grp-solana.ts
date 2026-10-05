"use client";

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
  publicKey?: PublicKey;
  connect(): Promise<{ publicKey: PublicKey }>;
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
