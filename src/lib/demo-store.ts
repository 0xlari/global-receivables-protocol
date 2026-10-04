"use client";

import type { PublicPool } from "@/data/public-pools";

const STORAGE_PREFIX = "erh-hackathon-demo-v2:";
export const DEMO_CHANGED_EVENT = "erh:demo-changed";

export type DemoReceivableStatus = "AWAITING_CLIENT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "POOLED";

export type DemoReceivable = {
  id: string;
  token: string;
  purpose: "SERVICE" | "SALARY" | "SALE" | "COMMISSION" | "OTHER";
  description: string;
  amountUsd: number;
  dueDate: string;
  payerName: string;
  payerCountry: string;
  evidenceName: string;
  status: DemoReceivableStatus;
  createdAt: string;
  payerAcceptedBtc?: boolean;
  payerPaymentMethod?: "NWC_AUTOMATIC" | "MANUAL";
  payerPaymentStatus?: string;
  nwcWalletLabel?: string;
};

export type DemoContribution = {
  id: string;
  poolId: string;
  poolTitle: string;
  amountSats: number;
  expectedSats: number;
  createdAt: string;
};

type DemoState = {
  receivables: DemoReceivable[];
  pools: PublicPool[];
  contributions: DemoContribution[];
};

const emptyState = (): DemoState => ({ receivables: [], pools: [], contributions: [] });

function storageKey(profileId: string) {
  if (!profileId.trim()) throw new Error("Perfil da carteira ausente.");
  return `${STORAGE_PREFIX}${profileId}`;
}

function readState(profileId: string): DemoState {
  if (typeof window === "undefined") return emptyState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(profileId)) ?? "null") as DemoState | null;
    return parsed && Array.isArray(parsed.receivables) && Array.isArray(parsed.pools) && Array.isArray(parsed.contributions)
      ? parsed
      : emptyState();
  } catch {
    return emptyState();
  }
}

function writeState(profileId: string, state: DemoState) {
  window.localStorage.setItem(storageKey(profileId), JSON.stringify(state));
  window.dispatchEvent(new Event(DEMO_CHANGED_EVENT));
}

function profileIds() {
  if (typeof window === "undefined") return [];
  return Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith(STORAGE_PREFIX)))
    .map((key) => key.slice(STORAGE_PREFIX.length));
}

function allProfileStates() {
  return profileIds().map((profileId) => ({ profileId, state: readState(profileId) }));
}

export function getDemoState(profileId: string) {
  return readState(profileId);
}

export function getDemoPlatformState(): DemoState {
  return allProfileStates().reduce<DemoState>((result, { state }) => ({
    receivables: [...result.receivables, ...state.receivables],
    pools: [...result.pools, ...state.pools],
    contributions: [...result.contributions, ...state.contributions],
  }), emptyState());
}

export function resetDemoState(profileId?: string) {
  if (profileId) {
    writeState(profileId, emptyState());
    return;
  }
  for (const id of profileIds()) window.localStorage.removeItem(storageKey(id));
  window.dispatchEvent(new Event(DEMO_CHANGED_EVENT));
}

export function createDemoReceivable(profileId: string, input: Omit<DemoReceivable, "id" | "token" | "status" | "createdAt">) {
  const state = readState(profileId);
  const active = state.receivables.some((item) => !["REJECTED"].includes(item.status));
  if (active) throw new Error("Você já possui um recebível ativo nesta demonstração.");
  const receivable: DemoReceivable = {
    ...input,
    id: `r_${crypto.randomUUID().slice(0, 8)}`,
    token: crypto.randomUUID(),
    status: "AWAITING_CLIENT",
    createdAt: new Date().toISOString(),
  };
  state.receivables.unshift(receivable);
  writeState(profileId, state);
  return receivable;
}

export function findDemoReceivableByToken(token: string) {
  for (const { state } of allProfileStates()) {
    const receivable = state.receivables.find((item) => item.token === token);
    if (receivable) return receivable;
  }
}

export function confirmDemoReceivable(token: string, acceptsBtc: boolean) {
  const owner = allProfileStates().find(({ state }) => state.receivables.some((item) => item.token === token));
  const receivable = owner?.state.receivables.find((item) => item.token === token);
  if (!receivable || receivable.status !== "AWAITING_CLIENT") throw new Error("Link inválido ou já utilizado.");
  receivable.payerAcceptedBtc = acceptsBtc;
  receivable.status = acceptsBtc ? "UNDER_REVIEW" : "REJECTED";
  writeState(owner!.profileId, owner!.state);
  return receivable;
}

export function setDemoPayerPayment(receivableId: string, method: "NWC_AUTOMATIC" | "MANUAL", status: string, walletLabel?: string) {
  const owner = allProfileStates().find(({ state }) => state.receivables.some((item) => item.id === receivableId));
  const receivable = owner?.state.receivables.find((item) => item.id === receivableId);
  if (!receivable) throw new Error("Recebível demonstrativo não encontrado.");
  receivable.payerPaymentMethod = method;
  receivable.payerPaymentStatus = status;
  receivable.nwcWalletLabel = walletLabel;
  writeState(owner!.profileId, owner!.state);
  return receivable;
}

export function reviewDemoReceivable(receivableId: string, decision: "APPROVE" | "REJECT") {
  const owner = allProfileStates().find(({ state }) => state.receivables.some((item) => item.id === receivableId));
  if (!owner) throw new Error("Recebível não aguarda avaliação.");
  const receivable = owner.state.receivables.find((item) => item.id === receivableId);
  if (!receivable || receivable.status !== "UNDER_REVIEW") throw new Error("Recebível não aguarda avaliação.");
  const state = owner.state;
  if (decision === "REJECT") {
    receivable.status = "REJECTED";
    writeState(owner.profileId, state);
    return { receivable };
  }

  const days = Math.max(1, Math.ceil((new Date(receivable.dueDate).getTime() - Date.now()) / 86_400_000));
  const discountBps = Math.min(500, days <= 15 ? 200 : days <= 30 ? 300 : days <= 60 ? 400 : 500);
  const advanceUsd = receivable.amountUsd * (1 - discountBps / 10_000);
  const targetSats = Math.max(1_000, Math.round((advanceUsd / 100_000) * 100_000_000));
  const pool: PublicPool = {
    id: `p_${crypto.randomUUID().slice(0, 8)}`,
    title: receivable.description,
    amount: `${targetSats.toLocaleString("pt-BR")} sats`,
    targetSats,
    fundedSats: 0,
    funded: 0,
    due: `em ${days} dias`,
    fundingDeadline: `${Math.max(1, Math.min(10, days - 1))} dias`,
    discount: `${(discountBps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1 })}%`,
    discountBps,
    coverage: 35,
    reputation: "Recebível confirmado e aprovado na demonstração",
    isDemo: true,
  };
  receivable.status = "POOLED";
  state.pools.unshift(pool);
  writeState(owner.profileId, state);
  return { receivable, pool };
}

export function findDemoPoolById(poolId: string) {
  for (const { state } of allProfileStates()) {
    const pool = state.pools.find((item) => item.id === poolId);
    if (pool) return pool;
  }
}

export function recordDemoContribution(profileId: string, pool: PublicPool, amountSats: number, expectedSats: number) {
  const state = readState(profileId);
  const contribution: DemoContribution = {
    id: `a_${crypto.randomUUID().slice(0, 8)}`,
    poolId: pool.id,
    poolTitle: pool.title,
    amountSats,
    expectedSats,
    createdAt: new Date().toISOString(),
  };
  state.contributions.unshift(contribution);
  const poolOwner = allProfileStates().find(({ state: candidate }) => candidate.pools.some((item) => item.id === pool.id));
  const poolState = poolOwner?.profileId === profileId ? state : poolOwner?.state;
  const storedPool = poolState?.pools.find((item) => item.id === pool.id);
  if (storedPool) {
    storedPool.fundedSats = Math.min(storedPool.targetSats, storedPool.fundedSats + amountSats);
    storedPool.funded = Math.round((storedPool.fundedSats / storedPool.targetSats) * 100);
    if (poolOwner!.profileId !== profileId) writeState(poolOwner!.profileId, poolOwner!.state);
  }
  writeState(profileId, state);
  return contribution;
}
