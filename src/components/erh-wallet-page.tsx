"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogOut, RefreshCw, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  label: string;
  solanaWallet?: string | null;
};

export function ErhWalletPage() {
  const [profile, setProfile] = useState<Profile>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.href = "/elas-recebem-hoje/entrar?next=/elas-recebem-hoje/carteira";
          return;
        }
        const body = await response.json() as { profile?: Profile };
        if (!response.ok || !body.profile) throw new Error();
        setProfile(body.profile);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.replace("/elas-recebem-hoje");
    router.refresh();
  }

  if (state === "loading") return <div className="dashboard-loading">Carregando sua carteira…</div>;
  if (state === "error" || !profile) return <div className="empty-demo-state">Não foi possível carregar sua sessão.</div>;

  return (
    <div className="dashboard">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow"><WalletCards size={16} /> Sua conta</span>
          <h1>Carteira conectada.</h1>
          <p>Esta carteira identifica sua conta no Elas Recebem Hoje. Assinaturas de login não movimentam fundos.</p>
        </div>
        <div className="dashboard-limit">
          <span>Status</span>
          <strong>Conectada</strong>
          <small>{profile.solanaWallet ? profile.solanaWallet.slice(0, 8) + "…" + profile.solanaWallet.slice(-8) : "Carteira não disponível"}</small>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="profile-items">
          <div><strong>Perfil</strong><span>{profile.label}</span></div>
          <div><strong>Carteira Solana</strong><span>{profile.solanaWallet ?? "não vinculada"}</span></div>
        </div>

        <div className="demo-actions" style={{ marginTop: "1.5rem" }}>
          <Link className="button button--secondary" href="/elas-recebem-hoje/entrar?trocar=1&next=/elas-recebem-hoje/carteira">
            <RefreshCw size={16} /> Trocar carteira
          </Link>
          <button className="button button--secondary" type="button" onClick={() => void signOut()}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </section>
    </div>
  );
}
