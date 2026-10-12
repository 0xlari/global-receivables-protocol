# GRP demo walkthrough

Target duration: **2 minutes 50 seconds**, including cards and transitions. Use screen capture with English narration. This is a Solana Devnet demonstration using fictional data and test tokens.

## Preparation

Use four distinct wallets: requester, payer, market operator and investor. Rehearse the complete flow before recording. The example uses a **100 USDC** receivable and an **80 USDC** funding target.

## Recording sequence

| Time | Screen | English narration |
|---|---|---|
| 0:00–0:15 | GRP, Markets, ERH; identify Devnet | This is Global Receivables Protocol running on Solana Devnet. Elas Recebem Hoje is its first market application. We will follow a receivable through creation, funding, repayment and distribution, using four distinct wallets. |
| 0:15–0:40 | Requester creates the receivable | The requester creates a receivable for one hundred USDC with an agreed due date. Private operational details stay off-chain. The requester generates a private confirmation link for the payer. |
| 0:40–1:05 | Payer confirms; operator approves | The payer reviews and signs the obligation. This does not authorize automatic withdrawals. The market operator then validates and approves the receivable. |
| 1:05–1:30 | Open pool; investor funds 80 USDC | The approved receivable opens a pool with an eighty USDC target. The investor funds the full target. The contribution is recorded on Solana under the market configuration. |
| 1:30–1:50 | Requester signs disbursement | The requester receives an eighty USDC advance. The original obligation remains one hundred USDC. |
| 1:50–2:10 | Payer repays; Explorer confirmation | The payer signs a fresh transaction to repay one hundred USDC. The receivable is settled. GRP does not pull tokens automatically from the payer's wallet. |
| 2:10–2:35 | Claims and fee distribution | The investor claims eighty-two point eight USDC: eighty in principal and two point eight in return. One USDC goes to the market treasury, zero point five to the protocol treasury, and fifteen point seven to the requester as the residual. |
| 2:35–2:50 | Real Passport update; repository | The Receivable Passport reflects the settlement and preserves performance history. The application and Anchor source are available in our repository. This is an experimental Devnet prototype. |

## Verification

Record each result only after it has been confirmed on-screen. Keep at least one verifiable Devnet transaction signature. Show the real Passport update; illustrative metrics are not evidence. Cut waiting time without changing operation order. Do not expose credentials, seed phrases, real personal data or active private confirmation links. Check the final exported duration.

Application: https://global-receivables-protocol.vercel.app/

Repository: https://github.com/0xlari/global-receivables-protocol/tree/migration/grp-phase-1
