"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/brand";

export function SiteFooter() {
  const pathname = usePathname();
  const isErh = pathname.startsWith("/elas-recebem-hoje");

  if (isErh) {
    return (
      <footer className="site-footer site-footer--erh">
        <div className="shell site-footer__inner">
          <div>
            <Brand variant="erh" />
            <p>Vertical brasileira powered by Global Receivables Protocol.</p>
          </div>
          <div className="site-footer__links" aria-label="Links do rodapé">
            <Link href="/">Conhecer o GRP</Link>
            <Link href="/recebivel">Criar recebível</Link>
            <Link href="/pools">Pools</Link>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="site-footer site-footer--grp">
      <div className="shell site-footer__inner">
        <div>
          <Brand />
          <p>Programmable infrastructure for global receivables.</p>
        </div>
        <div className="site-footer__links" aria-label="Footer links">
          <Link href="/como-funciona">Protocol</Link>
          <Link href="/build-on-grp">Build on GRP</Link>
          <Link href="/markets">Markets</Link>
          <Link href="/markets">Launch</Link>
        </div>
      </div>
    </footer>
  );
}
