# Máquinas de estado

## Pool

Estados previstos: `PUBLISHED`, `FUNDING`, `PARTIALLY_FUNDED`, `FULLY_FUNDED`, `PARTIAL_ACCEPTANCE_PENDING`, `PARTIAL_ACCEPTED`, `REFUNDING`, `DISBURSED`, `DUE`, `PAID_ON_TIME`, `PAID_LATE`, `OVERDUE`, `DEFAULTED`, `DISPUTED`, `SETTLED` e `CANCELLED`.

O reducer aceita uma transição somente se evento anterior, estado anterior, autoridade, provas e regra de tempo forem coerentes com o grafo já validado. Não usa simplesmente o maior timestamp.

## Financiamento parcial

- Abaixo de 5000 bps no prazo: `REFUNDING`.
- De 5000 a 9999 bps: `PARTIAL_ACCEPTANCE_PENDING` por 24 horas.
- Aceite da prestadora no prazo: `PARTIAL_ACCEPTED`.
- Ausência ou recusa: `REFUNDING`.
- 10000 bps: `FULLY_FUNDED` e fechamento automático do financiamento.

## Cancelamento

- Sem aporte financiado: cancelamento livre pela prestadora.
- Com aporte e antes de `DISBURSED`: pedido leva a `REFUNDING`.
- Depois de `DISBURSED`: cancelamento inválido.

## Agenda NWC simulada

No vencimento ocorre a primeira tentativa fake; falha temporária permite nova tentativa após uma hora e última tentativa após 24 horas. Falha definitiva leva a fallback manual. Após 48 horas, `OVERDUE`; após sete dias, `DEFAULTED`. Resultado `UNKNOWN` bloqueia nova tentativa até reconciliação.

## Penalidade

Os termos registram multa fixa de 200 bps, juros de 10 bps ao dia e teto total de 1000 bps. O cálculo usa inteiros, arredondamento documentado e nunca é executado financeiramente nesta etapa.
