import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Elas Recebem Hoje",
    template: "%s | Elas Recebem Hoje",
  },
  description:
    "Antecipação de pagamentos internacionais para pessoas no Brasil, com foco em mulheres e liquidez em Bitcoin.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: "Elas Recebem Hoje",
    description:
      "Seu pagamento já tem data. Seu dinheiro não precisa esperar.",
    images: [{ url: "/og.png", width: 1733, height: 909, alt: "Elas Recebem Hoje" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Elas Recebem Hoje",
    description:
      "Seu pagamento já tem data. Seu dinheiro não precisa esperar.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        <SiteHeader />
        <main id="conteudo">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
