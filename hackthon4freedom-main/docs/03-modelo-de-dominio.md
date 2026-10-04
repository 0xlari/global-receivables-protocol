# Modelo de domínio

## Entidades principais

| Entidade | Atributos essenciais |
|---|---|
| User | id opaco, reputation_id aleatório, papéis, status, país |
| WalletAuthenticator | usuário, domínio LNURL-auth, hash da linking key, uso, revogação |
| AuthChallenge | hash de k1, hash do token de polling, domínio, expiração, consumo |
| AppSession | usuário, hash do token, expiração, revogação |
| IdentityEvidence | tipo, emissor, referência protegida, status, validade |
| CreditLimit | limite total/usado/disponível, moeda, versão da regra, justificativas |
| Collateral | ativo, valor, cotação, status, regra de liberação |
| Client | id opaco, país, contatos protegidos, histórico agregado |
| Receivable | país de origem, país do cliente, moeda do contrato, valor nominal, vencimento, solicitante, cliente, hash de evidência |
| Confirmation | token hash, resposta, divergências, aceite de pagamento BTC, versão dos termos, instante |
| Validation | regras executadas, resultados, decisão, versão, revisão excepcional |
| Pool | modalidade, meta, prazo, cotação, progresso, estado |
| ContributionIntent | valor solicitado, invoice, expiração, estado |
| Contribution | valor recebido, ativo, participação, referência de pagamento |
| Quote | par de moedas/ativos, preço, spread, fonte, instante, validade, arredondamento |
| Swap | entrada, saída, taxa, provedor, estado, referências |
| Disbursement | destinatário, ativo, valor, estado |
| Repayment | pagador, invoice, valor, estado |
| Distribution | principal, resultado, custos, parcela, estado |
| GuaranteeClaim | motivo, limite, reserva usada, recuperação |
| ReputationFact | sujeito, tipo, emissor, evidência, peso, validade |
| NostrPublication | payload seguro, event id, relays, tentativas, estado |
| AuditEvent | ator, ação, alvo, antes/depois, correlação, instante |

## Relacionamentos

- User possui evidências, limite, garantias e fatos de reputação.
- User possui uma ou mais carteiras autenticadoras; a reputação pertence ao User, nunca a um endereço de pagamento isolado.
- Receivable pertence a uma solicitante e referencia um Client.
- Receivable possui confirmações e validações versionadas.
- Receivable aprovado origina no máximo uma Pool ativa.
- Receivable sem aceite explícito do cliente para pagamento em BTC não pode originar Pool.
- Pool possui intenções, aportes, desembolso, pagamento e distribuições.
- Todo movimento financeiro referencia uma operação e eventos de auditoria.

## Identificadores e privacidade

IDs públicos são aleatórios e não sequenciais. CPF, contatos, contratos, invoices completas, destinos Lightning e dados bancários ficam em armazenamento privado. A linking key LNURL-auth é específica do domínio e armazenada como hash; não é publicada no Nostr. Hash não torna dado de baixa entropia anônimo; hashes publicados usam identificador opaco e salt/estrutura que impeça comparação externa.

## Máquinas de estado

### Recebível

`DRAFT -> AWAITING_CLIENT -> UNDER_VALIDATION -> NEEDS_CORRECTION | REJECTED | APPROVED -> POOLED -> ADVANCED -> DUE -> PAID | DEFAULTED -> CLOSED`

Regras: somente `APPROVED` cria pool; duplicidade confirmada leva a `REJECTED`; correção cria nova versão preservando auditoria.

### Validação

`PENDING -> RUNNING -> NEEDS_REVIEW | PASSED | FAILED`

`NEEDS_REVIEW -> PASSED | FAILED`. Toda decisão registra versão das regras e motivos legíveis.

### Pool

`DRAFT -> OPEN -> FULL | PARTIAL_EXPIRED | CANCELLED`

`PARTIAL_EXPIRED -> ACCEPTED_PARTIAL | REFUNDING`; `FULL | ACCEPTED_PARTIAL -> DISBURSING -> FUNDED -> SETTLING -> SETTLED | COVERED | DISPUTED`.

### Aporte

`CREATED -> INVOICE_ISSUED -> PENDING -> SETTLED | EXPIRED | FAILED`

`SETTLED -> ALLOCATED -> DISTRIBUTED | REFUND_PENDING -> REFUNDED`. Uma referência Lightning liquidada só pode originar um aporte.

### Pagamento do cliente

`SCHEDULED -> INVOICE_ISSUED -> PENDING -> PAID | OVERDUE -> DEFAULTED | PAID_LATE`.

### Garantia

`PROPOSED -> LOCKING -> ACTIVE -> PARTIALLY_CLAIMED | RELEASE_PENDING -> RELEASED | EXHAUSTED`.

## Regras de limite

- Base: US$ 100 equivalentes.
- Aumentos possíveis: identidade, presença digital consentida, histórico de recebíveis pagos, histórico do cliente e garantia.
- Regra provisória de garantia: US$ 500 ativos podem sustentar limite total de até US$ 1.000, sujeito a haircut por ativo.
- Redes sociais são sinais, não prova de solvência; seguidores não devem determinar limite diretamente.
- Limite nunca cresce sem motivo visível e pode cair com expiração de evidência, inadimplência ou perda de garantia.
- Valor nominal de recebíveis ativos não pode exceder o limite disponível.
- Todo `Disbursement` para a solicitante usa BTC/Lightning; saldo protegido em USDT não pode ser simultaneamente tratado como BTC desembolsado.
- `ReceivableVersion` registra `paymentPurpose` (`SALARY`, `SALE`, `COMMISSION`, `SERVICE`, `OTHER`) e descrição do pagamento.
- Taxas e spread do desembolso pertencem à solicitante e não podem reduzir contas de principal ou resultado da pool.

## Eventos de domínio

`UserVerified`, `SocialAccountConnected`, `LimitChanged`, `CollateralLocked`, `ReceivableSubmitted`, `ClientConfirmed`, `ValidationPassed`, `PoolOpened`, `ContributionSettled`, `PoolPartiallyAccepted`, `DisbursementSent`, `RepaymentReceived`, `DefaultDeclared`, `GuaranteeUsed`, `DistributionCompleted`, `ReputationFactRecorded`, `NostrEventPublished`.

## Invariantes

- Soma das participações não excede 100%.
- Principal de uma pool não paga obrigação de outra.
- Distribuição total = fundos disponíveis menos custos registrados.
- Nenhum estado financeiro retrocede sem evento compensatório.
- Publicação Nostr não contém referência capaz de revelar o recebível real.

## Autorização de pagamento do pagador

- `PayerPaymentAuthorization`: pagador, recebível, método NWC/manual, limites em msat, vencimento, validade, uso único e revogação.
- `NwcConnection`: autorização, pubkey do serviço, relays, secret cifrado, fingerprint, métodos e última validação.
- `ScheduledPaymentAttempt`: autorização, invoice, idempotência, eventos NWC, falha segura, tarifas e hash de preimage.

Autorização: `PENDING_CONNECTION -> ACTIVE | INVALID | REVOKED | EXPIRED | MANUAL_PAYMENT_REQUIRED`; `ACTIVE -> PAYMENT_PENDING | INVALID | REVOKED | EXPIRED | MANUAL_PAYMENT_REQUIRED`; `PAYMENT_PENDING -> PAID | FAILED | MANUAL_PAYMENT_REQUIRED`. `PAID` e `REVOKED` são terminais.

Tentativa: `SCHEDULED -> INVOICE_CREATED -> REQUEST_SENT -> PENDING -> SETTLED | FAILED | UNKNOWN | CANCELLED`. Cada recebível possui no máximo uma autorização e uma tentativa; `UNKNOWN` não é reenviado sem conciliação. Secret NWC nunca integra respostas, logs, auditoria, Nostr ou frontend.
