# Nostr e reputação

> **Estado:** implementado (login NIP-07); planejado (eventos de reputação dimensionais).
>
> Este documento descreve a plataforma **Elas Recebem Hoje**. O protocolo **LRP** é especificado separadamente em `docs/protocol/`.

## Objetivo

Permitir que participantes carreguem evidências assinadas de histórico sem publicar documentos ou transformar uma pontuação central em verdade universal. O banco interno continua necessário para autorização, privacidade, contestação e cálculo contextual.

## Identidade e assinatura

- O login ativo da plataforma usa **NIP-07** (signer de navegador). A pubkey Nostr da sessão é a identidade principal da participante.
- A mesma pubkey da sessão assina os eventos públicos da prestadora: `ReceivableCreated` e `PoolCreated`.
- A plataforma nunca solicita, recebe, registra ou recupera `nsec`, seed ou mnemonic.
- LNURL-auth permanece somente como backend legado, não exposto na interface de login.
- O signer institucional do cliente originador é distinto da pubkey da prestadora: é pré-configurado por variável de ambiente e assina `PayerCommitmentProof`, `ClientValidationDecision` e `NwcAuthorizationAttestation`.
- NIP-55 (aplicativo assinador no Android) é uma possibilidade futura, claramente não implementada no produto atual.

## Modelo de reputação dimensional

Não existe uma única “nota de confiança”. A interface mostra dimensões e evidências:

1. **Identidade:** níveis verificados e validade, sem expor documentos.
2. **Recebíveis:** confirmados, concluídos, corrigidos e contestados.
3. **Pagamento do cliente:** pontualidade, atraso e inadimplência.
4. **Participação:** pools financiadas, reembolsos e distribuições.
5. **Garantia:** faixa de cobertura ativa, nunca endereço ou saldo exato público.
6. **Antiguidade/consistência:** tempo e diversidade de emissores.

O limite de crédito usa regras internas transparentes e pode consumir esses sinais. Seguidores ou popularidade não equivalem a solvência.

## Emissores e confiança

Cada fato registra emissor, relação com a operação, momento, fonte, validade e status de correção. A confiança depende da pubkey do emissor, histórico, independência e escopo da declaração. Assinatura prova autoria e integridade, não veracidade.

## NIPs avaliadas

| NIP | Uso | Decisão e limitações |
|---|---|---|
| NIP-01 | Eventos, assinaturas e referências | Base obrigatória dos eventos públicos do LRP; não define sozinho a semântica de reputação. |
| NIP-07 | Signer de navegador | Implementado e obrigatório para login e assinatura dos eventos da prestadora. |
| NIP-46 | Signer remoto | Planejado para signers externos; não implementado no produto atual. |
| NIP-98 | Autorização HTTP assinada | Avaliado, mas não adotado como mecanismo de login do MVP. |
| NIP-32 | Labels | Avaliado; não será fonte única de reputação ou risco. |
| NIP-58 | Badges | Planejado somente para conquistas positivas. |
| NIP-85 | Trusted Assertions | Avaliado; não adotado no MVP atual. |
| NIP-09 | Pedido de exclusão | Pode solicitar exclusão, sem garantia de remoção pelos relays. |

Decisão do MVP: evento de aplicação addressable `kind 30078`, com schema versionado `erh.reputation.v1`. O `d` inclui `reputation_id` pseudônimo, tipo de fato e referência opaca da operação, preservando correções append-only. Eventos desconhecidos podem ser ignorados por outros clientes; o espelho interno permanece a fonte para autorização e contestação.

## Tipos de atestado

`identity_level_verified`, `receivable_confirmed`, `pool_funded`, `repayment_on_time`, `repayment_late`, `operation_completed`, `dispute_resolved`, `badge_awarded`.

No MVP público, priorizar eventos positivos e não sensíveis. A publicação de eventos negativos identificáveis exige consentimento, política de contestação e revisão jurídica. Internamente, sinais negativos continuam necessários para risco e segurança.

## Payload seguro de exemplo

```json
{
  "schema": "erh.reputation.v1",
  "subject": "<reputation_id pseudônimo>",
  "assertion": "operation_completed",
  "operation_ref": "opaque-random-reference",
  "occurred_at": "2026-07-14T00:00:00Z",
  "evidence_hash": "hash-of-canonical-internal-attestation",
  "issuer_role": "platform"
}
```

Não incluir valor, moeda, cliente, vencimento real, contrato, contato, localização ou ID interno previsível.

## Publicação e leitura

- Validar ID e assinatura antes de aceitar evento.
- Deduplicar por event ID e chave semântica.
- Publicar em pelo menos dois relays configurados, registrando confirmação por relay.
- Fila de retry não bloqueia dinheiro.
- Resultados de relays são cacheados e reconciliados.
- Eventos conflitantes permanecem visíveis no histórico interno; correção referencia o anterior.

## Revogação e correção

Nostr é append-only na prática. Uma correção publica novo evento assinado referenciando o anterior e altera o estado interno. NIP-09 pode solicitar exclusão, sem garantia. A interface deve preferir a declaração válida mais recente sem apagar a trilha.

## Portabilidade e Sybil

O `reputation_id` pode ser compartilhado voluntariamente como referência interna, mas não substitui a identidade Nostr nem revela chaves privadas. Criar identidades Nostr é barato, por isso a plataforma não concede limite relevante apenas pela posse de uma pubkey. Os sinais ganham peso quando são emitidos por autoridades reconhecidas, vinculados a operações reais e acumulados ao longo do tempo.

## Referência

[Repositório oficial de NIPs](https://github.com/nostr-protocol/nips)
