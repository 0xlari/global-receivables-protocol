import { expect, test } from "@playwright/test";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";

import { buildReceivableCreated } from "../packages/protocol/src/builders";
import { validContentVectors } from "../packages/protocol/src/test-vectors/valid";
import { createNostrChallenge } from "../src/domain/nostr-auth";

test("NIP-07 login and LRP signing keep one Nostr identity", async ({ page }) => {
  test.skip(process.env.LRP_ORIGINATION_MODE !== "LRP", "executado na validação dedicada do login Nostr com LRP");
  const secret = generateSecretKey();
  const pubkey = getPublicKey(secret);
  const otherPubkey = getPublicKey(generateSecretKey());
  let authenticated = false;
  let state: "EMPTY" | "DRAFT" | "CANDIDATE" | "PUBLISHED" = "EMPTY";
  const vector = validContentVectors.find((item) => item.content.event_type === "ReceivableCreated");
  if (!vector || vector.content.event_type !== "ReceivableCreated") throw new Error("ReceivableCreated test vector not found");
  const candidate = buildReceivableCreated({ ...vector.content, provider_pubkey: pubkey });

  await page.exposeFunction("__signNostrEvent", (event: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(event, secret));
  await page.addInitScript(({ initialPubkey }) => {
    const source = window as typeof window & { __nostrPubkey?: string; __signNostrEvent?: (event: unknown) => Promise<unknown>; nostr?: unknown };
    source.__nostrPubkey = initialPubkey;
    source.nostr = {
      getPublicKey: async () => source.__nostrPubkey!,
      signEvent: async (event: unknown) => source.__signNostrEvent!(event),
    };
  }, { initialPubkey: pubkey });

  await page.route("**/api/auth/session", async (route) => route.fulfill({
    status: authenticated ? 200 : 401,
    contentType: "application/json",
    body: JSON.stringify(authenticated
      ? { authenticated: true, profile: { id: "nostr-e2e-profile", label: "Perfil Nostr", nostrPubkey: pubkey } }
      : { authenticated: false }),
  }));
  await page.route("**/api/auth/nostr/challenge", async (route) => {
    const challenge = createNostrChallenge(pubkey, "http://127.0.0.1:3000/api/auth/nostr/complete", new Date(), "LOGIN");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ challengeId: challenge.id, event: challenge.event }) });
  });
  await page.route("**/api/auth/nostr/complete", async (route) => {
    authenticated = true;
    await route.fulfill({ status: 200, contentType: "application/json", headers: { "set-cookie": "erh_session=e2e-token; Path=/; HttpOnly; SameSite=Lax" }, body: JSON.stringify({ authenticated: true }) });
  });
  await page.route("**/api/receivables", async (route) => {
    if (route.request().method() === "GET") {
      const active = state === "EMPTY" ? undefined : {
        receivableId: "receivable-nostr-e2e", draftId: "draft-nostr-e2e", privateStatus: "DRAFT",
        originationStatus: state === "PUBLISHED" ? "PUBLISHED" : state === "CANDIDATE" ? "CANDIDATE_READY" : "PRIVATE_DRAFT",
        canonicalSource: state === "PUBLISHED" ? "LRP" : "LEGACY", title: "Recebível Nostr", nominalUsdCents: "10000",
        dueAt: "2027-01-20T12:00:00.000Z", nextStep: state === "PUBLISHED" ? "SHARE_CONFIRMATION" : state === "CANDIDATE" ? "SIGN_RECEIVABLE" : "CONNECT_IDENTITY",
        candidate: state === "CANDIDATE" ? candidate : undefined,
        confirmationUrl: state === "PUBLISHED" ? "http://127.0.0.1:3000/confirmar?token=private" : undefined,
      };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ source: "LRP", active, history: [] }) });
    }
    const body = route.request().postDataJSON() as { action: string };
    if (body.action === "create_private") {
      state = "DRAFT";
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ draftId: "draft-nostr-e2e", receivableId: "receivable-nostr-e2e", status: "PRIVATE_DRAFT" }) });
    }
    if (body.action === "prepare_candidate") {
      state = "CANDIDATE";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ draftId: "draft-nostr-e2e", receivableId: "receivable-nostr-e2e", status: "CANDIDATE_READY", candidate }) });
    }
    state = "PUBLISHED";
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ draftId: "draft-nostr-e2e", receivableId: "receivable-nostr-e2e", status: "PUBLISHED", publicationStatus: "CONFIRMED", confirmationUrl: "http://127.0.0.1:3000/confirmar?token=private" }) });
  });

  await page.goto("/entrar");
  await page.getByRole("button", { name: "Entrar com Nostr" }).click();
  await expect(page).toHaveURL(/\/painel$/);
  await page.goto("/recebivel");
  const dueDate = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Data combinada").fill(dueDate);
  await page.getByRole("button", { name: "Salvar e revisar informações públicas" }).click();
  await expect(page.getByRole("heading", { name: "Somente estes dados serão públicos." })).toBeVisible();
  await page.getByRole("button", { name: "Assinar e publicar" }).click();
  await expect(page.getByRole("heading", { name: /registro público foi confirmado/i })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /registro público foi confirmado/i })).toBeVisible();

  state = "CANDIDATE";
  await page.evaluate((nextPubkey) => { (window as typeof window & { __nostrPubkey?: string }).__nostrPubkey = nextPubkey; }, otherPubkey);
  await page.reload();
  await page.getByRole("button", { name: "Assinar e publicar" }).click();
  await expect(page.getByRole("alert")).toContainText("A identidade usada não corresponde à sessão atual.");
});
