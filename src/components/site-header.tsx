"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/brand";
import { SessionAwareNavigation } from "@/components/session-aware-header";

export function SiteHeader() {
  const pathname = usePathname();
  const isImmersive = pathname === "/" || pathname === "/como-funciona";
  const isErh = pathname.startsWith("/elas-recebem-hoje");

  if (isImmersive) {
    return (
      <header className="site-header site-header--grp site-header--immersive">
        <div className="shell site-header__inner">
          <Brand />
          <nav className="desktop-nav" aria-label="Protocol navigation">
            <Link href="/como-funciona">Protocol</Link>
            <Link href="/elas-recebem-hoje">Built on GRP</Link>
            <Link href="/entrar?next=/recebivel" className="button button--quiet">Launch app</Link>
          </nav>
          <details className="mobile-nav">
            <summary aria-label="Open menu">Menu</summary>
            <nav aria-label="Mobile navigation">
              <Link href="/como-funciona">Protocol</Link>
              <Link href="/elas-recebem-hoje">Built on GRP</Link>
              <Link href="/entrar?next=/recebivel">Launch app</Link>
            </nav>
          </details>
        </div>
      </header>
    );
  }

  return (
    <header className={`site-header ${isErh ? "site-header--erh" : "site-header--grp"}`}>
      <div className="shell site-header__inner">
        <Brand variant={isErh ? "erh" : "grp"} />
        <nav className="desktop-nav" aria-label="Main navigation">
          <SessionAwareNavigation />
        </nav>
        <details className="mobile-nav">
          <summary aria-label="Open menu">Menu</summary>
          <nav aria-label="Mobile navigation">
            <SessionAwareNavigation mobile />
          </nav>
        </details>
      </div>
    </header>
  );
}
