import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedDashboard } from "./authenticated-dashboard";
import { createDemoReceivable, recordDemoContribution, resetDemoState } from "@/lib/demo-store";
import { publicPools } from "@/data/public-pools";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

describe("AuthenticatedDashboard", () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); replace.mockReset(); resetDemoState(); });

  it("shows the two primary flows and the profile history for an active session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LEGACY", history: [] }), { status: 200 });
    });
    render(<AuthenticatedDashboard />);
    expect(await screen.findByRole("heading", { name: /o que você quer fazer hoje/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /começar cadastro/i })).toHaveAttribute("href", "/recebivel");
    expect(screen.getByRole("link", { name: /explorar pools/i })).toHaveAttribute("href", "/pools");
    expect(screen.getByText("Meus recebíveis")).toBeInTheDocument();
    expect(screen.getByText("Meus aportes")).toBeInTheDocument();
    expect(screen.getByText(/um recebível ativo por vez/i)).toBeInTheDocument();
    expect(screen.getByText(/perfil profile-a/i)).toBeInTheDocument();
  });

  it("redirects an anonymous visitor to wallet access", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 401 }));
    render(<AuthenticatedDashboard />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/entrar?next=/painel"));
  });

  it("não renderiza o bloco global de criação de pool no topo do painel", async () => {
    const approved = { receivableId: "r-approved", draftId: "d-1", privateStatus: "APPROVED", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Salário aprovado", nominalUsdCents: "200000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", nextStep: "CREATE_POOL" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LRP", active: approved, history: [approved] }), { status: 200 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    await screen.findByText("Salário aprovado");
    expect(screen.queryByRole("heading", { name: /Revisar termos calculados/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Consultar elegibilidade")).not.toBeInTheDocument();
  });

  it("APPROVED sem pool mostra Revisar termos e criar pool dentro do card do recebível", async () => {
    const approved = { receivableId: "r-approved", draftId: "d-1", privateStatus: "APPROVED", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Salário aprovado", nominalUsdCents: "200000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", nextStep: "CREATE_POOL" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LRP", active: approved, history: [approved] }), { status: 200 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    await screen.findByText("Salário aprovado");
    expect(screen.getByText(/Recebível aprovado/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revisar termos e criar pool" })).toBeVisible();
  });

  it("REJECTED não aparece na lista de recebíveis nem mostra CTA", async () => {
    const rejected = { receivableId: "r-rejected", draftId: "d-2", privateStatus: "REJECTED", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Recebível rejeitado", nominalUsdCents: "100000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", nextStep: "NONE" };
    const approved = { receivableId: "r-approved", draftId: "d-1", privateStatus: "APPROVED", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Salário aprovado", nominalUsdCents: "200000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", nextStep: "CREATE_POOL" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LRP", active: approved, history: [rejected, approved] }), { status: 200 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    await screen.findByText("Salário aprovado");
    expect(screen.queryByText("Recebível rejeitado")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Revisar termos e criar pool/i })).toHaveLength(1);
  });

  it("pool publicada mostra Pool criada e Ver pool com poolId real no card correto", async () => {
    const pooled = { receivableId: "r-pooled", draftId: "d-3", privateStatus: "POOLED", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Recebível com pool", nominalUsdCents: "200000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", nextStep: "VIEW_POOL", pool: { poolId: "real-pool-uuid-123", status: "PUBLISHED", canonicalSource: "LRP" } };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LRP", active: pooled, history: [pooled] }), { status: 200 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    await screen.findByText("Recebível com pool");
    expect(screen.getByText(/Pool criada/)).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Ver pool" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/pools/real-pool-uuid-123");
  });

  it("AWAITING_CLIENT mostra Aguardando confirmação do pagador", async () => {
    const awaiting = { receivableId: "r-await", draftId: "d-4", privateStatus: "AWAITING_CLIENT", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Aguardando pagador", nominalUsdCents: "200000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", confirmationUrl: "https://produto.test/confirmar#abc", nextStep: "SHARE_CONFIRMATION" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LRP", active: awaiting, history: [awaiting] }), { status: 200 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    expect(await screen.findByText(/Aguardando confirmação do pagador/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisar termos e criar pool/i })).not.toBeInTheDocument();
  });

  it("UNDER_VALIDATION mostra Em análise pela plataforma", async () => {
    const reviewing = { receivableId: "r-review", draftId: "d-5", privateStatus: "UNDER_VALIDATION", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Em análise", nominalUsdCents: "200000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", nextStep: "AWAIT_REVIEW" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LRP", active: reviewing, history: [reviewing] }), { status: 200 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    expect(await screen.findByText(/Em análise pela plataforma/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revisar termos e criar pool/i })).not.toBeInTheDocument();
  });

  it("outro recebível não recebe o CTA de pool", async () => {
    const approved = { receivableId: "r-approved", draftId: "d-1", privateStatus: "APPROVED", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Salário aprovado", nominalUsdCents: "200000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", nextStep: "CREATE_POOL" };
    const reviewing = { receivableId: "r-review", draftId: "d-5", privateStatus: "UNDER_VALIDATION", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Em análise", nominalUsdCents: "100000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", nextStep: "AWAIT_REVIEW" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LRP", active: approved, history: [reviewing, approved] }), { status: 200 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    await screen.findByText("Salário aprovado");
    expect(screen.getAllByRole("button", { name: /Revisar termos e criar pool/i })).toHaveLength(1);
    const approvedCard = screen.getByText("Salário aprovado").closest("div");
    expect(approvedCard).toContainElement(screen.getByRole("button", { name: "Revisar termos e criar pool" }));
    const reviewCard = screen.getByText("Em análise").closest("div");
    expect(reviewCard).not.toContainElement(screen.queryByRole("button", { name: "Revisar termos e criar pool" }));
  });

  it("mostra o recebível PostgreSQL e ignora recebíveis e aportes locais em LRP", async () => {
    createDemoReceivable("profile-a", { purpose: "SERVICE", description: "Somente no navegador", amountUsd: 80, dueDate: "2026-08-20", payerName: "Local", payerCountry: "US", evidenceName: "local.pdf" });
    recordDemoContribution("profile-a", publicPools[0]!, 1_000, 1_050);
    const confirmationUrl = `https://produto.test/confirmar#${"a".repeat(43)}`;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const real = { receivableId: "real-1", draftId: "draft-1", privateStatus: "AWAITING_CLIENT", originationStatus: "PUBLISHED", canonicalSource: "LRP", title: "Salário internacional real", nominalUsdCents: "250000", dueAt: "2026-08-20T12:00:00.000Z", publicationStatus: "CONFIRMED", confirmationUrl, nextStep: "SHARE_CONFIRMATION" };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response(JSON.stringify({ source: "LRP", active: real, history: [real] }), { status: 200 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    expect(await screen.findByText("Salário internacional real")).toBeInTheDocument();
    const open = screen.getByRole("link", { name: /enviar confirmação ao pagador/i });
    expect(open).toHaveAttribute("href", confirmationUrl);
    expect(open).toHaveAttribute("target", "_blank");
    fireEvent.click(screen.getByRole("button", { name: /copiar link de confirmação/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(confirmationUrl));
    expect(screen.getByRole("button", { name: /link copiado/i })).toBeVisible();
    expect(screen.getByText(/aportes ainda não estão disponíveis/i)).toBeInTheDocument();
    expect(screen.queryByText("Somente no navegador")).not.toBeInTheDocument();
    expect(screen.queryByText(publicPools[0]!.title)).not.toBeInTheDocument();
  });

  it("não oferece fallback local quando o histórico LRP está indisponível", async () => {
    createDemoReceivable("profile-a", { purpose: "SERVICE", description: "Somente no navegador", amountUsd: 80, dueDate: "2026-08-20", payerName: "Local", payerCountry: "US", evidenceName: "local.pdf" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url === "/api/auth/session"
        ? new Response(JSON.stringify({ authenticated: true, profile: { id: "profile-a", label: "Perfil profile-a" } }), { status: 200 })
        : new Response("{}", { status: 503 });
    });
    render(<AuthenticatedDashboard lrpMode="LRP" />);
    expect(await screen.findByRole("heading", { name: /histórico indisponível/i })).toBeInTheDocument();
    expect(screen.queryByText("Somente no navegador")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /criar recebível/i })).not.toBeInTheDocument();
  });
});
