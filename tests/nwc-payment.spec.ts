import { expect, test, type Page } from "@playwright/test";

async function createConfirmedDemoReceivable(page: Page) {
  const token = "e2e-nwc-confirmation-token";
  const dueDate = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  await page.goto("/");
  await page.evaluate(({ confirmationToken, paymentDueDate }) => {
    window.localStorage.setItem("erh-hackathon-demo-v2:e2e-wallet", JSON.stringify({
      receivables: [{
        id: "r_e2e_nwc",
        token: confirmationToken,
        purpose: "SERVICE",
        description: "Projeto internacional de design",
        amountUsd: 100,
        dueDate: paymentDueDate,
        payerName: "Cliente da demonstração",
        payerCountry: "Estados Unidos",
        evidenceName: "invoice-demo.pdf",
        status: "AWAITING_CLIENT",
        createdAt: new Date().toISOString(),
      }],
      pools: [],
      contributions: [],
    }));
  }, { confirmationToken: token, paymentDueDate: dueDate });
  await page.goto(`/confirmar?demo=${token}`);
  await page.getByRole("button", { name: "Simular assinatura e confirmar" }).click();
}

test("payer can choose manual Lightning without NWC", async ({ page }) => {
  await createConfirmedDemoReceivable(page);
  await expect(page.getByRole("heading", { name: "Como você deseja realizar o pagamento?" })).toBeVisible();
  await page.getByRole("button", { name: "Pagar manualmente no vencimento" }).click();
  await expect(page.getByText("Pagamento manual escolhido")).toBeVisible();
  await expect(page.getByText(/invoice Lightning será disponibilizada/i)).toBeVisible();
});

test("payer can activate and revoke a simulated NWC authorization", async ({ page }) => {
  await createConfirmedDemoReceivable(page);
  await page.getByRole("button", { name: "Conectar carteira para pagamento automático" }).click();
  await expect(page.getByRole("heading", { name: "Programe o pagamento deste recebível" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Conectar minha carteira" })).toBeVisible();
  await expect(page.getByPlaceholder("nostr+walletconnect://…")).toBeHidden();
  await page.getByRole("button", { name: "Opções avançadas" }).click();
  const uri = `nostr+walletconnect://${"1".repeat(64)}?relay=${encodeURIComponent("wss://relay.example.com")}&secret=${"2".repeat(64)}`;
  await page.getByPlaceholder("nostr+walletconnect://…").fill(uri);
  await page.getByRole("button", { name: "Usar conexão avançada" }).click();
  await expect(page.getByText("Pagamento automático ativo")).toBeVisible();
  await expect(page.getByText(/não é garantido/i)).toBeVisible();
  await page.getByRole("button", { name: "Revogar autorização" }).click();
  await expect(page.getByText(/Nenhum débito automático será solicitado/i)).toBeVisible();
});
