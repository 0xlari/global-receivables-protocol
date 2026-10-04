"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole } from "lucide-react";

export function ReceivableAccessAction() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => { if (active) setAuthenticated(response.ok); })
      .catch(() => { if (active) setAuthenticated(false); });
    return () => { active = false; };
  }, []);

  if (authenticated === null) return <span className="receivable-access-status">Verificando sua carteira…</span>;
  if (authenticated) return <div className="receivable-access-status receivable-access-status--ready"><CheckCircle2 aria-hidden="true" size={18} /><span><strong>Carteira conectada.</strong> O formulário privado e o upload serão habilitados na próxima etapa.</span></div>;
  return <><Link className="button button--primary" href="/entrar?next=/recebivel">Confirmar carteira para continuar</Link><small><LockKeyhole aria-hidden="true" size={15} /> A carteira protege seu perfil sem revelar saldo.</small></>;
}
