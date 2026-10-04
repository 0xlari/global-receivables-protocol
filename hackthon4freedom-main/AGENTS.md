# AGENTS.md

## Objetivo

Construir Elas Recebem Hoje: antecipação de pagamentos internacionais para pessoas no Brasil, com foco em mulheres, pools BTC/USDT, câmbio transparente e reputação Nostr. Salário, venda, comissão, serviço e outros pagamentos legítimos podem originar um recebível.

## Fontes de verdade

1. `docs/12-decisoes.md`
2. `docs/01-prd.md`
3. `docs/03-modelo-de-dominio.md`
4. `docs/04-arquitetura.md`
5. `IMPLEMENTATION_PLAN.md`

Leia `docs/00-contexto-do-projeto.md` antes dos documentos especializados.

## Comandos

- `pnpm dev`: inicia o ambiente local.
- `pnpm lint`: executa o ESLint.
- `pnpm typecheck`: valida os tipos sem emitir arquivos.
- `pnpm test`: executa os testes unitários e de componentes.
- `pnpm test:db`: aplica as migrations do zero em PostgreSQL embarcado e testa constraints, transações e idempotência.
- `pnpm test:e2e`: executa os testes de navegação em desktop e celular.
- `pnpm db:generate`: gera migrations Drizzle a partir do schema.
- `pnpm db:migrate`: aplica migrations no PostgreSQL indicado por `DATABASE_URL`.
- `pnpm db:studio`: abre o inspetor local do Drizzle.
- `pnpm build`: gera a build de produção.
- `pnpm check`: executa lint, tipos, testes unitários e build.

## Convenções

- Dinheiro em inteiros e operações idempotentes.
- Partidas do ledger são valores assinados e precisam somar zero por ativo.
- Toda alteração de schema exige migration versionada e teste partindo de banco vazio.
- Mudanças pequenas, tipadas, auditáveis e acompanhadas de testes.
- Diferenciar simulação, testnet e mainnet na UI e no código.
- Registrar decisões materiais em `docs/12-decisoes.md`.

## Segurança

- Nunca armazenar `nsec`, seeds, macaroons, preimages ou documentos no Git/logs.
- Nunca publicar PII ou dados reconstruíveis no Nostr.
- Não habilitar mainnet, saques, swaps ou custódia sem autorização explícita e limites.
- Não alterar fórmulas financeiras ou políticas de cobertura silenciosamente.

## Testes

Máquinas de estado, ledger, conversões, idempotência e autorização são bloqueadores. Consulte `docs/10-plano-de-testes.md`.

## Protegido sem autorização

Mainnet, credenciais, migrações destrutivas, política de limites, split 30/70, cobertura, schema Nostr e documentos de usuárias.
