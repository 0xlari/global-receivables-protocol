# Global Receivables Protocol (GRP)

## Whitepaper — Hackathon Draft

### Abstract

Global Receivables Protocol (GRP) is open infrastructure for representing, financing, settling and carrying portable performance history for real-world receivables on Solana.

GRP separates the protocol layer from the local operating layer. The protocol provides common financial state, settlement primitives and a Receivable Passport. Markets adapt those primitives to specific geographies, audiences and operating models.

The first active Market is **Elas Recebem Hoje**, focused on professionals in Brazil who have eligible payments to receive from global payers.

---

## 1. Problem

Millions of professionals and small businesses operate across borders but wait weeks or months to receive invoices, salaries, commissions and service payments.

Traditional receivables financing is often:

- inaccessible to smaller participants;
- limited by geography;
- fragmented across lenders and rails;
- opaque in pricing and risk;
- disconnected from portable performance history.

The result is a liquidity gap between work already performed and cash actually received.

GRP treats an eligible confirmed future payment as a programmable financial primitive.

---

## 2. Design goals

GRP is designed around five principles:

1. **Canonical public financial state** — critical financial state lives on Solana.
2. **Private data stays private** — documents, PII, KYC/KYB and operational evidence remain off-chain.
3. **Markets are explicit** — local operators, economics and responsibilities are not hidden inside the protocol.
4. **Settlement requires fresh consent** — the payer does not grant an open-ended future debit.
5. **Reputation is portable** — the Receivable Passport can accumulate history across Markets.

---

## 3. System model

### Protocol layer

GRP provides:

- receivable lifecycle;
- payer commitment;
- validation state;
- MarketConfig;
- financing pools;
- investor contributions;
- disbursement;
- settlement;
- default and cure state;
- fee distribution;
- Receivable Passport.

### Market layer

A Market defines:

- operator;
- geography / audience;
- status;
- treasury;
- advance rate;
- minimum funding threshold;
- investor return;
- Market fee;
- GRP protocol fee;
- rules version.

Markets follow an operational lifecycle:

`PROPOSED → SANDBOX → ACTIVE`

and can later be `PAUSED`, `SUSPENDED` or `RETIRED`.

### First Market: Elas Recebem Hoje

Current MarketConfig on Solana Devnet:

| Parameter | Value |
|---|---:|
| Advance | 80% |
| Minimum partial funding | 50% |
| Investor return | 3.5% |
| Market fee | 1.0% |
| GRP fee | 0.50% |
| Settlement asset | USDC |
| Status | ACTIVE |

---

## 4. Core flow

### 4.1 Creation

A requester creates a receivable with an amount, due date, payment origin and evidence commitment.

Sensitive supporting documents remain off-chain.

### 4.2 Payer commitment

The payer confirms the obligation with a Solana signature.

The commitment does not create a token delegate or an authorization for future automatic withdrawals.

### 4.3 Validation

The Market Operator reviews the receivable and records an approval, rejection or request for more information.

### 4.4 Financing

After approval, a pool is created.

The Solana program verifies that the pool economics match the MarketConfig. A manipulated frontend cannot silently change the approved Market rules.

### 4.5 Funding and disbursement

Investors fund the pool in USDC.

When the configured funding requirements are met, the funded amount is transferred to the requester.

### 4.6 Settlement

The payer later signs a new transaction and settles the receivable in USDC.

The payment is routed through settlement state controlled by the GRP program.

### 4.7 Distribution

After settlement:

- investors claim principal + Market-defined return;
- the Market receives its fee;
- GRP receives its protocol fee;
- the remaining residual returns to the requester.

---

## 5. Example economics

For a US$1,000 receivable under Elas Recebem Hoje:

```text
Face value                    US$ 1,000
Advance financed               US$   800

Investor principal             US$   800
Investor return (3.5%)         US$    28
ERH Market fee (1.0%)          US$    10
GRP protocol fee (0.50%)       US$     5
Requester residual             US$   157
```

The investor therefore receives US$828 after settlement.

The requester receives US$800 earlier and US$157 after final settlement.

---

## 6. Receivable Passport

Receivable Passport is a protocol-level performance record associated with a requester wallet.

Current signals include:

- receivables created;
- receivables settled;
- settlements on time;
- late settlements;
- defaults;
- cured defaults;
- total USDC settled;
- last update.

The Passport is intentionally not a document repository or a universal credit score. It is a compact set of verifiable protocol-native performance signals.

Its main design goal is portability: a participant should not need to rebuild financial history from zero when moving between compatible Markets.

---

## 7. Default and cure

Current MVP delinquency rules:

- D+1: overdue;
- D+5: default;
- payment remains possible after default;
- settlement after default marks the receivable as paid after default and the pool as cured;
- the original default remains visible in the Passport.

This preserves both negative events and subsequent recovery.

---

## 8. Stability Reserve

GRP includes a future design for a **Protocol Reserve / Stability Reserve**.

The reserve is not implemented as an automatic bailout, insurance product or unconditional investor guarantee.

The intended model is:

```text
default
  ↓
collection / recovery
  ↓
Market-specific protections
  ↓
operator loss-sharing where applicable
  ↓
request to Stability Reserve
  ↓
eligibility review
  ↓
limited partial support, if approved
```

A previously approved economic direction allocates part of protocol revenue conceptually to:

- Protocol Treasury;
- Stability Reserve;
- Market Development / Grants;
- Security, audit and compliance infrastructure.

For the hackathon MVP, the 0.50% GRP fee is collected to the GRP treasury. Separate reserve vaults and payout policy remain roadmap work.

---

## 9. On-chain architecture

Current principal accounts:

- `ProtocolConfig`
- `MarketConfig`
- `Receivable`
- `ReceivableMarket`
- `PayerAuthorization` (semantic payer commitment)
- `Validation`
- `Pool`
- `Contribution`
- `SettlementDistribution`
- `ReceivablePassport`

### Market enforcement

A new pool is bound to a MarketConfig through a ReceivableMarket PDA.

The program verifies:

- Market is ACTIVE;
- receivable originator matches Market operator;
- advance matches MarketConfig;
- funding threshold matches MarketConfig;
- investor return matches MarketConfig.

Settlement fee calculations also read from MarketConfig.

---

## 10. Off-chain architecture

Neon/PostgreSQL stores operational and private data such as:

- session/profile data;
- documents and evidence references;
- PII;
- operational status;
- Market metadata;
- audit events;
- application reconciliation data.

The database does not replace Solana as the canonical financial state.

---

## 11. Trust model

GRP does not attempt to eliminate every trust assumption.

The protocol deliberately separates responsibilities:

### GRP

- canonical financial state;
- enforcement of protocol and Market economics;
- settlement primitives;
- portable Passport;
- Market registry / configuration.

### Market Operator

- origination;
- validation / underwriting rules;
- local operations;
- distribution;
- customer support;
- local rail coordination;
- declared compliance responsibilities.

### Payer

- confirms the obligation;
- signs the actual settlement transaction.

### Investors

- choose whether to fund an opportunity;
- claim distributions after settlement.

---

## 12. Why Solana

The hackathon implementation uses Solana because GRP benefits from:

- low transaction costs;
- fast finality;
- account-based programmable state;
- mature SPL token infrastructure;
- strong wallet ecosystem;
- suitable composability for Markets and reputation primitives.

USDC is used as the primary financing and settlement asset.

SOL is used for transaction fees and program execution.

---

## 13. Current deployment

Network: **Solana Devnet**

Program ID:

`CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY`

Web application:

**https://global-receivables-protocol.vercel.app/**

The current system is experimental and not approved for production use or real-money deployment.

---

## 14. What is implemented

Current Devnet MVP includes:

- Solana wallet authentication;
- receivable creation;
- payer commitment;
- validation;
- MarketConfig on-chain;
- market-specific economic enforcement;
- USDC pool funding;
- disbursement;
- payer-signed settlement;
- investor distribution;
- separate Market and GRP treasury fees;
- requester residual;
- overdue/default/cure state;
- Receivable Passport;
- Market lifecycle;
- Vercel-hosted application.

---

## 15. Roadmap

Next hardening areas:

1. complete latest Anchor end-to-end integration coverage;
2. Rail Registry;
3. Stability Reserve vault and governance policy;
4. independent security review;
5. expanded Market governance;
6. jurisdiction-specific operational and compliance frameworks;
7. mainnet readiness criteria.

---

## 16. Scope and disclaimer

GRP is an experimental hackathon prototype.

It is not presented as a regulated financial service, guaranteed investment product, insurance product or production-ready lending platform.

Production deployment would require additional legal, regulatory, operational, custody, security and risk review.
