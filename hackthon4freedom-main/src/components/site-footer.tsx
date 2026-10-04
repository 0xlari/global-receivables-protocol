import Link from "next/link";
import { Brand } from "@/components/brand";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__inner">
        <div>
          <Brand />
          <p>Recebíveis internacionais. Liquidez em Bitcoin.</p>
        </div>
        <div className="site-footer__links" aria-label="Links do rodapé">
          <Link href="/como-funciona">Como funciona</Link>
          <Link href="/pools">Pools BTC</Link>
          <Link href="/recebivel">Criar recebível</Link>
        </div>
      </div>
    </footer>
  );
}
