# GRP Markets, Operators, Rails and Platform Architecture

## Purpose

GRP is not a single receivables application. It is infrastructure for multiple specialized receivables markets that share the same settlement and reputation primitives.

The product model is:

- **GRP** — protocol, market registry, rail registry, Receivable Passport, treasury and reserve infrastructure.
- **Market** — a specialized receivables environment for one audience, geography, receivable type or operating model.
- **Market Operator** — the approved entity responsible for operating that market.
- **Rail Provider** — the local or crypto-native payment/settlement infrastructure used by the market.
- **Receivable Passport** — portable financial history that belongs to the protocol layer and can accumulate outcomes across multiple markets.
- **Application** — the user-facing experience for a market. Elas Recebem Hoje is the first application powered by GRP.

## Product thesis

GRP scales by allowing specialized operators to bring distribution, underwriting knowledge, compliance capability and local rails into a shared protocol.

The protocol should not pretend to directly operate every jurisdiction.

> Anyone can propose a market. Only approved operators can launch one.

A market can be community-shaped in its distribution and user experience, but it remains an approved operational environment with explicit accountability.

## Market lifecycle

A new market follows:

**Propose -> Due diligence -> Sandbox -> Approval -> Launch -> Continuous monitoring**

### 1. Propose

The applicant submits:

- target audience;
- geography / jurisdictions;
- receivable types;
- expected ticket sizes and durations;
- proposed Market Operator;
- underwriting / validation model;
- settlement asset;
- required local or on-chain rails;
- fiat touchpoints, if any;
- proposed operator fee;
- risk model;
- compliance responsibilities;
- relevant partners and licenses / regulated providers, where applicable.

### 2. Due diligence

GRP reviews whether the proposed operator is capable of running the market.

Review areas include:

- operator identity and track record;
- operational capacity;
- underwriting process;
- fraud controls;
- local legal/compliance approach;
- custody and money-flow responsibilities;
- rail providers;
- data protection;
- dispute / collections process;
- conflicts of interest;
- financial risk;
- fee transparency.

GRP approval is not a substitute for jurisdiction-specific legal advice, licensing or regulatory authorization.

### 3. Sandbox

An approved candidate may first operate in a restricted sandbox with limits on:

- volume;
- number of receivables;
- investor participation;
- rail usage;
- settlement amounts;
- permitted originators;
- geography.

### 4. Approval and launch

After approval, the Market receives an active protocol configuration and can appear in the GRP Market Directory.

### 5. Continuous monitoring

An active Market remains subject to:

- operational monitoring;
- default / cure history;
- incident review;
- compliance attestations;
- rail status;
- fee disclosure;
- risk limits;
- periodic re-approval where required.

## On-chain MarketConfig

For the hackathon architecture, Market should exist as a protocol entity on Solana while sensitive compliance evidence remains off-chain.

Suggested fields:

- market_id
- operator
- status
- geography_code / market scope commitment
- settlement_asset
- protocol_fee_bps
- operator_fee_bps or operator-fee policy reference
- rules_version
- approved_originators
- rail_policy / approved rail references
- reserve_eligibility
- created_at
- updated_at
- bump

Possible statuses:

- PROPOSED
- SANDBOX
- ACTIVE
- PAUSED
- SUSPENDED
- RETIRED

Only protocol-approved Markets can move to ACTIVE.

## Receivable relationship to Market

Every new GRP receivable should identify the Market under which it was originated.

This lets the protocol know:

- which operator was responsible;
- which rules version applied;
- what fee policy applied;
- which rails were permitted;
- what geography / vertical originated the receivable;
- which Market should receive operator economics;
- which Market performance metrics should be updated.

The Receivable Passport remains protocol-level and portable across Markets.

## Market Operator

The Market Operator is responsible for the operational layer of its Market.

Depending on jurisdiction and design, responsibilities may include:

- onboarding;
- local distribution;
- receivable origination;
- validation / underwriting;
- KYC / KYB coordination;
- AML / sanctions controls where applicable;
- collections;
- customer support;
- dispute handling;
- regulatory operations;
- selecting approved local rails;
- maintaining required local partnerships.

The exact responsibilities must be declared in the Market configuration and off-chain operating agreement.

## Rail architecture

GRP should support a growing registry of approved rails.

### Crypto-native rail

Examples:

- USDC on Solana;
- future approved on-chain settlement rails.

### Fiat rail

Examples may include local bank-transfer or payment systems, but only through an operator/provider able to lawfully provide that service in the relevant jurisdiction.

### Hybrid rail

Fiat may enter or leave through a local provider while GRP keeps the canonical receivable / settlement state on-chain.

A Market may propose a new rail. Approved rails can later become reusable infrastructure for other Markets where legally and operationally appropriate.

## Economics

### Protocol fee

Approved initial protocol fee:

**0.50% of successful settlement value (50 bps).**

The protocol fee is deducted programmatically from settlement before final distribution, so GRP captures value when successful settlement occurs.

Example:

- successful settlement: 10,000 USDC
- GRP protocol fee at 0.50%: 50 USDC
- remaining settlement value: 9,950 USDC before Market-specific economics/distribution rules

### Market Activation Fee

A fixed fee charged when an approved Market is prepared for production.

It can cover:

- due diligence;
- configuration;
- technical onboarding;
- initial risk review;
- market setup;
- compliance / operational review.

Exact currency and price tiers are commercial parameters, not protocol constants.

### Market Maintenance Fee

A fixed recurring fee for an active Market.

It can support:

- Market Registry maintenance;
- monitoring;
- support;
- rule updates;
- operational review;
- protocol infrastructure.

Exact pricing remains configurable by commercial policy.

### Market Operator Fee

The Market Operator may earn a separate fee for the services it performs.

The operator fee must be disclosed and approved as part of the Market rules. It should not be silently merged with the GRP protocol fee.

### Protocol fee allocation

Initial policy target:

- **40% — Protocol Treasury**
- **25% — Protocol Reserve / Stability Reserve**
- **20% — Market Development / Grants**
- **15% — Security, audit and compliance infrastructure**

For the MVP these can be accounting buckets rather than four independent token vaults. Production implementation can later separate custody / accounting if needed.

## Protocol Treasury

The Treasury funds the continued existence and improvement of GRP.

Possible uses:

- engineering;
- infrastructure;
- audits;
- security;
- protocol research;
- integrations;
- operator tooling;
- approved ecosystem expenses.

## Protocol Reserve / Stability Reserve

The Reserve is not an automatic insurance promise and should not be marketed as a guarantee of repayment.

Its purpose is to provide exceptional, rule-based support to eligible Markets when a qualifying loss event occurs.

Suggested waterfall:

1. collection and late-settlement attempts;
2. Market-specific protections / reserves;
3. operator first-loss or loss-sharing where required;
4. request to GRP Reserve Facility;
5. eligibility and cause review;
6. capped partial support if approved.

Potential eligibility criteria:

- Market is ACTIVE and compliant;
- operator followed approved underwriting and operational rules;
- no fraud, negligence or material rule breach by the operator;
- Market has not exceeded reserve-use limits;
- operator participates in loss where required;
- support is partial and capped rather than automatic 100% reimbursement.

The exact loss-sharing and caps require a separate risk-policy decision before production.

## Market / Operator performance

The protocol should accumulate Market-level operational history in addition to requester Receivable Passports.

Possible Market metrics:

- originated volume;
- settled volume;
- on-time settlement rate;
- overdue rate;
- default rate;
- cure rate;
- recovery time;
- reserve requests;
- approved reserve support;
- incident / compliance status;
- active rails.

This is not initially a universal credit score. It is protocol performance history.

## Platform information architecture

### 1. Home — GRP overview

Purpose: explain the global idea quickly.

Show:

- problem and thesis;
- how receivable financing works;
- interactive global receivable lifecycle;
- Receivable Passport;
- global / local-market model;
- first Market preview;
- live Solana Devnet state;
- calls to explore Protocol, Build on GRP and Markets.

### 2. Protocol

Purpose: explain the infrastructure.

Show:

- receivable state machine;
- payer confirmation;
- validation;
- financing pool;
- USDC settlement;
- delinquency and cured defaults;
- Receivable Passport;
- private/off-chain vs public/on-chain state;
- MarketConfig relationship;
- protocol fee;
- Treasury / Reserve;
- live deployed program status.

### 3. Build on GRP

Purpose: explain how a new Market is created.

Show:

- who can propose;
- what a Market is;
- responsibilities of a Market Operator;
- Market lifecycle: Propose -> Due diligence -> Sandbox -> Approval -> Launch -> Monitoring;
- information required in an application;
- rails and jurisdiction responsibilities;
- commercial model: activation fee, maintenance fee, protocol fee, operator economics;
- benefits to operators: infrastructure, reputation layer, grants, rail network, compliance/security support;
- CTA: **Propose a Market**.

The CTA should lead to an application form, not instantly create an ACTIVE Market.

### 4. Markets

Purpose: directory / discovery layer for all applications using GRP.

Each Market card / page should show:

- name;
- geography;
- audience;
- Market Operator;
- status;
- supported receivable types;
- settlement asset;
- supported rails;
- operator fee disclosure;
- protocol fee disclosure;
- key Market performance metrics when available;
- link to launch/open that Market application.

Initial Market:

**Elas Recebem Hoje — Brazil — ACTIVE / first GRP vertical**

Future Markets can appear as ACTIVE, SANDBOX or COMING SOON depending on approval state.

### 5. Market application

Example: Elas Recebem Hoje.

This is the actual end-user experience for that specific community / vertical.

The application can have its own language, brand, onboarding, content and UX while using GRP underneath.

### 6. Operator Console

For approved / sandbox Market Operators.

Show:

- Market status;
- application / review status;
- rules version;
- approved rails;
- originators;
- volumes;
- receivable performance;
- overdue/default/cure metrics;
- fees generated;
- reserve eligibility;
- reserve request workflow;
- compliance tasks / attestations;
- incidents;
- protocol notices.

### 7. Protocol Admin

For GRP governance / administrative authority in the MVP.

Show:

- proposed Markets;
- due-diligence workflow;
- approve / reject / request information;
- sandbox limits;
- activate / pause / suspend Market;
- approved operators;
- approved rails;
- fee settings;
- Treasury accounting;
- Reserve accounting;
- reserve requests;
- grants;
- compliance / security review status;
- protocol configuration.

## Navigation recommendation

Public GRP navigation:

**Protocol | Build on GRP | Markets | Launch**

Recommended behavior:

- **Protocol** -> protocol architecture page
- **Build on GRP** -> Market creation / operator onboarding
- **Markets** -> Market Directory
- **Launch** -> Market Directory when more than one Market exists

Once multiple Markets exist, "Launch app" should not route directly to a single generic receivable form. The user must first enter a Market context.

For the hackathon, the directory can contain Elas Recebem Hoje as the first live Market and clearly demonstrate that more Markets can be added.

## MVP boundary

For the hackathon, prioritize:

- MarketConfig concept and minimum on-chain linkage;
- one live Market: Elas Recebem Hoje;
- Market Directory;
- Build on GRP proposal experience;
- 0.50% fee model represented in architecture and, if implemented safely, settlement logic;
- Treasury / Reserve model clearly represented;
- operator and rail governance explained;
- existing receivable happy path remains the core demo.

Do not expand the MVP into full jurisdictional compliance automation, insurance, DAO governance, permissionless market activation or production-grade reserve underwriting.
