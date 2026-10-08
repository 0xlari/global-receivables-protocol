# GRP v0.1 — Solana architecture

## Goal

Define the first Solana architecture for the **Global Receivables Protocol (GRP)** before implementing the on-chain program.

The migration preserves the receivables business domain and replaces the former Bitcoin/Lightning/Nostr public-state layer.

## Product layers

### Global Receivables Protocol (GRP)

Open infrastructure for creating, validating, financing and settling receivables.

### Receivable Passport

Portable performance history derived from completed receivables and settlement outcomes.

### Elas Recebem Hoje

First vertical application of GRP, focused initially on people and small businesses in Brazil receiving from international payers.


## Market layer

GRP supports multiple approved receivables Markets. A Market is not merely a frontend label: it identifies the operating context under which receivables are originated.

### MarketConfig

Suggested fields:

- market_id
- operator
- status
- settlement_asset
- protocol_fee_bps
- operator_fee_policy
- rules_version
- geography / scope commitment
- approved_originators
- approved rail references
- reserve_eligibility
- created_at / updated_at
- bump

Every new receivable should reference its MarketConfig.

Market-sensitive compliance evidence remains off-chain. The on-chain MarketConfig exposes only the minimum state required for protocol authority, economics and auditability.

### Market approval

Markets follow:

`PROPOSED -> SANDBOX -> ACTIVE | REJECTED -> PAUSED | SUSPENDED | RETIRED`

Only protocol-approved Markets may become ACTIVE.

### Economics

GRP's initial protocol fee is **50 bps (0.50%) of successful settlement value**.

The economic layers are distinct:

- protocol fee -> GRP;
- fixed Market Activation Fee -> GRP/commercial onboarding;
- fixed recurring Market Maintenance Fee -> GRP;
- Market Operator fee -> operator economics under approved Market rules.

Initial protocol-fee allocation policy:

- 40% Protocol Treasury
- 25% Protocol Reserve / Stability Reserve
- 20% Market Development / Grants
- 15% Security, audit and compliance infrastructure

For the MVP, these may be accounting buckets rather than separate token vaults.

### Reserve principle

The Protocol Reserve is a discretionary, rule-based stability facility, not an automatic repayment guarantee. Support must be partial/capped and subject to Market/operator eligibility and a separate risk policy.

### Rail layer

Markets may use approved crypto-native, fiat or hybrid rails. Fiat-touching flows require an appropriate local operator/provider. Rail approvals and detailed compliance evidence remain operational/off-chain in the MVP, with a future Rail Registry as shared GRP infrastructure.

See `docs/21-grp-markets-operators-economics.md` for the complete model.

## Canonical state

For GRP v0.1:

- **Solana** is the canonical public financial state layer.
- **PostgreSQL/Supabase** stores private and operational data.
- Sensitive evidence is never published on-chain.
- The database may cache or index Solana state, but it must not fabricate an on-chain transition.

## Settlement asset

The hackathon MVP uses **USDC on Solana** as the primary financing and settlement asset.

Reasons:

- receivables are usually denominated in fiat/reference currencies;
- a stable settlement asset avoids forcing investors or requesters to take SOL price exposure;
- the demo becomes easier to understand;
- the asset maps naturally to cross-border receivables financing.

SOL is used for network fees and program execution.

## On-chain accounts

The first GRP program should use PDAs for protocol-owned state.

### ProtocolConfig

Singleton configuration account.

Suggested fields:

- authority
- treasury
- usdc_mint
- protocol_version
- paused
- bump

Purpose:

- define the canonical USDC mint;
- define protocol administration;
- allow an emergency pause in the MVP;
- version the protocol.

### Receivable

Represents the public state of one receivable.

Suggested fields:

- id / public nonce
- requester
- originator
- market
- payer_wallet
- payer_commitment_hash
- evidence_commitment
- original_currency_code
- nominal_amount_minor
- due_at
- status
- created_at
- updated_at
- bump

The account must not contain:

- payer name
- email
- phone
- contract text
- document URL
- CPF / tax ID
- private notes

### Validation

Records the originator decision for a receivable.

Suggested fields:

- receivable
- validator
- decision
- decision_commitment
- rules_version
- created_at
- bump

Possible decisions:

- NEEDS_INFORMATION
- APPROVED
- REJECTED

### Pool

Represents financing terms for one approved receivable.

Suggested fields:

- receivable
- requester
- usdc_mint
- target_amount
- funded_amount
- minimum_partial_bps
- discount_bps
- funding_deadline
- due_at
- status
- created_at
- bump

Invariant:

- one active financing pool per receivable.

### Contribution

Represents one investor allocation into a pool.

Suggested fields:

- pool
- investor
- amount
- created_at
- distributed_amount
- refunded_amount
- status
- bump

For the MVP, a PDA per contribution is acceptable even if a production design later aggregates positions differently.

### Settlement

Records repayment/settlement outcome.

Suggested fields:

- receivable
- pool
- settlement_amount
- settled_at
- outcome
- settlement_reference
- bump

Possible outcomes:

- PAID_ON_TIME
- PAID_LATE
- PARTIAL
- DEFAULTED

### ReceivablePassport

Aggregated portable performance account for one requester.

Suggested fields:

- subject
- receivables_created
- receivables_settled
- settled_on_time
- settled_late
- defaults
- total_settled_amount
- last_updated_at
- bump

This account must be derived from protocol outcomes and not manually editable by the requester.

## PDA strategy

Initial seed strategy:

- ProtocolConfig: ["config"]
- Receivable: ["receivable", requester, receivable_id]
- Validation: ["validation", receivable, validator]
- Pool: ["pool", receivable]
- Contribution: ["contribution", pool, investor]
- Settlement: ["settlement", receivable]
- ReceivablePassport: ["passport", requester]

Exact byte representation of `receivable_id` must be fixed before coding and remain deterministic.

## Authorities

### Requester

Can:

- create a receivable;
- accept financing terms;
- request pool creation;
- accept partial funding when protocol rules allow it.

Cannot:

- validate their own receivable;
- change settlement outcome;
- edit Passport statistics.

### Payer

The payer confirmation is initiated through a private link, but **the payer must connect the Solana wallet that will later make the repayment and sign the receivable commitment with that wallet**.

The signature binds the payer wallet to, at minimum:

- the receivable public identifier;
- the confirmed amount;
- the due date;
- the USDC mint / settlement asset;
- the GRP program or domain separator;
- an expiry / nonce to prevent replay.

The payer wallet public key becomes part of the public receivable state. Full payer identity remains private off-chain.

For GRP v0.1, the same payer wallet must authorize **a commitmentd USDC allowance at confirmation time**. The payer's USDC token account approves a GRP-controlled PDA as commitment for the exact maximum amount required for settlement.

At or after the due date, a keeper (or any permissionless caller) can invoke the GRP settlement instruction. The program verifies the receivable state, due date, mint, amount and committed payer wallet, then uses the PDA commitment authority through a Token Program CPI to transfer the authorized USDC into the settlement/pool vault.

This creates a pull-payment model: the payer does not need to return and sign again on the due date if the payer commitment is still valid.

Important limitation: SPL token payer commitment is an allowance, not a balance lock. Before settlement the payer can revoke the commitment or move the USDC elsewhere. Therefore commitmentd payment improves enforceability/automation but does not guarantee funds. A production design may add collateral, reserve requirements or escrow.

The private confirmation link proves access to the intended payer flow; the wallet signature proves control of the wallet committed to repayment; the token commitment approval grants the program bounded transfer authority.

### Originator / validator

Can:

- validate receivables;
- approve, reject or request more information;
- submit the payer-confirmation commitment;
- attest settlement facts in the hackathon MVP.

This is a deliberate centralization in v0.1 and must be disclosed.

### Investor

Can:

- contribute USDC to an open pool;
- receive distributions or refunds according to program state.

### Protocol authority

Can:

- initialize configuration;
- pause unsafe operations in the MVP;
- update explicitly upgradeable configuration.

It must not be able to silently rewrite settled receivables or Passport history.

## State machines

### Receivable

`DRAFT/CREATED -> AWAITING_PAYER -> UNDER_VALIDATION -> APPROVED | NEEDS_INFORMATION | REJECTED -> POOLED -> FUNDED -> DUE -> PAID | DEFAULTED -> CLOSED`

The application may keep richer private states off-chain, but on-chain states should stay minimal.

### Pool

`DRAFT -> OPEN -> FULL | PARTIAL_EXPIRED | CANCELLED`

`PARTIAL_EXPIRED -> ACCEPTED_PARTIAL | REFUNDING`

`FULL | ACCEPTED_PARTIAL -> FUNDED -> SETTLING -> SETTLED | DEFAULTED | DISPUTED`

### Contribution

`FUNDED -> ALLOCATED -> DISTRIBUTED | REFUND_PENDING -> REFUNDED`

## Core instructions for the first program

The first Anchor program should prioritize a complete happy path:

1. `initialize_protocol`
2. `create_receivable`
3. `record_payer_confirmation` — requires the committed payer wallet as signer and installs a bounded USDC commitment allowance for the GRP settlement PDA
4. `record_validation`
5. `create_pool`
6. `fund_pool`
7. `accept_partial_funding` if needed
8. `settle_receivable` — permissionless after due date; uses the pre-approved GRP PDA commitment to pull the bounded USDC amount from the committed payer token account
9. `distribute`
10. `update_passport` should happen as part of settlement/distribution logic, not as a free-standing requester action

The exact instruction set may be simplified during implementation if one instruction can safely perform multiple atomic transitions.

## USDC custody model for the hackathon

For the demo, the preferred model is program-controlled token accounts associated with each pool.

High-level flow:

1. investor transfers USDC into the pool vault;
2. program records contribution;
3. when funding conditions are satisfied, the program marks the pool funded;
4. disbursement/settlement behavior is executed according to the MVP demo model;
5. repayment funds are distributed pro rata.

Do not implement production-grade custody claims without explicit security review.

## Off-chain data model

Keep off-chain:

- full contracts;
- identity documents;
- payer identity;
- email and phone;
- KYC/AML outputs;
- underwriting notes;
- fraud signals;
- communication history;
- raw confirmation tokens;
- object-storage references.

On-chain:

- opaque IDs;
- requester/originator/payer wallet public keys needed for protocol authority;
- commitments/hashes;
- amounts necessary for protocol logic;
- timestamps;
- authorities;
- states;
- settlement outcomes;
- Passport aggregates.

## Privacy rule

Hashing PII does not make it safe to publish.

Only commitments generated from opaque identifiers or sufficiently high-entropy/salted material may be considered for public use.

## What is intentionally removed from the new protocol

The GRP v0.1 architecture does not carry forward:

- Nostr relay quorum;
- NIP-07 authentication as protocol identity;
- NWC authorization;
- Lightning invoices;
- Breez/Liquid settlement;
- DLCs;
- BTC-denominated pool targets;
- sats-based accounting in the new on-chain flow.

## What is preserved from the previous project

- receivable lifecycle;
- payer confirmation concept;
- validation workflow;
- one-active-pool invariant;
- partial funding concept;
- idempotency mindset;
- integer accounting;
- auditability;
- private/public data separation;
- explainable financial rules;
- reputation derived from completed financial events.

## MVP success criterion

A successful hackathon demo must show one coherent path:

`Create receivable -> payer confirms -> originator approves -> pool opens -> investor funds in USDC -> receivable settles -> funds distribute -> Receivable Passport updates`

The demo should prefer one real, understandable flow over many partially implemented features.


## Scheduled pull-payment model

Solana programs do not wake up by themselves when a timestamp is reached. GRP therefore separates **authorization** from **execution**:

1. during payer confirmation, the payer signs the receivable commitment;
2. in the same flow, the payer approves a GRP settlement PDA as commitment on the payer's USDC token account for a bounded amount;
3. the receivable stores the committed payer wallet, payer token account, commitmentd maximum and due date;
4. at or after `due_at`, a keeper/bot or any permissionless caller submits `settle_receivable`;
5. the program validates all constraints and invokes the SPL Token Program with the PDA as commitment authority;
6. funds move to the protocol settlement/pool vault;
7. settlement state and Receivable Passport are updated.

Safety requirements:

- use `ApproveChecked` / checked token operations where available;
- bind the canonical USDC mint in `ProtocolConfig`;
- payer commitment amount must be capped to the receivable settlement maximum;
- the program must never transfer before `due_at`;
- settlement must be idempotent and single-use;
- partial balance / revoked commitment must fail safely and move the receivable to an explicit payment-failure/overdue path;
- the commitment PDA must only authorize GRP settlement instructions and must not expose arbitrary transfer functionality.


## Repayment fallback and overdue recovery

GRP v0.1 must support two repayment paths for the payer:

### 1. Automatic pull settlement

At or after the due date, a keeper/backend calls `settle_receivable`.

The program attempts to pull the authorized USDC amount from the committed payer token account through the previously approved commitment PDA.

Possible outcomes:

- success -> settlement continues normally;
- insufficient balance -> receivable becomes `PAYMENT_DUE` / `PAYMENT_FAILED`;
- commitment revoked / allowance insufficient -> receivable becomes `PAYMENT_DUE` / `PAYMENT_FAILED`;
- token account invalid or wrong mint -> fail safely.

A failed pull must not mark the receivable as paid.

### 2. Manual payer repayment

The payer must also be able to repay manually at any time after the receivable is payable.

The application exposes a direct payment action using the same committed payer wallet. The payer signs a normal USDC transfer into the GRP settlement vault, and the program records the repayment against the receivable.

The manual path is the fallback when automatic pull fails.

The system must avoid double payment:

- settlement state is idempotent;
- the program checks the remaining amount due before accepting a manual payment;
- if the automatic pull later succeeds after a manual payment, it may only collect the remaining unpaid amount;
- once fully settled, further collection attempts are rejected.

### Recovery workflow

If automatic collection fails on the due date:

1. GRP records a failed payment attempt;
2. the requester is notified that the payer did not have sufficient funds or the authorization was unavailable;
3. the requester can contact their payer outside the protocol;
4. the payer can either:
   - add USDC to the committed wallet so the automatic pull can be retried; or
   - open the payment link and manually transfer USDC to the GRP settlement vault;
5. after funds arrive, GRP records settlement and resumes distribution.

The protocol is responsible for payment-state correctness; commercial collection between requester and payer remains outside the protocol.


## Delinquency policy

For GRP v0.1:

- at the contractual due date, the receivable is payable and the automatic collection path may execute;
- if the obligation remains unpaid for **1 full day after due_at**, the receivable becomes **OVERDUE**;
- when OVERDUE, the platform backend must notify the requester/originator-facing user that the payer has not completed payment and commercial collection should begin;
- the payer may still fund the committed wallet for retry or pay manually through the GRP payment flow;
- if any amount remains unpaid for **5 full days after due_at**, the receivable becomes **DEFAULTED**;
- default is recorded once in the Receivable Passport.

The smart contract records the financial state. Notifications and human collection are off-chain application responsibilities driven by the on-chain state.


## Cured default

A receivable that reaches DEFAULTED remains payable.

If the payer later settles the full remaining obligation:

- Receivable -> PAID_AFTER_DEFAULT
- Pool -> CURED
- the historical default remains recorded
- Receivable Passport increments defaults_cured
- the settlement is also counted as a late settlement

This preserves both facts: the obligation defaulted, and it was later cured.


## Payer commitment — no automatic debit

As of ADR-059, payer confirmation is commitment-only:

1. payer reviews the private receivable link;
2. payer signs `record_payer_confirmation`;
3. GRP stores the payer wallet, commitment hash and committed settlement amount;
4. no SPL token delegate is created;
5. no USDC is transferred at confirmation;
6. settlement requires a new payer signature when funds are actually paid.

The existing `PayerAuthorization` account name is retained for compatibility in this program version, but its role is now a payer commitment record.

`settle_receivable` never pulls funds. It only transitions a due receivable into payment-due state. `manual_repayment` is the payer-signed transfer path.
