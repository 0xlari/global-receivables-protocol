# Global Receivables Protocol (GRP)

**GRP** is an open infrastructure for representing, validating, financing and settling global receivables on Solana.

The repository is being migrated from the Hack4Freedom project **Elas Recebem Hoje**, originally built around Bitcoin, Lightning and Nostr. The business domain and product flows are being preserved while the public financial state layer is replaced by Solana.

> **Migration status:** Phase 1 — legacy boundary and architecture cleanup. Bitcoin/Lightning/Nostr modules remain in the repository only to keep the previous implementation recoverable while their responsibilities are replaced.

## Product structure

- **Global Receivables Protocol (GRP):** protocol and on-chain infrastructure.
- **Receivable Passport:** portable performance/reputation history derived from settled receivables.
- **Elas Recebem Hoje:** first vertical/application built on top of GRP.

## Core problem

Professionals and small businesses that work across borders often wait weeks or months to receive invoices or contractual payments. Traditional receivables financing is still difficult to access for smaller participants, especially in cross-border flows.

GRP aims to turn a confirmed future payment into a verifiable, programmable financing primitive.

Target flow:

1. a requester creates a receivable;
2. the payer confirms the obligation;
3. an originator validates the receivable;
4. a financing pool is created;
5. investors fund the pool in USDC;
6. the receivable is settled;
7. the settlement updates the requester's Receivable Passport.

## Target architecture

### Solana

Solana becomes the canonical public financial state layer for:

- receivable identifiers and lifecycle;
- payer confirmation commitments;
- validation decisions;
- financing pools;
- contributions;
- settlement;
- reputation facts used by Receivable Passport.

### Off-chain data

PostgreSQL/Supabase remains responsible for private and operational data such as:

- documents;
- PII;
- KYC references;
- private payer data;
- underwriting notes;
- communications;
- operational audit data.

Sensitive documents must not be published on-chain.

### Settlement asset

The hackathon MVP targets **USDC on Solana** as the primary financing and settlement asset. SOL is used for network fees and program interaction, not as the receivable's unit of account.

## Preserved domain

The migration intentionally preserves the strongest parts of the Hack4Freedom implementation:

- receivables lifecycle;
- payer confirmation;
- validation / underwriting workflow;
- financing pools;
- partial funding rules;
- financial calculations;
- ledger invariants;
- administration flows;
- private-data separation;
- relevant tests.

## Legacy boundary

The following subsystems belong to the previous Bitcoin architecture and receive no new product development:

- Lightning Network settlement;
- Breez / Liquid;
- Nostr Wallet Connect (NWC);
- DLC settlement design;
- Nostr as canonical public state;
- relay quorum and Nostr projections;
- Bitcoin/sats-specific flows.

They remain temporarily in the codebase only until their active responsibilities are replaced safely.

See:

```text
docs/GRP_MIGRATION.md
docs/legacy-hack4freedom/
```

## Current application

The existing Next.js application is intentionally kept operational during the migration. Current product routes include:

```text
/painel
/recebivel
/confirmar
/administracao
/pools
/pools/[poolId]
```

Some routes still depend on legacy infrastructure during Phase 1. They will be migrated incrementally rather than deleted prematurely.

## Current stack

Preserved application stack:

- Next.js 16
- React 19
- TypeScript
- PostgreSQL
- Drizzle ORM
- Vitest
- Playwright
- PGlite
- Zod
- Tailwind CSS

Target additions:

- Solana
- Anchor
- Solana wallet integration
- SPL Token / USDC

Legacy dependencies remain temporarily installed until their imports are retired.

## Development

Install dependencies:

```bash
pnpm install
```

Run locally:

```bash
pnpm dev
```

Validation:

```bash
pnpm check
```

Database:

```bash
pnpm db:migrate
```

## Migration phases

1. **Legacy boundary and cleanup** — identify and isolate Bitcoin/Lightning/Nostr responsibilities without breaking the app.
2. **GRP architecture** — define the Solana state model, authorities, privacy boundary and on-chain/off-chain responsibilities.
3. **Solana program** — implement the core GRP program and tests.
4. **Application integration** — replace Nostr/Bitcoin interactions with Solana wallet and transactions.
5. **Receivable Passport** — derive portable performance history from settled receivables.
6. **End-to-end demo** — create → confirm → validate → fund → settle → update Passport.
7. **Hackathon hardening** — README, tests, demo, video and submission.

## Safety

This is an experimental hackathon project.

Do not use real funds or production credentials without explicit review. Financial logic, permissions, settlement flows and migrations must remain auditable and tested.

Never commit:

```text
.env.local
wallet private keys
seed phrases
mnemonics
DATABASE_URL with credentials
private confirmation tokens
PII
private documents
```

## Historical implementation

The original Hack4Freedom Bitcoin/Lightning implementation remains preserved in Git history and in explicitly marked legacy documentation during migration.

The migration rule is simple: **preserve business logic; replace chain-specific infrastructure deliberately.**
