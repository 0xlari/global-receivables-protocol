import Link from "next/link";
import { Brand } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div>
          <Brand />
          <p>Programmable infrastructure for global receivables.</p>
        </div>
        <div className="site-footer__links" aria-label="Footer links">
          <Link href="/como-funciona">How it works</Link>
          <Link href="/recebivel">Create receivable</Link>
          <Link href="/pools">Pools</Link>
        </div>
      </div>
    </footer>
  );
}
