# Kinds experimentais da LRP

A definição executável está em `packages/protocol/src/kinds.ts`. O número sozinho não basta: todo consumidor deve validar `protocol_version` e `event_type`.

| Kind | Nome | LRP v0.1 |
|---:|---|---|
| 8100 | `PROTOCOL_DEFINITION` | implementar |
| 8101 | `RECEIVABLE_CREATED` | implementar |
| 8102 | `PAYER_COMMITMENT_PROOF` | implementar |
| 8103 | `CLIENT_VALIDATION_DECISION` | implementar |
| 8104 | `NWC_AUTHORIZATION_ATTESTATION` | implementar |
| 8105 | `POOL_CREATED` | implementar |
| 8106 | `CONTRIBUTION_INTENT` | reservado |
| 8107 | `CONTRIBUTION_FUNDED` | reservado |
| 8108 | `POOL_TRANSITION` | implementar |
| 8109 | `ORACLE_ATTESTATION` | reservado |
| 8110 | `REPAYMENT_SETTLEMENT` | reservado |
| 8111 | `DISTRIBUTION_RECEIPT` | reservado |
| 8112 | `REPUTATION_FACT` | reservado |
| 8113 | `POOL_REFERRAL` | reservado |
| 8114 | `DISPUTE_EVENT` | reservado |

Kinds reservados não possuem schema aceito na versão de eventos `lrp/0.1.0` e devem ser ignorados pelo reducer desta versão.
