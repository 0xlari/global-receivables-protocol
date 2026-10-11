# Global Receivables Protocol (GRP)

**Global Receivables Protocol (GRP)** is open infrastructure for creating, validating, financing, settling and building portable reputation around real-world receivables on Solana.

Live demo: **https://global-receivables-protocol.vercel.app/**  
[Whitepaper](docs/WHITEPAPER.md) · [Demo runbook](docs/11-roteiro-da-demo.md)

Network: **Solana Devnet**  
Program ID: `CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY`

## Why GRP

Cross-border workers and small businesses often wait weeks or months to receive legitimate payments. Traditional receivables financing is expensive, fragmented or inaccessible to smaller participants.

GRP turns a confirmed future payment into a programmable financing primitive with:

- public financial state on Solana;
- private operational data off-chain;
- USDC financing and settlement;
- Market-specific rules enforced on-chain;
- a portable **Receivable Passport** that persists across Markets.

## Product model

GRP separates infrastructure from distribution.

### GRP Protocol

The protocol owns the common financial primitives:

- receivable lifecycle;
- payer commitment;
- validation state;
- MarketConfig;
- financing pools;
- investor contributions;
- disbursement;
- settlement;
- default / cure state;
- fee distribution;
- Receivable Passport.

### Markets

Markets adapt GRP to a geography, audience and operating model.

Each Market declares:

- operator;
- status;
- treasury;
- advance rate;
- minimum funding threshold;
- investor return;
- Market fee;
- GRP protocol fee;
- rules version.

Markets move through:

`PROPOSED → SANDBOX → ACTIVE`

and may later become `PAUSED`, `SUSPENDED` or `RETIRED` without deleting historical receivables or Passport state.

### Elas Recebem Hoje

**Elas Recebem Hoje (ERH)** is the first active Market built on GRP.

ERH rules configured in the application and enforced by the program when a pool is created (verify the deployed MarketConfig before the demo):

| Rule | Value |
|---|---:|
| Advance | 80% |
| Minimum partial funding | 50% of the pool target |
| Investor return | 3.5% |
| ERH Market fee | 1.0% |
| GRP protocol fee | 0.50% |
| Settlement asset | USDC |
| Status | ACTIVE |

Market treasury and GRP treasury are separate. The investor return is calculated on funded principal; both fees are calculated on the receivable face value. These are per-operation rates, not annual yields. A full advance requires full funding. After the funding deadline, the requester may explicitly accept partial funding of at least 50% of the target.

## End-to-end flow

1. Requester creates a receivable.
2. Payer confirms the obligation with a Solana signature.
3. Market operator validates it.
4. GRP creates a financing pool under the MarketConfig.
5. Investors fund the pool in USDC.
6. The requester receives the advance.
7. The payer later signs a fresh transaction and settles the full receivable in USDC.
8. Investors claim principal + Market-defined return.
9. ERH receives its Market fee.
10. GRP receives its protocol fee.
11. The residual returns to the requester.
12. Receivable Passport updates the financial history.

The payer does **not** grant an open-ended token delegate. Settlement requires a fresh payer signature. In the current source, `manual_repayment` accepts the full remaining amount, including voluntary early payment; partial repayment is rejected. `settle_receivable` only marks payment due and transfers no tokens. Confirm the deployed program version during the signed-wallet rehearsal.

## Example economics

For a **US$1,000** receivable:

```text
Face value                    US$ 1,000
Advance to requester           US$   800

After payer settlement:
Investors receive              US$   828
  principal                    US$   800
  return (3.5%)                US$    28

ERH Market fee (1%)            US$    10
GRP fee (0.50%)                US$     5
Requester residual             US$   157
```

## Receivable Passport

The Passport is a protocol-level reputation primitive linked to the requester wallet.

It tracks:

- receivables created;
- receivables settled;
- on-time settlements;
- late settlements;
- defaults;
- cured defaults;
- total settled USDC volume;
- last on-chain update.

The Market may change; the Passport remains portable.

Private evidence and PII remain off-chain. The current form records evidence metadata and a salted hash commitment; it does not establish a complete document-storage, KYC/KYB or compliance service. Passport facts describe recorded protocol activity, not a verified identity or a universal credit score.

## Default model

Current MVP rules:

- **D+1:** overdue;
- **D+5:** default;
- repayment after default remains possible;
- cured defaults remain visible in the Passport.

These thresholds are elapsed time from `due_at` (24 hours and five days). State changes require execution of `process_delinquency`; time alone does not execute a transaction. Passport late/default classification depends on recorded delinquency flags, so it should not be described as independently guaranteed wall-clock classification.

A future **Stability Reserve** is part of the economic roadmap. It is not an automatic guarantee or insurance product. Any support would be partial, eligibility-based and subject to risk policy.

## Architecture

The Next.js application connects wallet users to the Anchor program and to Neon/PostgreSQL. Solana holds public financial state; the database holds private operational records and application reconciliation data.

Principal program accounts: `ProtocolConfig`, `MarketConfig`, `Receivable`, `ReceivableMarket`, `PayerAuthorization`, `Validation`, `Pool`, `Contribution`, `SettlementDistribution` and `ReceivablePassport`.

### On-chain

- canonical financial state;
- market rules and economics;
- receivable status;
- pool state;
- contributions;
- settlement state;
- fee split;
- reputation facts.

### Off-chain

- documents;
- PII;
- KYC/KYB;
- contracts;
- payer operational information;
- underwriting notes;
- communications;
- compliance evidence.

## Tech stack

- Solana
- Anchor 1.2
- Rust
- USDC / SPL Token
- Next.js 16
- React 19
- TypeScript
- PostgreSQL / Neon
- Drizzle ORM
- Vercel
- Vitest

Legacy Bitcoin / Lightning / Nostr modules, dependencies and routes remain during migration. The intended demo follows the GRP/ERH Solana routes. Their presence does not imply that all legacy execution paths have been removed or independently audited.

## Development

Requirements:

- Node.js 24
- pnpm 10
- Rust
- Solana CLI
- Anchor 1.2

Install:

```bash
pnpm install
```

Run locally:

```bash
pnpm dev
```

Validate the web application:

```bash
pnpm check
```

Build the Solana program:

```bash
anchor build
```

Database setup for an isolated development database (review schema changes before using an existing database; `db:setup-grp` runs `drizzle-kit push`):

```bash
pnpm db:setup-grp
```

## Environment variables

Set local values in `.env.local` and deployment values in Vercel **Production**. Use an isolated database and Devnet token mint for development. `NEXT_PUBLIC_*` values are public browser configuration, never secrets.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Private PostgreSQL connection string; server only |
| `NEXT_PUBLIC_GRP_PROGRAM_ID` | Deployed GRP program address |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Solana Devnet RPC endpoint |
| `NEXT_PUBLIC_GRP_ORIGINATOR_WALLET` | Market validation/operator wallet |
| `NEXT_PUBLIC_GRP_USDC_MINT` | Devnet SPL settlement mint; verify address and decimals |
| `NEXT_PUBLIC_ERH_MARKET_TREASURY` | ERH treasury used by setup; current code has a fallback address |
| `NEXT_PUBLIC_SITE_URL` | Canonical public site URL; set to the demo domain on Vercel |

Public configuration changes require a new build. Never commit secrets, private keys, seed phrases, mnemonics, PII or production credentials.

## Demo entry points

- `/`: protocol landing page.
- `/markets`: market directory.
- `/elas-recebem-hoje`: first Market application.
- `/elas-recebem-hoje/entrar`: Solana wallet login.
- `/elas-recebem-hoje/recebivel`: requester origination.
- `/elas-recebem-hoje/painel`: requester dashboard.
- `/elas-recebem-hoje/oportunidades`: investor opportunities.
- `/elas-recebem-hoje/passaporte`: requester performance history.
- `/administracao/grp`: protocol setup and authorized validation.

Prepare separate requester, payer, investor and operator wallets, SOL for Devnet fees and the configured Devnet settlement tokens. Use fictitious evidence. Follow the [demo runbook](docs/11-roteiro-da-demo.md); a signature or token balance alone does not prove the complete flow.

## Implementation and verification status

The current source contains creation, payer commitment, validation, MarketConfig enforcement, pool funding/disbursement, payer-signed repayment, investor claims, fee/residual distribution, delinquency/cure and Passport updates. Source implementation is distinct from a verified production rehearsal.

Verified on 11 October 2026 during P3.5:

- Vercel production deployment `READY`, commit `0a45c30` on `migration/grp-phase-1`;
- 11 main page routes and the PNG logo returned HTTP 200;
- navigation from GRP to Markets, ERH and Solana login;
- five private GET APIs returned HTTP 401 without a session.

The complete authenticated database and signed-wallet financial flow remains pending in P3.4. The prepared P3.4 UI/runbook corrections are in draft PR #1 and were not part of that production smoke test. Production also lacked `NEXT_PUBLIC_SITE_URL` at the time of inspection.

Still in hardening / roadmap:

- signed-wallet rehearsal against the deployed program, with transaction evidence;
- full automated Anchor integration coverage for the latest MarketConfig flow;
- complete private document storage and operational compliance controls;
- reliable delinquency processing and time-based Passport classification;
- Stability Reserve, Rail Registry and expanded governance;
- independent security review and mainnet readiness.

## Repository notes

The project evolved from **Elas Recebem Hoje**, originally built during Hack4Freedom around Bitcoin, Lightning and Nostr. GRP preserves the core business insight while replacing the chain-specific infrastructure with a Solana-first protocol architecture.

See also:

- `docs/GRP_MIGRATION.md`
- `docs/12-decisoes.md`
- `docs/WHITEPAPER.md`

## Safety

This is an experimental hackathon project running on **Solana Devnet**.

Do not use real funds or production credentials without legal, operational and security review.
