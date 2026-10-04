# AGENTS.md

## Objetivo atual

Construir o **Global Receivables Protocol (GRP)**: infraestrutura em Solana para representar, validar, financiar e liquidar recebíveis globais.

Estrutura de produto:

- GRP = protocolo/infraestrutura.
- Receivable Passport = histórico portátil de performance derivado de recebíveis liquidados.
- Elas Recebem Hoje = primeira vertical/aplicação do protocolo.

## Regra de migração

O repositório vem do projeto Hack4Freedom baseado em Bitcoin/Lightning/Nostr.

Preservar o domínio de negócio útil e substituir a infraestrutura específica da arquitetura anterior de forma incremental.

Não apagar módulos legados enquanto ainda houver imports ou responsabilidades ativas dependentes deles.

Leia primeiro:

1. `docs/GRP_MIGRATION.md`
2. `README.md`
3. `docs/03-modelo-de-dominio.md`
4. `docs/07-seguranca-privacidade-e-riscos.md`
5. `docs/10-plano-de-testes.md`

Documentos antigos de Bitcoin/Lightning ficam em `docs/legacy-hack4freedom/` e não são fonte de verdade para novas decisões.

## Arquitetura alvo

Solana será a fonte canônica do estado financeiro público do GRP.

USDC em Solana é o ativo principal de financiamento e liquidação do MVP.

PostgreSQL/Supabase continua responsável por dados privados e operacionais:

- documentos;
- PII;
- KYC;
- dados privados do pagador;
- underwriting;
- comunicação;
- auditoria operacional.

## Legado — não desenvolver novas features

- Bitcoin-specific settlement
- Lightning
- Breez / Liquid
- NWC
- DLC
- Nostr como fonte canônica
- relay quorum
- projeções LRP/Nostr

Esses módulos podem permanecer temporariamente apenas para manter build, testes e migração controlada.

## Convenções

- Dinheiro sempre em inteiros na menor unidade do ativo.
- Operações financeiras idempotentes.
- Partidas do ledger precisam somar zero por ativo.
- Mudanças pequenas, tipadas, auditáveis e testadas.
- Dados sensíveis nunca devem ir on-chain.
- Não alterar fórmulas financeiras silenciosamente.
- Toda nova lógica pública deve deixar claro qual autoridade pode executar cada transição.
- Preferir simplificar a arquitetura ao transportar complexidade histórica para Solana.

## Comandos atuais

- `pnpm dev`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:db`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm check`

Scripts `lrp:*` são considerados legado durante a migração e não devem ganhar novas funcionalidades.

## Segurança

- Nunca armazenar private keys, seeds ou mnemonics no Git/logs.
- Nunca publicar PII ou documentos on-chain.
- Não habilitar movimentação financeira real sem autorização explícita.
- Não executar migrations destrutivas sem revisão.
- Separar claramente demo/devnet/mainnet na UI e no código.
- USDC real e mainnet somente após revisão específica.

## Testes bloqueadores

Máquinas de estado, ledger, valores, idempotência, autoridades e transições financeiras são bloqueadores.

Toda substituição de comportamento legado deve preservar ou melhorar a cobertura relevante antes de remover o código antigo.
