import { expect, test } from "@playwright/test";

const pool = {
  source: "LRP", poolId: "pool_public_e2e", eventId: "a".repeat(64), title: "Venda internacional verificada",
  providerPseudonym: "Criadora 21", publicReputation: ["identity_verified"], targetSats: "950000",
  originalCurrency: "USD", dueAt: 1_802_592_000, discountBps: 500, expectedReturnBps: 350,
  minimumPartialBps: 5000, fundingDeadline: 1_800_604_800, fixedLateFeeBps: 200,
  dailyLateInterestBps: 10, maximumPenaltyBps: 1000, originatorPubkey: "b".repeat(64),
  state: "PUBLISHED", progressBps: 0, relayConfirmations: 2, verified: true,
  projectedAt: "2027-01-15T08:00:00.000Z", issues: [],
};

test("lista uma pool LRP sem fixtures ou ação financeira", async ({ page }) => {
  test.skip(process.env.LRP_ORIGINATION_MODE !== "LRP", "executado na validação dedicada do modo LRP");
  await page.route("**/api/lrp/pools*", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ mode: "LRP", status: "READY", pools: [pool], issues: [] }),
  }));
  await page.goto("/pools");
  await expect(page.getByRole("heading", { name: pool.title })).toBeVisible();
  await expect(page.getByRole("link", { name: /ver detalhes/i })).toHaveAttribute("href", `/pools/${pool.poolId}`);
  await expect(page.getByText("Projeto criativo internacional")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /simular aporte|aportar/i })).toHaveCount(0);
  await expect(page.getByText(/cpf|nome civil|invoice|preimage|nostr\+walletconnect/i)).toHaveCount(0);
});
