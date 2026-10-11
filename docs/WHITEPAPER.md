# Global Receivables Protocol (GRP)

## Whitepaper — Hackathon MVP

Documentation review: 11 October 2026. This describes the current source and intended Devnet flow; deployment verification is stated separately below.

### Abstract

Global Receivables Protocol (GRP) is open infrastructure for representing, financing, settling and carrying portable performance history for real-world receivables on Solana.

GRP separates the protocol layer from the local operating layer. The protocol provides common financial state, settlement primitives and a Receivable Passport. Markets adapt those primitives to specific geographies, audiences and operating models.

The first active Market is **Elas Recebem Hoje**, focused on professionals in Brazil who have eligible payments to receive from global payers.

---

## 1. Problem

Professionals and small businesses operating across borders may wait weeks or months to receive invoices, salaries, commissions and service payments.

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

ERH parameters configured in the application and checked by the program at pool creation (deployed account verification remains part of the demo rehearsal):

| Parameter | Value |
|---|---:|
| Advance | 80% |
| Minimum partial funding | 50% of pool target |
| Investor return | 3.5% |
| Market fee | 1.0% |
| GRP fee | 0.50% |
| Settlement asset | USDC |
| Status | ACTIVE |

---

## 4. Core flow

### 4.1 Creation

A requester creates a receivable with an amount, due date, payment origin and evidence commitment.

Sensitive supporting documents must remain off-chain. The current form records evidence metadata and a salted hash commitment; complete private file storage, access control and KYC/KYB workflows are not established by this commitment.

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

A fully funded pool can be disbursed to the requester. Partial funding requires an explicit requester acceptance after the funding deadline and at least 50% of the pool target. Disbursement is a separate authorized transaction; it is not triggered automatically by time or funding alone.

### 4.6 Settlement

The payer later signs a new transaction and settles the receivable in USDC.

The payment is routed through settlement state controlled by the GRP program. In the current source, `manual_repayment` requires the entire remaining amount and permits voluntary early settlement. Partial repayment is rejected. `settle_receivable` only marks payment due after maturity and moves no funds. The deployed program version must be checked during rehearsal.

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

This example assumes the full US$800 target was funded and the US$1,000 face value repaid. Investor return is 3.5% of funded principal; Market and GRP fees are 1% and 0.50% of face value. Rates are per operation, not annualized, and repayment is not guaranteed. Amounts use integer token units with program-defined rounding.

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

The thresholds are 24 hours and five days after `due_at`. A `process_delinquency` transaction must record the transition; a clock does not execute transactions. The current Passport settlement classification uses recorded failure/default flags. If delinquency processing is skipped, a late repayment can lack those flags; accurate time-based classification and reliable processing remain hardening work. This limits claims about completeness of the performance history.

---

## 8. Stability Reserve

GRP includes a future design for a **Protocol Reserve / Stability Reserve**.

The reserve is not implemented as an automatic bailout, insurance product or unconditional investor guarantee.

The intended model is:

The proposed sequence is collection/recovery, applicable Market protections and operator loss-sharing, followed by a reserve request, eligibility review and limited partial support if approved. These are design intentions, not an implemented claims process.

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

Neon/PostgreSQL provides operational persistence for sessions, receivable metadata, payer details, evidence references and application reconciliation. The intended off-chain boundary also includes:

- session/profile data;
- documents and evidence references;
- PII;
- operational status;
- Market metadata;
- audit events;
- application reconciliation data.

The database does not replace Solana as the canonical financial state. This data boundary is not proof of a complete document repository, identity verification service or audited compliance workflow.

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

The current source implements the following primitives; this list is not a claim that each has passed a complete signed-wallet rehearsal against the currently deployed program:

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

### Verification snapshot — 11 October 2026

The P3.5 inspection confirmed Vercel production `READY` at commit `0a45c30`, HTTP 200 for 11 main pages and the logo, navigation through GRP → Markets → ERH → Solana login, and expected HTTP 401 responses from five unauthenticated private GET endpoints.

These checks did not verify authenticated database operations, token transfers, deployed MarketConfig values, investor claims or Passport updates. The four-role signed-wallet rehearsal remains pending in P3.4. Prepared demo corrections are in draft PR #1 and were not in that production snapshot.

## 15. Roadmap

Next hardening areas:

1. complete the deployed signed-wallet rehearsal and latest Anchor integration coverage;
2. Rail Registry;
3. Stability Reserve vault and governance policy;
4. independent security review;
5. expanded Market governance;
6. jurisdiction-specific operational and compliance frameworks;
7. mainnet readiness criteria;
8. complete private evidence handling and reliable delinquency/Passport time classification.

---

## 16. Scope and disclaimer

GRP is an experimental hackathon prototype.

It is not presented as a regulated financial service, guaranteed investment product, insurance product or production-ready lending platform.

Production deployment would require additional legal, regulatory, operational, custody, security and risk review.
