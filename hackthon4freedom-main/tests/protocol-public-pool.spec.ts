import { expect, test } from "@playwright/test";

test("outro navegador reconstrói a pool assinada em desktop e mobile", async ({ page }) => {
  const id = "a".repeat(64);
  await page.route(`**/api/protocol/pools/${id}`, async (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ pool: { state: "PUBLISHED", latestEventId: id, terms: { title: "Pagamento internacional", provider_pseudonym: "Criadora 21", target_sats: "100000", original_currency: "USD", due_at: 1800000000, expected_return_bps: 350, discount_bps: 500, originator_pubkey: "b".repeat(64), public_reputation_facts: [] } }, progressBps: 0, events: [{ id, kind: 8105, pubkey: "c".repeat(64), sig: "d".repeat(128), observedOn: ["wss://relay-a.example", "wss://relay-b.example"] }], rejected: [], unavailableRelays: ["wss://relay-c.example"] }) }));
  await page.goto(`/protocolo/pools/${id}`); await expect(page.getByRole("heading", { name: "Pagamento internacional" })).toBeVisible(); await expect(page.getByText("Reconstruída do Nostr.")).toBeVisible(); await expect(page.getByText(/relay-a.example/)).toHaveText(/relay-a.example/);
});
