import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildProtocolEvent } from "@protocol/builders";
import type { ProtocolKind } from "@protocol/kinds";
import { validContentVectors } from "@protocol/test-vectors/valid";
import {
  confirmDemoReceivable,
  createDemoReceivable,
  resetDemoState,
  reviewDemoReceivable,
} from "@/lib/demo-store";
import { ReceivableDemoForm } from "./receivable-demo-form";

const session = { authenticated: true, profile: { id: "wallet-profile", label: "Carteira", nostrPubkey: "1".repeat(64) } };
const candidateVector = validContentVectors[1]!;
const candidate = buildProtocolEvent(candidateVector.kind as ProtocolKind, candidateVector.content);

function localPooledReceivable() {
  const created = createDemoReceivable("wallet-profile", {
    purpose: "SERVICE",
    description: "Recebível somente local",
    amountUsd: 100,
    dueDate: "2026-08-20",
    payerName: "Cliente local",
    payerCountry: "US",
    evidenceName: "local.pdf",
  });
  confirmDemoReceivable(created.token, true);
  reviewDemoReceivable(created.id, "APPROVE");
}

function mockJourney(body: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === "/api/auth/session") return new Response(JSON.stringify(session), { status: 200 });
    if (url === "/api/receivables") return new Response(JSON.stringify(body), { status });
    throw new Error(`unexpected request: ${url}`);
  });
}

describe("retomada do recebível no produto", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetDemoState();
    Reflect.deleteProperty(window, "nostr");
  });

  it("ignora pool local e retoma o draft privado do PostgreSQL", async () => {
    localPooledReceivable();
    mockJourney({
      source: "LRP",
      active: { receivableId: "real-1", draftId: "draft-1", privateStatus: "DRAFT", originationStatus: "PRIVATE_DRAFT", canonicalSource: "LEGACY", title: "Recebível real", nominalUsdCents: "10000", dueAt: "2026-08-20T12:00:00.000Z", nextStep: "CONNECT_IDENTITY" },
      history: [],
    });
    render(<ReceivableDemoForm lrpMode="LRP" />);
    expect(await screen.findByRole("heading", { name: /revise as informações públicas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revisar e autorizar publicação/i })).toBeVisible();
    expect(screen.queryByText(/sua pool btc foi criada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/recebível somente local/i)).not.toBeInTheDocument();
  });

  it.each([
    ["CANDIDATE_READY", /assinar e publicar/i],
    ["PUBLICATION_PENDING", /repetir publicação/i],
  ])("retoma %s com a ação correta", async (status, buttonName) => {
    mockJourney({
      source: "LRP",
      active: { receivableId: "real-2", draftId: "draft-2", privateStatus: "DRAFT", originationStatus: status, canonicalSource: "LEGACY", title: "Recebível real", nominalUsdCents: "10000", dueAt: "2026-08-20T12:00:00.000Z", candidate, publicEventId: status === "PUBLICATION_PENDING" ? "a".repeat(64) : undefined, publicationStatus: status === "PUBLICATION_PENDING" ? "PENDING" : undefined, nextStep: status === "PUBLICATION_PENDING" ? "RETRY_PUBLICATION" : "SIGN_RECEIVABLE" },
      history: [],
    });
    render(<ReceivableDemoForm lrpMode="LRP" />);
    expect(await screen.findByRole("button", { name: buttonName })).toBeInTheDocument();
  });

  it("não usa o estado local quando a leitura real falha", async () => {
    localPooledReceivable();
    mockJourney({ error: "offline" }, 503);
    render(<ReceivableDemoForm lrpMode="LRP" />);
    expect(await screen.findByRole("heading", { name: /não foi possível carregar seu recebível/i })).toBeInTheDocument();
    expect(screen.queryByText(/sua pool btc foi criada/i)).not.toBeInTheDocument();
  });

  it("preserva o fluxo local explícito em LEGACY", async () => {
    localPooledReceivable();
    mockJourney({ source: "LEGACY", history: [] });
    render(<ReceivableDemoForm lrpMode="LEGACY" />);
    expect(await screen.findByRole("heading", { name: /sua pool btc foi criada/i })).toBeInTheDocument();
  });

  it("blocks a signer whose pubkey differs from the authenticated Nostr identity", async () => {
    Object.defineProperty(window, "nostr", { configurable: true, value: {
      getPublicKey: vi.fn().mockResolvedValue("2".repeat(64)),
      signEvent: vi.fn(),
    } });
    mockJourney({
      source: "LRP",
      active: { receivableId: "real-3", draftId: "draft-3", privateStatus: "DRAFT", originationStatus: "PRIVATE_DRAFT", canonicalSource: "LEGACY", title: "Recebível real", nominalUsdCents: "10000", dueAt: "2026-08-20T12:00:00.000Z", nextStep: "CONNECT_IDENTITY" },
      history: [],
    });
    render(<ReceivableDemoForm lrpMode="LRP" />);
    fireEvent.click(await screen.findByRole("button", { name: /revisar e autorizar publicação/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A identidade usada não corresponde à sessão atual.");
  });
});
