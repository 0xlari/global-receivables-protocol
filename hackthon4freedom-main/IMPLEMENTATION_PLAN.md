# Plano de implementação — LRP + Elas Recebem Hoje

## 1. Estado atual

Este repositório contém, no mesmo monorepo:

1. o **Lightning Receivables Protocol — LRP v0.1**;
2. a plataforma **Elas Recebem Hoje**, primeira implementação de referência do protocolo;
3. componentes operacionais do cliente originador usados no MVP do hackathon.

Identificador técnico do protocolo: `lrp`
Versão dos eventos: `lrp/0.1.0`

A fundação experimental e o primeiro corte controlado do LRP foram implementados nos commits:

- `2891d53 feat: add experimental LRP v0.1 protocol foundation`
- `5f83ae6 fix: align LRP commitment terms version`
- `12b61f6 feat: add guarded LRP origination modes`
- `cf3ecb5 fix: enforce LRP authority quorum and stable retries`
- `5a6e8dd feat: add reconstructible LRP projection storage`
- `7653d0c feat: add idempotent LRP projection service`
- `b471503 feat: migrate receivable creation to LRP`

As validações desse corte encerraram normalmente, sem falhas de testes, TypeScript, build ou E2E. Nenhuma movimentação financeira real foi habilitada.

### Situação arquitetural

- O LRP já possui schemas, builders, validators, reducers, matriz de autoridades, adapters de signer, publicação em múltiplos relays e cache reconstruível.
- A criação do recebível já suporta os modos `LEGACY`, `SHADOW` e `LRP`; `LEGACY` continua sendo o padrão.
- A confirmação do pagador, a decisão do originador, o atestado NWC e a criação e leitura das pools ainda permanecem no fluxo anterior.
- A migração do produto real para usar o LRP como fonte canônica de todos os estados públicos ainda não foi concluída.
- PostgreSQL continua autorizado para dados privados, operação, scheduler, auditoria e projeções reconstruíveis.
- Mainnet, DLC real, cobrança automática real e distribuição financeira real continuam desabilitados.

---

## 2. Objetivo do hackathon

Entregar um MVP demonstrável em que uma prestadora transforma um recebível internacional futuro em uma pool pública de financiamento em Bitcoin, com:

- identidade e assinatura Nostr;
- confirmação privada do pagador;
- análise do recebível pelo cliente originador segundo critérios próprios;
- autorização NWC obrigatória para o pagamento no vencimento;
- publicação da pool em múltiplos relays;
- aportes projetados para serem não custodiais por DLC;
- estados públicos reconstruíveis sem uma tabela central como fonte de verdade;
- documentos e dados sensíveis mantidos fora do Nostr.

A prioridade do hackathon é um fluxo implementável, verificável e demonstrável. A descentralização máxima permanece como direção obrigatória de evolução, mas não deve impedir a entrega do MVP.

---

## 3. Princípios obrigatórios

### 3.1 Nostr como fonte de verdade pública

Os eventos assinados do LRP são a fonte canônica para:

- manifestação pública do recebível;
- prova pública do compromisso privado do pagador;
- decisão do cliente originador;
- atestado público da autorização NWC;
- criação da pool;
- transições públicas da pool;
- futuros aportes comprovados, liquidação, reputação, divulgação e disputas.

O banco pode indexar e projetar esses eventos, mas não pode criar ou alterar sozinho o estado público.

### 3.2 Dados privados sob responsabilidade de cada cliente

Não sobem para o Nostr:

- contratos completos;
- CPF e identificação civil;
- documentos pessoais;
- e-mail e telefone;
- mensagens privadas;
- invoice completa do recebível;
- URI ou secret NWC;
- `nsec`, seed ou mnemonic;
- preimages;
- segredos operacionais.

O protocolo pode publicar somente hashes, compromissos criptográficos e metadados mínimos necessários para verificar integridade e referências.

### 3.3 Sem IA para aprovação

O LRP não define IA de validação.

Cada cliente/aplicação:

- escolhe seus próprios critérios;
- analisa o recebível com seu processo;
- publica sua própria decisão assinada;
- pode aprovar um recebível rejeitado por outro cliente.

Uma rejeição significa apenas que aquele cliente não originará a pool segundo sua política. Ela não invalida universalmente o recebível no protocolo.

### 3.4 Assinaturas, não confiança na interface

Toda ação pública relevante precisa ser:

- assinada pelo ator autorizado;
- validada pelo schema do evento;
- referenciada no grafo de eventos;
- aceita pela matriz de autoridades;
- processada por reducer determinístico.

O estado não pode ser escolhido apenas pelo evento mais recente.

### 3.5 Uma única fonte canônica

Não manter dual-write irrestrito entre banco e Nostr.

No modo LRP, a ordem é:

1. construir evento;
2. solicitar assinatura;
3. publicar;
4. obter quórum mínimo dos relays;
5. validar assinatura, schema e autoridade;
6. executar reducer;
7. persistir apenas a projeção derivada.

---

## 4. Papéis no LRP v0.1

### Prestadora

- cria e assina o recebível público;
- revisa os termos;
- assina o `PoolCreated` depois da aprovação;
- pode cancelar antes de aportes financiados;
- pode solicitar cancelamento antes do desembolso;
- pode aceitar financiamento parcial.

### Pagador

- confirma privadamente a obrigação;
- autoriza pagamento automático por NWC;
- mantém controle da própria carteira;
- pode revogar a autorização, assumindo as consequências previstas nos termos.

A plataforma recomenda a Coinos por adequação ao fluxo, mas o LRP aceita qualquer conexão NWC compatível.

### Aportadora

- publica intenção de aporte;
- negocia e financia seu contrato DLC;
- recebe participação proporcional;
- participa de resolução amigável de disputa quando aplicável.

### Cliente originador — concentração temporária no hackathon

Na versão do hackathon, o cliente originador acumula temporariamente:

- validação do recebível;
- armazenamento cifrado da conexão NWC;
- executor do agendamento NWC;
- contraparte dos DLCs;
- oráculo;
- coordenação da liquidação.

Essa concentração é uma limitação conhecida e deve permanecer registrada como dívida arquitetural obrigatória.

### Relays

- recebem e distribuem eventos;
- não validam as regras de negócio;
- não são autoridade financeira;
- não podem ser a única fonte disponível.

A configuração inicial usa três relays e exige dois ACKs positivos.

---

## 5. Fronteira entre protocolo e plataforma

### O LRP define

- formatos dos eventos;
- versões e compatibilidade;
- referências entre eventos;
- schemas;
- builders;
- validators;
- reducers;
- matriz de autoridades;
- estados e transições;
- test vectors;
- regras mínimas de privacidade e segurança;
- interfaces para Nostr, NWC, DLC e provas financeiras.

### O Elas Recebem Hoje define

- interface e experiência;
- público prioritário;
- critérios próprios de análise;
- documentos solicitados;
- operação e suporte;
- política comercial;
- taxas cobradas pelo cliente;
- divulgação e comunidade;
- armazenamento privado;
- executor usado no hackathon;
- regras jurídicas e de compliance específicas.

A plataforma pode depender do LRP. O LRP não pode depender da plataforma.

---

## 6. Eventos do LRP v0.1

### Implementados na fundação

- `ProtocolDefinition`
- `ReceivableCreated`
- `PayerCommitmentProof`
- `ClientValidationDecision`
- `NwcAuthorizationAttestation`
- `PoolCreated`
- `PoolTransition`

### Planejados para as etapas financeiras

- `ContributionIntent`
- `ContributionFunded`
- `OracleAttestation`
- `RepaymentSettlement`
- `DistributionReceipt`
- `ReputationFact`
- `PoolReferral`
- `DisputeEvent`

Os `kind`s permanecem experimentais e centralizados no pacote do protocolo. Eles não devem ser apresentados como NIP oficial.

---

## 7. Momento exato da criação da pool

A pool somente passa a existir no protocolo quando todas as condições abaixo forem satisfeitas:

1. a prestadora publica um `ReceivableCreated` válido;
2. o pagador confirma privadamente o recebível;
3. o cliente originador publica um `PayerCommitmentProof` referente à confirmação privada;
4. o cliente analisa o recebível segundo seus próprios critérios;
5. o cliente publica `ClientValidationDecision = APPROVED`;
6. a conexão NWC é validada e armazenada de forma cifrada;
7. o cliente publica `NwcAuthorizationAttestation = ACTIVE`;
8. a prestadora revisa os termos da pool;
9. a prestadora assina `PoolCreated`;
10. o evento recebe ACK positivo de pelo menos dois entre três relays;
11. validator e reducer aceitam o grafo de referências.

A assinatura da prestadora representa o aceite dos termos. O banco não cria a pool por conta própria.

---

## 8. Regras financeiras e operacionais confirmadas

### 8.1 NWC

NWC é obrigatório para a criação da pool nesta versão.

Política de execução:

1. primeira tentativa no vencimento;
2. segunda tentativa após uma hora em erro temporário;
3. última tentativa após 24 horas;
4. fallback manual após falha definitiva;
5. estado `OVERDUE` após 48 horas;
6. estado `DEFAULTED` após sete dias;
7. resultado `UNKNOWN` bloqueia novas tentativas até reconciliação.

A URI e o secret NWC permanecem cifrados e nunca são publicados.

### 8.2 Financiamento parcial

- abaixo de 50%: a pool não pode ser aceita e segue para reembolso;
- entre 50% e 99,99%: a prestadora possui 24 horas para aceitar;
- ausência de resposta em 24 horas: reembolso;
- 100%: fechamento integral permitido.

### 8.3 Cancelamento

- sem aporte financiado: cancelamento livre pela prestadora;
- com aporte e antes do desembolso: cancelamento somente com reembolso;
- depois do desembolso: cancelamento proibido.

### 8.4 Atraso

- multa fixa: 2%;
- juros por atraso: 0,1% ao dia;
- limite total da penalidade: 10%;
- beneficiárias da penalidade: aportadoras, conforme a participação.

### 8.5 DLC

- um DLC por aporte;
- cliente originador como contraparte na versão do hackathon;
- funding outpoint público;
- negociação completa privada;
- cliente originador como oráculo na v0.1;
- evolução futura para oráculos independentes 2 de 3.

### 8.6 Liquidação e taxas on-chain

A liquidação inicial das aportadoras será on-chain.

A interface precisa estimar as taxas antes da assinatura. A operação deve ser rejeitada quando a estimativa total de taxas on-chain superar 2% do aporte, salvo nova política explicitamente versionada e aceita.

### 8.7 Disputa

Quando uma disputa for aberta:

- os fundos permanecem bloqueados;
- nenhuma distribuição é executada;
- os eventos registram provas e decisões;
- a versão do hackathon usa o cliente originador na resolução final;
- a evolução futura separará árbitro, oráculo e executor.

### 8.8 Divulgação entre clientes

Outro cliente pode divulgar uma pool e cobrar um percentual do valor financiado através da sua referência.

A atribuição precisa ser comprovada por `PoolReferral`, referenciado em `ContributionIntent` e preservado em `ContributionFunded`.

---

## 9. Estado técnico concluído

### Fundação do produto

- aplicação Next.js e painel;
- autenticação Nostr NIP-07 para a sessão da plataforma; infraestrutura LNURL-auth preservada apenas como legado de rollback;
- domínio financeiro e ledger;
- PostgreSQL/Drizzle;
- fluxos demonstrativos de recebível, confirmação, análise, pool e aporte;
- NWC privado e scheduler simulado;
- guardrails, testes e build.

### Fundação do LRP

- catálogo de kinds;
- versão `lrp/0.1.0`;
- schemas e vetores canônicos;
- builders e validators;
- prevenção de PII e secrets;
- adapters NIP-07, NIP-46, aplicativo externo e fake;
- publisher/subscriber;
- três relays com quórum de dois;
- reducers e matriz de autoridades;
- cache apagável e reconstruível;
- comando `lrp:rebuild-cache`;
- página técnica/pública reconstruída do grafo Nostr;
- testes unitários, integração, build e E2E.

### Primeiro corte concluído

A criação real do recebível foi migrada de forma controlada:

- `LEGACY` preserva exatamente o fluxo anterior e continua sendo o modo padrão;
- `SHADOW` persiste o rascunho privado, constrói e valida o candidato `ReceivableCreated`, sem publicá-lo ou alterar a autoridade do legado;
- `LRP` persiste os dados privados, solicita a assinatura Nostr da prestadora, verifica a correspondência exata com o candidato, publica o mesmo event ID com quórum de dois entre três relays, cria o vínculo imutável e atualiza a projeção reconstruível;
- retries reutilizam o mesmo evento assinado e não criam um evento equivalente;
- dados pessoais e documentos permanecem fora do evento público;
- a migration `0021_lrp_receivable_originations.sql` adiciona o armazenamento necessário sem alterar migrations anteriores.

### O que ainda não foi migrado

Continuam no fluxo legado:

- leitura pública das pools em `/pools` e `/pools/[id]`;
- aportes e demais eventos financeiros;
- a leitura agregada do histórico do painel, além da revisão da pool originada.

Não considerar concluída a migração apenas porque a criação do recebível e a infraestrutura técnica já usam o LRP.

---

## 10. Primeiro corte — migração gradual da plataforma para o LRP

### Objetivo

Migrar, em commits independentes, a primeira vertical slice real da plataforma para que o fluxo de originação utilize o LRP como fonte canônica dos estados públicos. A criação do recebível foi concluída; os demais passos exigem autorização específica.

### Escopo do primeiro corte

Migrar, no fluxo real da plataforma:

1. criação pública do recebível — concluída no commit `b471503`;
2. prova pública da confirmação privada — concluída;
3. decisão do cliente originador — concluída;
4. atestado público `NwcAuthorizationAttestation` — concluído;
5. assinatura e publicação da pool — concluída;
6. leitura da página pública da pool pelo reducer LRP — pendente;
7. projeção reconstruível no banco — concluída para recebíveis e pools originadas.

### Fora do primeiro corte

- aporte real;
- DLC real;
- mainnet;
- pagamento NWC real;
- distribuição on-chain;
- reputação completa;
- divulgação entre clientes;
- disputas reais;
- separação dos papéis do cliente originador.

### Compatibilidade e feature flags

A migração deve usar modos explícitos:

- `LEGACY`: fluxo atual, sem construir, assinar ou publicar eventos LRP; permanece como padrão;
- `SHADOW`: fluxo atual ativo, dados privados persistidos e candidatos LRP construídos e comparados sem publicação ou autoridade;
- `LRP`: eventos LRP são canônicos para o estado público; o banco mantém os dados privados, vínculos imutáveis e projeções reconstruíveis.

Não remover o fluxo legado antes de:

- reconstrução comprovada;
- testes completos;
- rollback documentado;
- aprovação explícita da fundadora.

### Critérios de aceite do primeiro corte

A etapa somente estará concluída quando:

1. a prestadora criar o recebível no fluxo real;
2. cada evento necessário for assinado pelo ator correto;
3. a pool receber dois ACKs entre três relays;
4. outro navegador reconstruir a pool;
5. a página pública não depender de uma tabela canônica;
6. apagar as projeções e executar `lrp:rebuild-cache` reproduzir o estado;
7. dados sensíveis permanecerem fora dos eventos;
8. a plataforma puder voltar ao modo legado sem perda;
9. lint, TypeScript, Vitest, integração, build e E2E passarem;
10. mainnet e dinheiro real permanecerem desligados.

---

## 11. Próximas etapas após a migração da originação

1. integrar `ContributionIntent` ao fluxo da aportadora;
2. implementar adapter e fake completo de DLC;
3. publicar `ContributionFunded` com prova pública;
4. migrar transições de financiamento parcial e integral;
5. integrar executor NWC controlado;
6. publicar pagamento, atraso e default;
7. liquidar contratos em ambiente seguro de testes;
8. publicar fatos de reputação;
9. implementar referrals entre clientes;
10. implementar disputas;
11. separar os papéis operacionais do cliente originador.

---

## 12. Roadmap obrigatório de descentralização

A versão do hackathon não é o estado final.

A evolução do LRP deve buscar:

- validadores independentes;
- cliente originador sem controle unilateral;
- múltiplas contrapartes DLC;
- executores NWC escolhidos pelas partes;
- agentes autocustodiais operados pelo pagador;
- oráculos 2 de 3;
- árbitros independentes;
- continuidade mesmo se o cliente originador sair do ar;
- interoperabilidade entre diferentes clientes e interfaces;
- menor dependência de infraestrutura central;
- extração futura do LRP para repositório próprio quando houver maturidade e segunda implementação.

---

## 13. Guardrails permanentes

- nenhuma mainnet sem aprovação explícita;
- nenhum dinheiro real no hackathon sem plano operacional aprovado;
- nenhum `nsec`, seed, mnemonic ou secret em código, log ou evento;
- nenhuma PII em relays;
- nenhuma alteração de migration existente sem revisão;
- nenhum resultado `UNKNOWN` tratado como falha comum;
- nenhum processo de teste escondido com `process.exit` ou equivalente;
- nenhuma remoção do fluxo legado antes dos critérios de corte;
- cada etapa em commits pequenos e revisáveis;
- documentação e ADR atualizadas ao final de cada corte.

---

## 14. Regra de atualização deste documento

Este arquivo é a fonte de verdade do plano atual.

Registros históricos detalhados devem permanecer em ADRs, changelog ou seção própria de histórico. Não misturar decisões superadas com a arquitetura vigente.

Ao concluir cada etapa, registrar:

- commit(s);
- arquivos principais;
- decisões;
- testes;
- limitações;
- itens adiados;
- impacto na descentralização.
