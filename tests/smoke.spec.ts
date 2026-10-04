import { expect, test } from "@playwright/test";

test("home presents the two primary product paths", async ({ page }) => {
  await page.goto("/");
  const main = page.locator("main");
  await expect(page.getByRole("heading", { name: /Seu pagamento já tem data/i })).toBeVisible();
  await expect(main.getByRole("link", { name: "Criar recebível", exact: true })).toBeVisible();
  await expect(main.getByRole("link", { name: "Ver pools abertas", exact: true })).toBeVisible();
  await expect(page.getByText("Pagamento em BTC aceito")).toBeVisible();
});

test("public navigation contains no redundant product pages", async ({ page }, testInfo) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  const navigation = testInfo.project.name === "mobile-chromium"
    ? header.getByRole("navigation", { name: "Navegação móvel" })
    : header.getByRole("navigation", { name: "Navegação principal" });

  if (testInfo.project.name === "mobile-chromium") {
    await header.getByLabel("Abrir menu").click();
  }

  await expect(navigation.getByRole("link", { name: "Pools", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Entrar", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: /demo|reputação|meu limite/i })).toHaveCount(0);
});

test("product access uses Nostr without exposing LNURL authentication", async ({ page }) => {
  await page.goto("/entrar");
  await expect(page.getByRole("heading", { name: /Entre com sua identidade Nostr/i })).toBeVisible();
  await expect(page.getByText(/chave privada permanece no assinador/i)).toBeVisible();
  await expect(page.getByText(/LNURL|carteira Lightning|nsec/i)).toHaveCount(0);
});

test("pools are BTC-only and shareable", async ({ page }) => {
  await page.goto("/pools");
  await expect(page.getByRole("heading", { name: /Escolha uma pool/i })).toBeVisible();
  await expect(page.getByText("Pool BTC").first()).toBeVisible();
  await expect(page.getByText(/USDT|pareada em dólar/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /WhatsApp/i }).first()).toHaveAttribute("href", /wa\.me/);
  await page.getByRole("link", { name: /Ver detalhes/i }).first().click();
  await expect(page.getByRole("heading", { name: /Projeto criativo internacional/i })).toBeVisible();
  await expect(page.getByText(/Dados pessoais, documentos e informações do pagador permanecem privados/i)).toBeVisible();
});

test("receivable page states the single-active rule", async ({ page }) => {
  await page.goto("/recebivel");
  await expect(page.getByRole("heading", { name: /Cadastre o pagamento/i })).toBeVisible();
  await expect(page.getByText(/somente um recebível ativo por vez/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /Entrar com Nostr/i })).toBeVisible();
});

test("confirmation page rejects a missing one-time token", async ({ page }) => {
  await page.goto("/confirmar");
  await expect(page.getByText(/link é inválido, expirou ou já foi usado/i)).toBeVisible();
});

test("layout does not overflow the viewport", async ({ page }) => {
  for (const path of ["/", "/pools", "/pools/p_7f3k9m", "/recebivel", "/entrar"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  }
});

test("hackathon demo completes receivable approval and contribution", async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        profile: { id: "e2e-wallet-profile", label: "Carteira E2E" },
      }),
    });
  });

  await page.goto("/recebivel");
  const dueDate = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Data combinada").fill(dueDate);
  await page.getByRole("button", { name: "Cadastrar e gerar link" }).click();
  await expect(page.getByRole("heading", { name: "Agora envie o link ao pagador." })).toBeVisible();
  const confirmationUrl = await page.getByLabel("Link de confirmação").inputValue();

  await page.goto(confirmationUrl);
  await page.getByRole("button", { name: "Simular assinatura e confirmar" }).click();
  await expect(page.getByRole("heading", { name: /Como você deseja realizar o pagamento/i })).toBeVisible();
  await page.getByRole("button", { name: "Pagar manualmente no vencimento" }).click();
  await expect(page.getByText(/Pagamento manual escolhido/i)).toBeVisible();

  await page.goto("/administracao");
  await page.getByRole("button", { name: "Aprovar e criar pool" }).click();
  await expect(page.getByText(/pool .* criada/i)).toBeVisible();

  await page.goto("/pools");
  const demoCard = page.getByRole("article").filter({ hasText: "Projeto internacional de design" });
  await demoCard.getByRole("link", { name: /ver detalhes/i }).click();
  await expect(page.getByRole("heading", { name: "Quanto você pode receber?" })).toBeVisible();
  await expect(page.getByText("Estimativa central")).toBeVisible();
  await page.getByRole("button", { name: "Simular aporte nesta pool" }).click();
  await expect(page.getByText(/aporte demonstrativo de/i)).toBeVisible();

  await page.goto("/painel");
  await expect(page.getByText("Projeto internacional de design").first()).toBeVisible();
  await expect(page.getByText(/sats aportados/i)).toBeVisible();
});
