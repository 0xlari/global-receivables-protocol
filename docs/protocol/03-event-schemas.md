# Contratos dos eventos

Os schemas Zod e vetores canônicos serão entregues no segundo commit. Esta página fixa o contrato antes da implementação.

## Envelope comum

Todos os eventos contêm `protocol_version: "lrp/0.1.0"`, `event_type`, identificador opaco aleatório, timestamp Unix em segundos, tag `alt` legível, referências explícitas e somente dados públicos mínimos. A tag técnica é `["protocol", "lrp", "lrp/0.1.0"]`. Inteiros monetários usam strings decimais sem sinal, expoente ou casas decimais.

## Eventos

- `ProtocolDefinition`: nome, versão, kinds, hash da especificação, relays recomendados, compatibilidade e marca experimental; assinado pelo mantenedor.
- `ReceivableCreated`: id, título público, pseudônimo, pubkey autora, valor nominal inteiro, moeda, vencimento, categoria, país, hash não reconstruível das evidências e versão.
- `PayerCommitmentProof`: referência ao recebível, hash canônico com sal/nonce privado, confirmação, versão dos termos, aceite BTC, existência de NWC e cliente verificador.
- `ClientValidationDecision`: recebível, `APPROVED`, `REJECTED` ou `NEEDS_INFORMATION`, política, códigos de motivo, timestamp e hash opcional de relatório privado.
- `NwcAuthorizationAttestation`: recebível, estado, suporte a `pay_invoice`, teto, vencimento, expiração, uso único, fingerprint seguro, validação e executor.
- `PoolCreated`: referências às quatro pré-condições, termos financeiros imutáveis, meta, mínimo de 5000 bps, prazos, desconto, retorno, taxas, penalidades, políticas e concentração operacional v0.1.
- `PoolTransition`: pool, evento anterior, estados, motivo, ator, regra, idempotência, provas e timestamp.

## Proibições

São proibidos nome civil, CPF, contato, endereço, contrato, documento, conteúdo da confirmação, dados privados do pagador, invoice completa, saldo, preimage, `nsec`, URI NWC, secret e relay privado. A busca por chaves e padrões conhecidos complementa, mas não substitui, allowlists estritas de campos.

## Compatibilidade

Durante a série `lrp/0.1.x`, leitores aceitam apenas a mesma minor version e podem ignorar campos opcionais desconhecidos. Campo obrigatório desconhecido, major/minor incompatível ou tipo lógico divergente rejeita o evento.
