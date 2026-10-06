import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Global Receivables Protocol",
    template: "%s | GRP",
  },
  description:
    "Programmable infrastructure for creating, validating, financing and settling global receivables in USDC on Solana.",
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Global Receivables Protocol",
    description:
      "Turn future payments into programmable, financeable receivables.",
    images: [{ url: "/og.png", width: 1733, height: 909, alt: "Global Receivables Protocol" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Global Receivables Protocol",
    description:
      "Turn future payments into programmable, financeable receivables.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#conteudo">Skip to content</a>
        <SiteHeader />
        <main id="conteudo">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
