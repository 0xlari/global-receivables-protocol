# Vetores de teste

Os JSON canônicos e assinaturas determinísticas serão adicionados com os schemas no segundo commit. Nenhum vetor pode conter identidade, documento, invoice, `nsec` ou secret real.

## Conjunto mínimo planejado

- um evento válido de cada tipo implementado;
- assinatura, ID, kind, tipo lógico e versão inválidos;
- campo extra/proibido e PII conhecida;
- URI, secret e relay privado NWC injetados em cada posição pública;
- referências ausentes, circulares e de tipo incorreto;
- pool sem aprovação, sem NWC ou com autores incompatíveis;
- rejeição por cliente A e aprovação válida por cliente B;
- transição válida e transições por ator/estado inválidos;
- cancelamento antes e depois de desembolso;
- limites de 4999, 5000, 9999 e 10000 bps;
- expiração da janela de 24 horas, multa e retry NWC `UNKNOWN`.

## Determinismo

Cada vetor fixará JSON canônico, hash, evento unsigned, evento assinado, resultado do validator/reducer e códigos de rejeição ordenados. Implementações independentes devem obter bytes e estado equivalentes.
