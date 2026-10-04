# Estratégia de relays

## Quórum

A configuração base contém três relays `wss://` distintos, sem dependência exclusiva de infraestrutura da plataforma. Uma publicação só é considerada confirmada após resposta `OK` positiva de pelo menos dois relays.

Enviar bytes ao WebSocket não equivale a ACK. O publisher registra para cada relay: aceito, rejeitado ou timeout, mensagem sanitizada, duração e instante. Um relay indisponível é tolerado; menos de dois positivos produz resultado inconclusivo.

## Leitura

O subscriber consulta por kind, autor, referência de evento, pool, recebível, cliente e intervalo de tempo. Eventos adicionais de relays escolhidos pela usuária podem ampliar disponibilidade, mas passam pelas mesmas validações.

## Verificação

Antes do reducer: verificar ID e assinatura Nostr, kind/tipo, schema, versão, PII/segredos, referências e autoridade. Eventos inválidos permanecem em relatório de rejeição e nunca alteram projeções.

## Recibos e disponibilidade

Recibos de relay são operacionais, não eventos canônicos. O evento assinado é idêntico em todos os relays. Retry de publicação é idempotente pelo event ID.
