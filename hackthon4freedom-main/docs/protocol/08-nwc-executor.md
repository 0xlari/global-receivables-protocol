# Executor NWC da LRP v0.1

## Papel

NWC é uma autorização de pagamento revogável, não login, carteira Nostr nem garantia de saldo. Para criar uma pool na LRP v0.1, o cliente originador precisa validar suporte a `pay_invoice`, cifrar a conexão e publicar somente um atestado sanitizado.

## Dados privados

URI, secret, relays privados, saldo, invoice e preimage nunca entram no evento, cache público, resposta de leitura ou log. O fingerprint público deve ser unidirecional, com domínio e salt/segredo do cliente, sem permitir recuperar ou testar a URI.

## Interoperabilidade

A interface pode recomendar Coinos, mas aceita qualquer URI NWC válida e compatível. O adapter não deve codificar regras exclusivas de um provedor.

## Agenda sem dinheiro real

Esta etapa usa scheduler e gateway falsos. A primeira tentativa seria no vencimento, com retry em uma hora e última tentativa após 24 horas. Falha definitiva abre fallback manual; `UNKNOWN` bloqueia retry até reconciliação. Nenhuma chamada `pay_invoice` real é habilitada.

## Limitações

Atestado ativo prova apenas que o cliente conseguiu validar uma autorização naquele instante. Não prova saldo futuro, disponibilidade do relay, rota, tarifa ou sucesso no vencimento.
