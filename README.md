# Global Receivables Protocol (GRP)

**Global Receivables Protocol (GRP)** is open infrastructure for creating, validating, financing, settling and building portable reputation around real-world receivables on Solana.

Live demo: **https://global-receivables-protocol.vercel.app/**  
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

Current Devnet MarketConfig:

| Rule | Value |
|---|---:|
| Advance | 80% |
| Minimum partial funding | 50% |
| Investor return | 3.5% |
| ERH Market fee | 1.0% |
| GRP protocol fee | 0.50% |
| Settlement asset | USDC |
| Status | ACTIVE |

Market treasury and GRP treasury are separate.

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

The payer does **not** grant an open-ended token delegate. Settlement requires a fresh payer signature.

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

Private evidence, PII, KYC/KYB and sensitive documents remain off-chain.

## Default model

Current MVP rules:

- **D+1:** overdue;
- **D+5:** default;
- repayment after default remains possible;
- cured defaults remain visible in the Passport.

A future **Stability Reserve** is part of the economic roadmap. It is not an automatic guarantee or insurance product. Any support would be partial, eligibility-based and subject to risk policy.

## Architecture

```text
User / Payer / Investor
        │
        ▼
Next.js application
        │
        ├──────────────► Neon / PostgreSQL
        │                private operational data
        │                sessions
        │                evidence references
        │                Market operations
        │
        ▼
Solana Program (Anchor)
        │
        ├─ ProtocolConfig
        ├─ MarketConfig
        ├─ Receivable
        ├─ ReceivableMarket
        ├─ PayerAuthorization (payer commitment)
        ├─ Validation
        ├─ Pool
        ├─ Contribution
        ├─ SettlementDistribution
        └─ ReceivablePassport
```

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

Legacy Bitcoin / Lightning / Nostr code remains in the repository only as preserved history from the original Hack4Freedom project and is not part of the active GRP product flow.

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

Database setup for GRP:

```bash
pnpm db:setup-grp
```

## Environment variables

```text
DATABASE_URL
NEXT_PUBLIC_GRP_PROGRAM_ID
NEXT_PUBLIC_SOLANA_RPC_URL
NEXT_PUBLIC_GRP_ORIGINATOR_WALLET
NEXT_PUBLIC_GRP_USDC_MINT
NEXT_PUBLIC_ERH_MARKET_TREASURY
```

Never commit secrets, private keys, seed phrases, mnemonics, PII or production credentials.

## Current status

Implemented and demonstrated on Devnet:

- receivable creation;
- payer commitment;
- Market validation;
- MarketConfig on-chain;
- pool creation;
- investor funding;
- USDC disbursement;
- payer settlement;
- investor distribution;
- separate Market and Protocol fees;
- requester residual;
- D+1 overdue;
- D+5 default;
- cure after default;
- Receivable Passport;
- Market lifecycle;
- Vercel deployment.

Still in hardening / roadmap:

- full automated Anchor integration coverage for the latest MarketConfig flow;
- Stability Reserve implementation;
- Rail Registry;
- production compliance and jurisdiction-specific controls;
- independent security review;
- mainnet readiness.

## Repository notes

The project evolved from **Elas Recebem Hoje**, originally built during Hack4Freedom around Bitcoin, Lightning and Nostr. GRP preserves the core business insight while replacing the chain-specific infrastructure with a Solana-first protocol architecture.

See also:

- `docs/GRP_MIGRATION.md`
- `docs/12-decisoes.md`
- `docs/WHITEPAPER.md`

## Safety

This is an experimental hackathon project running on **Solana Devnet**.

Do not use real funds or production credentials without legal, operational and security review.
