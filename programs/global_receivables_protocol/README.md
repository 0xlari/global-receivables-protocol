# GRP Solana program

Anchor implementation of Global Receivables Protocol, running on **Solana Devnet**.

Program ID: `CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY`.

## Implemented instructions

- Initialize protocol, market and requester Passport.
- Update the market treasury.
- Create a receivable and record payer confirmation.
- Record the operator validation decision.
- Create and fund a financing pool.
- Accept eligible partial funding.
- Disburse the advance to the requester.
- Record repayment and settlement.
- Claim investor distribution and requester residual.
- Process delinquency and pause the protocol.

Payer confirmation does not grant an open-ended token delegate. Repayment requires a fresh payer signature. Private supporting documents remain off-chain.

## Economics

The ERH Devnet example uses an 80% advance, a 3.5% investor return on funded principal, a 1% market fee and a 0.5% protocol fee on receivable face value after full repayment. Market configuration defines the applicable terms; do not assume every market uses ERH economics.

## Development

Toolchain: Rust, Solana CLI and Anchor **1.2.0**.

```bash
anchor build
pnpm test:anchor
```

Integration testing requires the appropriate validator, wallets and token fixtures. A build alone does not verify the complete financial flow. Automated coverage for the latest MarketConfig flow remains a hardening item.

See the [repository README](../../README.md), [architecture](../../docs/20-grp-solana-architecture.md) and [whitepaper](../../docs/WHITEPAPER.md).
