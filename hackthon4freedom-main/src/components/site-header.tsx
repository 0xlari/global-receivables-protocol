import { Brand } from "@/components/brand";
import { SessionAwareNavigation } from "@/components/session-aware-header";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Brand />
        <nav className="desktop-nav" aria-label="Navegação principal">
          <SessionAwareNavigation />
        </nav>
        <details className="mobile-nav">
          <summary aria-label="Abrir menu">Menu</summary>
          <nav aria-label="Navegação móvel">
            <SessionAwareNavigation mobile />
          </nav>
        </details>
      </div>
    </header>
  );
}
