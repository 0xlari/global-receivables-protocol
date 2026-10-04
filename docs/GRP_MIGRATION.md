# Global Receivables Protocol — migration

This repository is migrating the former Hack4Freedom Bitcoin/Lightning implementation into the **Global Receivables Protocol (GRP)** on Solana.

## Phase 1 — legacy boundary

The following subsystems are considered legacy and must not receive new product development unless required to keep the existing application buildable during migration:

- Bitcoin-specific settlement and sats-denominated flows
- Lightning Network integrations
- Breez / Liquid integrations
- Nostr Wallet Connect (NWC)
- DLC settlement design
- Nostr as the canonical public state layer
- LRP relay quorum and Nostr projection infrastructure

## Preserved product/domain assets

The migration preserves and adapts:

- receivables domain and lifecycle
- payer confirmation
- validation / underwriting workflow
- financing pools and partial funding rules
- financial calculations and ledger invariants
- private off-chain data model
- administration and product UX
- security and privacy guardrails
- relevant unit, integration and E2E tests

## Target architecture

GRP will use Solana as the canonical public financial state layer and USDC as the primary settlement asset for the hackathon MVP. Sensitive documents and PII remain off-chain in PostgreSQL/Supabase.

The product structure is:

- **Global Receivables Protocol (GRP):** infrastructure
- **Receivable Passport:** portable repayment/performance history derived from settled receivables
- **Elas Recebem Hoje:** first vertical/application using GRP

## Migration rule

Do not delete legacy modules until their active imports and responsibilities have been replaced or intentionally retired. The migration must keep the repository recoverable and preserve the Hack4Freedom implementation in Git history.
