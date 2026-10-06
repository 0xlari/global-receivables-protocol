"use client";

import { usePathname } from "next/navigation";
import { Brand } from "@/components/brand";
import { SessionAwareNavigation } from "@/components/session-aware-header";

export function SiteHeader() {
  const pathname = usePathname();
  const isErh = pathname.startsWith("/elas-recebem-hoje");

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
