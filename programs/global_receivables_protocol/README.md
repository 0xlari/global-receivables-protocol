# GRP Solana program

Initial Anchor implementation of the Global Receivables Protocol.

Current cut implements the first state layer only:

- protocol initialization;
- receivable creation;
- payer wallet binding;
- validation decision;
- emergency pause.

The next cut adds:

- checked USDC token accounts;
- bounded delegate approval for payer repayment;
- Pool and Contribution accounts;
- settlement vault;
- automatic pull settlement;
- manual repayment fallback;
- Receivable Passport.

## Toolchain

Target Anchor version: **1.2.0**.

The program ID in this hackathon branch is a development identifier and must be synchronized with the generated deploy key before deployment.
