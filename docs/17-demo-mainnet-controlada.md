# Fase 9 — preparação da demo mainnet controlada

## Estado em 2026-07-14

**Preparação técnica concluída; ativação operacional pendente.** Nenhuma chave foi configurada, nenhuma invoice real foi criada e nenhum fundo foi movimentado. A rota `/demo` oferece um ensaio local e um fallback offline, ambos marcados como demonstração.

## Controles implementados

- Sessão da demo vinculada a uma auditoria de prontidão `GO` e a uma referência opaca da operadora.
- Aprovação humana com checklist completo, hash do aprovador, validade máxima de duas horas e revogação.
- Ativação condicionada simultaneamente a `BREEZ_ENABLE_MAINNET=true`, `BREEZ_ENABLE_CONTROLLED_DEMO=true`, API key e mnemonic no runtime.
- Tetos fixos no PostgreSQL: 1.000 sats por invoice, 5.000 sats por sessão e 10.000 sats na carteira quente.
- No máximo uma invoice mainnet `PREPARING` ou `PENDING` em toda a aplicação.
- Circuit breaker append-only para saldo acima do teto, pagamento desconhecido, swap reembolsável ou conciliação divergente.
- Resultado desconhecido, valor divergente, pagamento tardio ou falha ao criar invoice interrompem a sessão; não existe retry externo cego.
- Nenhuma saída automática foi adicionada.

## O que falta para a invoice real

1. Nomear a operadora responsável pela carteira e pela interrupção.
2. Guardar API key e mnemonic no cofre do runtime; nunca no repositório, chat ou log.
3. Provisionar diretórios persistentes e exclusivos do SDK e do backup.
4. Reexecutar a auditoria da Fase 8 e obter `GO` com rota fresca, restauração isolada e conciliação `MATCHED`.
5. Registrar aprovação vigente e armar a sessão.
6. Habilitar as duas flags somente durante a janela acompanhada.
7. Criar e pagar uma única invoice controlada; conferir evento único, ledger, pool e reconciliação.
8. Encerrar a sessão e desligar imediatamente as flags.

Até esses itens existirem, a Fase 9 e o aceite operacional da Fase 6 permanecem abertos.
