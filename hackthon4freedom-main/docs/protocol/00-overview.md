# Lightning Receivables Protocol (LRP) — LRP v0.1

## Status

Especificação experimental **LRP v0.1**, identificador técnico `lrp` e versão dos eventos `lrp/0.1.0`. Os kinds 8100–8114 são privados desta experiência e não representam um NIP oficial. Esta versão não autoriza mainnet, DLC real, pagamentos, aportes ou liquidação.

## Objetivo

Representar o estado público mínimo de recebíveis e pools como um grafo de eventos Nostr assinados. Qualquer cliente compatível deve conseguir verificar as assinaturas, aplicar as mesmas regras e reconstruir o mesmo estado sem consultar uma tabela canônica da plataforma.

## Fonte de verdade

- Eventos Nostr válidos e suas relações são a fonte canônica do estado público.
- PostgreSQL pode guardar sessões, documentos e contratos privados, NWC cifrado, scheduler, auditoria privada e projeções reconstruíveis.
- A assinatura Nostr determina a autoria; uma sessão LNURL-auth apenas controla acesso interno e pode ser vinculada a uma pubkey.
- Ordem de chegada, maior `created_at` ou evento mais recente, isoladamente, nunca determinam estado.

## Escopo da LRP v0.1

Esta vertical implementará `ProtocolDefinition`, `ReceivableCreated`, `PayerCommitmentProof`, `ClientValidationDecision`, `NwcAuthorizationAttestation`, `PoolCreated` e `PoolTransition`. Os demais kinds ficam reservados, sem schema aceito nesta versão.

## Invariantes

1. Todo evento passa por assinatura, schema, compatibilidade, referências e autoridade antes do reducer.
2. Valores monetários são inteiros e serializados como strings decimais.
3. Eventos públicos não contêm PII, documentos, invoices, `nsec`, URI ou secret NWC.
4. `PoolCreated` exige recebível, prova do pagador, aprovação e atestado NWC ativos e relacionados.
5. A autora da pool é a autora do recebível; aprovação e NWC pertencem ao cliente originador declarado.
6. Publicação exige dois ACKs positivos em três relays configurados.
7. Cache apagado e reconstruído deve produzir a mesma projeção pública.

## Pacotes

`packages/protocol` conterá regras puras, sem Next.js, Postgres, NDK ou relay. `packages/nostr` conterá signers, transporte, verificação e cache de eventos, dependendo do protocolo somente pelas interfaces públicas.
