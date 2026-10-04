# Elas Recebem Hoje

Plataforma de antecipação de recebíveis internacionais em Bitcoin e primeira implementação de referência do **Lightning Receivables Protocol — LRP**.

O projeto nasceu no Hack4Freedom para permitir que profissionais no Brasil transformem pagamentos futuros do exterior em pools públicas de financiamento, preservando documentos e dados sensíveis fora do Nostr.

> **Estado atual:** MVP experimental. Aportes reais, movimentação de fundos, contratos DLC e execução em mainnet permanecem desabilitados.

---

## Lightning Receivables Protocol — LRP

O **Lightning Receivables Protocol — LRP** é um protocolo aberto para representar, validar, financiar e liquidar recebíveis por meio de eventos assinados no Nostr.

Identificador técnico:

```text
lrp
```

Versão atual dos eventos:

```text
lrp/0.1.0
```

O LRP define:

- schemas e formatos dos eventos;
- relações entre os eventos;
- autoridades permitidas para cada assinatura;
- validação de assinaturas e conteúdos;
- reducers determinísticos;
- estados e transições;
- publicação com quórum entre relays;
- projeções reconstruíveis;
- regras mínimas de segurança e privacidade;
- interfaces para Nostr, NWC, DLC e provas financeiras.

A plataforma **Elas Recebem Hoje** define:

- experiência do usuário;
- público prioritário;
- critérios próprios de análise;
- operação e suporte;
- documentos privados solicitados;
- política comercial;
- armazenamento privado;
- regras jurídicas e de compliance.

A plataforma pode depender do LRP. O LRP não depender da plataforma.

---

## Problema

Profissionais que prestam serviços para empresas de outros países frequentemente precisam esperar semanas ou meses para receber.

A antecipação de recebíveis já é comum entre grandes empresas, mas permanece pouco acessível para freelancers e pequenos negócios, principalmente em operações internacionais.

O projeto propõe um fluxo no qual:

1. a prestadora registra um recebível internacional;
2. o pagador confirma privadamente o compromisso;
3. um cliente originador analisa o recebível;
4. uma autorização de pagamento é verificada;
5. uma pool pública pode ser criada;
6. aportadores poderão, futuramente, financiar o recebível em Bitcoin.

---

## Fluxo do MVP

### 1. Identidade Nostr

A prestadora entra na plataforma usando uma identidade Nostr por **NIP-07**.

A mesma pubkey utilizada no login deve assinar os eventos públicos relacionados ao seu recebível.

A plataforma nunca recebe ou armazena:

- `nsec`;
- seed;
- mnemonic;
- chave privada da identidade Nostr.

O signer pode ser fornecido por uma extensão compatível com NIP-07, como a Alby Extension.

---

### 2. Criação do recebível

A prestadora cadastra as informações privadas do recebível e assina o evento público:

```text
ReceivableCreated
```

A publicação utiliza o mesmo event ID em três relays e exige quórum mínimo de dois ACKs positivos.

Documentos completos e dados pessoais permanecem no PostgreSQL e não são enviados ao Nostr.

---

### 3. Confirmação do pagador

A prestadora compartilha um link privado com o pagador.

O pagador confirma:

- descrição do pagamento;
- valor;
- vencimento;
- aceite da liquidação em Bitcoin.

A confirmação privada gera uma prova pública assinada pelo cliente originador:

```text
PayerCommitmentProof
```

O pagador não precisa possuir identidade Nostr.

O link de confirmação contém um token privado e não deve ser publicado, registrado em logs ou compartilhado publicamente.

---

### 4. Autorização NWC

O pagador pode conectar uma carteira Lightning por meio de uma URI:

```text
nostr+walletconnect://
```

Para permitir a criação da pool no MVP atual, a autorização precisa:

- estar ativa;
- permitir `pay_invoice`;
- possuir limite suficiente;
- continuar válida até o vencimento;
- ser de uso único;
- ser revogável.

A conexão NWC é obrigatória para originar uma pool nesta versão do MVP.

O caminho de pagamento manual permanece disponível como fallback, mas não libera a criação da pool LRP.

A plataforma recomenda a Coinos para o fluxo do projeto, mas o protocolo pode aceitar qualquer serviço NWC compatível.

---

### 5. Análise do recebível

O cliente originador aplica seus próprios critérios e publica:

```text
ClientValidationDecision
```

O LRP não define inteligência artificial nem uma regra universal de aprovação.

Cada cliente originador pode:

- escolher seus próprios critérios;
- analisar documentos privados;
- aprovar ou rejeitar o recebível;
- publicar sua própria decisão assinada.

Uma rejeição representa somente a decisão daquele cliente originador. Ela não invalida universalmente o recebível no protocolo.

---

### 6. Atestado NWC

Após validar a autorização privada, o cliente originador publica:

```text
NwcAuthorizationAttestation
```

O evento público contém somente informações sanitizadas, como:

- estado da autorização;
- suporte a `pay_invoice`;
- limite máximo autorizado;
- validade;
- uso único;
- fingerprint segura;
- pubkey do executor.

Nunca são publicados:

- URI NWC;
- secret NWC;
- relays privados;
- invoices;
- preimages;
- saldo da carteira;
- documentos;
- nome;
- e-mail;
- telefone.

---

### 7. Criação da pool

Após a confirmação do pagador, aprovação do recebível e atestado NWC, a prestadora revisa os termos e assina:

```text
PoolCreated
```

A pool somente aparece como válida depois de:

- assinatura da mesma pubkey usada em `ReceivableCreated`;
- publicação do mesmo event ID em três relays;
- quórum mínimo de dois ACKs;
- validação do grafo de eventos;
- processamento pelo reducer;
- criação da projeção reconstruível.

A criação de uma segunda pool ativa para o mesmo recebível é bloqueada.

---

## Eventos do protocolo

O LRP v0.1 define os seguintes eventos:

```text
ProtocolDefinition
ReceivableCreated
PayerCommitmentProof
ClientValidationDecision
NwcAuthorizationAttestation
PoolCreated
ContributionIntent
ContributionFunded
PoolTransition
OracleAttestation
RepaymentSettlement
DistributionReceipt
ReputationFact
PoolReferral
DisputeEvent
```

Os kinds utilizados atualmente são experimentais e não representam um NIP oficial.

Nem todos os eventos definidos já estão conectados ao fluxo principal do produto.

---

## Papéis no protocolo

### Prestadora

A prestadora:

- cria o recebível;
- assina `ReceivableCreated`;
- revisa os termos da pool;
- assina `PoolCreated`;
- pode cancelar antes de aportes financiados;
- pode aceitar financiamento parcial conforme os termos.

### Pagador

O pagador:

- confirma privadamente a obrigação;
- aceita ou recusa a liquidação em Bitcoin;
- conecta uma autorização NWC;
- mantém controle da própria carteira;
- pode revogar a autorização.

### Cliente originador

Na versão atual do hackathon, o cliente originador concentra temporariamente:

- validação do recebível;
- publicação da decisão;
- armazenamento cifrado da conexão NWC;
- publicação do atestado NWC;
- execução futura do agendamento;
- coordenação da liquidação;
- papel de oráculo;
- papel de contraparte operacional dos futuros DLCs.

Essa concentração é uma limitação conhecida do MVP.

### Aportadora

A aportadora poderá, em uma próxima etapa:

- manifestar intenção de aporte;
- financiar sua participação;
- receber retorno proporcional;
- acompanhar liquidação e distribuição;
- participar de processos de disputa quando aplicável.

### Relays

Os relays:

- recebem e distribuem eventos;
- não analisam documentos;
- não validam regras comerciais;
- não são autoridade financeira;
- não podem ser a única fonte disponível.

A configuração inicial utiliza três relays e exige dois ACKs positivos.

---

## Fonte de verdade e armazenamento

### Nostr

O Nostr é a fonte canônica dos estados públicos do protocolo.

Os eventos são:

- assinados;
- validados por schema;
- verificados pela matriz de autoridades;
- publicados em múltiplos relays;
- processados por reducers determinísticos;
- utilizados para reconstruir as projeções públicas.

O estado não é determinado apenas pelo evento mais recente. O grafo completo, as referências e as autoridades precisam ser validados.

### PostgreSQL

O PostgreSQL é utilizado para:

- dados privados;
- documentos e referências protegidas;
- sessões;
- operação;
- auditoria;
- tentativas de publicação;
- observações dos relays;
- agendamentos;
- conexões NWC cifradas;
- vínculos entre registros privados e eventos;
- projeções reconstruíveis;
- cache de leitura.

O banco não pode criar sozinho um estado público que dependa de assinatura Nostr.

---

## Privacidade

Não são publicados no Nostr:

- contratos completos;
- CPF ou identificação civil;
- documentos pessoais;
- nome completo do pagador;
- e-mail;
- telefone;
- mensagens privadas;
- invoices completas;
- URI NWC;
- secret NWC;
- relays privados da conexão;
- preimages;
- `nsec`;
- seed;
- mnemonic;
- informações internas de análise;
- tokens privados de confirmação.

O protocolo publica somente metadados mínimos, hashes e compromissos necessários para verificar integridade, autoridade e referências.

---

## Modos de operação

A originação possui três modos.

### `LEGACY`

Modo padrão e mais seguro.

Mantém o fluxo anterior e não publica os novos eventos LRP.

### `SHADOW`

Persiste o estado privado e constrói candidatos LRP, mas não publica nos relays.

É utilizado para comparar o comportamento do fluxo anterior com o protocolo.

### `LRP`

Utiliza eventos assinados e publicados no Nostr como fonte canônica dos estados públicos.

```env
LRP_ORIGINATION_MODE=LEGACY
```

`LEGACY` deve continuar como padrão até que o ambiente esteja explicitamente preparado para o modo LRP.

No modo LRP, o fluxo público segue esta ordem:

1. construir o evento;
2. validar o candidato;
3. solicitar assinatura;
4. verificar a assinatura;
5. publicar o mesmo event ID;
6. obter quórum dos relays;
7. executar o reducer;
8. persistir a projeção derivada.

---

## Estado atual da implementação

Já estão implementados:

- login Nostr por NIP-07;
- vínculo da sessão à pubkey Nostr;
- proteção contra troca silenciosa de identidade;
- criação e assinatura de `ReceivableCreated`;
- link privado de confirmação do pagador;
- publicação de `PayerCommitmentProof`;
- avaliação e publicação de `ClientValidationDecision`;
- criação de autorização NWC;
- armazenamento cifrado da conexão NWC;
- preparação e publicação de `NwcAuthorizationAttestation`;
- criação e publicação de `PoolCreated`;
- leitura das pools por projeções LRP;
- publicação com quórum 2 de 3;
- retries idempotentes com o mesmo event ID;
- reducers determinísticos;
- projeções reconstruíveis;
- reconstrução de projeções;
- PostgreSQL com Drizzle ORM;
- ledger de partidas dobradas;
- tabelas LRP protegidas contra acesso direto pela API pública;
- testes unitários;
- testes de integração;
- testes de banco;
- testes de componentes;
- testes E2E desktop e mobile.

Ainda não estão habilitados:

- aportes reais;
- movimentação de sats pela plataforma;
- financiamento real por Lightning;
- `ContributionIntent` conectado ao produto principal;
- `ContributionFunded` conectado ao produto principal;
- contratos DLC reais;
- distribuição financeira;
- cobrança real no vencimento;
- liquidação real;
- reembolso real;
- mainnet;
- operação totalmente independente do cliente originador.

As ações de aporte permanecem desabilitadas nas pools LRP.

---

## NWC do pagador

O servidor cifra o secret da conexão utilizando AES-256-GCM com uma chave base64 que representa exatamente 32 bytes.

```env
NWC_CONNECTION_ENCRYPTION_KEY=<32-bytes-em-base64>
NWC_ENABLE_LIVE=false
```

Para gerar uma chave local:

```bash
openssl rand -base64 32
```

Com:

```env
NWC_ENABLE_LIVE=false
```

a validação utiliza um gateway controlado e nenhum pagamento real é executado.

Com:

```env
NWC_ENABLE_LIVE=true
```

a aplicação tenta consultar o serviço NWC real.

A compatibilidade live com diferentes carteiras e serviços NWC ainda está em processo de endurecimento.

Não habilite o modo live ou mainnet sem:

- auditoria;
- limites operacionais;
- responsável operacional;
- tratamento de resultados desconhecidos;
- estratégia de retry;
- reconciliação;
- autorização explícita.

Nunca registre em logs:

- URI NWC;
- secret;
- management token;
- invoice;
- preimage;
- conteúdo privado da autorização.

---

## Breez SDK Liquid

O repositório possui uma integração experimental com o Breez SDK Liquid.

Ela não faz parte do fluxo financeiro ativo do MVP.

As opções de mainnet e execução controlada permanecem desligadas:

```env
BREEZ_ENABLE_MAINNET=false
BREEZ_ENABLE_CONTROLLED_DEMO=false
BREEZ_ENABLE_AUDIT_PROBES=false
```

Não configure mnemonic de uma carteira com fundos reais neste projeto sem revisão de segurança e autorização operacional explícita.

---

## Aportes e DLC

O desenho futuro prevê um DLC por contribuição.

No modelo planejado:

- cada aportadora financia sua própria participação;
- o projeto não mantém custódia coletiva dos fundos;
- o outpoint de financiamento pode ser público;
- a negociação do DLC permanece privada;
- a distribuição inicial pode ocorrer on-chain;
- taxas on-chain estimadas não devem superar 2% do aporte.

Na versão do hackathon, o cliente originador ainda seria a contraparte operacional dos DLCs.

Essa funcionalidade permanece desabilitada.

---

## Financiamento parcial

O desenho do protocolo prevê:

- mínimo de 50% da pool financiada;
- fechamento automático quando alcançar 100%;
- janela de 24 horas para a prestadora aceitar entre 50% e 99,99%;
- reembolso caso a prestadora não responda;
- cancelamento antes do desembolso somente com devolução dos fundos;
- impossibilidade de cancelamento simples depois do desembolso.

Essas regras ainda não movimentam fundos reais.

---

## Rodar localmente

### Requisitos

- Node.js 24;
- pnpm 10.34.5;
- PostgreSQL;
- extensão Nostr compatível com NIP-07.

Instale as dependências:

```bash
pnpm install
```

Copie o arquivo de ambiente:

```bash
cp .env.example .env.local
```

Configure ao menos:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/elas_recebem_hoje

LRP_ORIGINATION_MODE=LEGACY
LRP_ORIGINATOR_PUBKEY=

NOSTR_RELAYS=wss://relay-one.example,wss://relay-two.example,wss://relay-three.example

NWC_CONNECTION_ENCRYPTION_KEY=
NWC_ENABLE_LIVE=false

BREEZ_ENABLE_MAINNET=false
BREEZ_ENABLE_CONTROLLED_DEMO=false
BREEZ_ENABLE_AUDIT_PROBES=false
```

Aplique as migrations:

```bash
pnpm db:migrate
```

Inicie a aplicação:

```bash
pnpm dev
```

Acesse:

```text
http://localhost:3000
```

---

## Rotas principais

```text
/entrar
```

Login com identidade Nostr.

```text
/painel
```

Painel da prestadora.

```text
/recebivel
```

Criação e retomada de recebíveis.

```text
/confirmar
```

Fluxo privado do pagador, acessado por link com token.

```text
/administracao
```

Fila do cliente originador para confirmação, análise e atestado NWC.

```text
/pools
```

Explorador de pools públicas reconstruídas pelo LRP.

```text
/pools/[poolId]
```

Detalhes de uma pool pública.

---

## Comandos

### Desenvolvimento

```bash
pnpm dev
```

Inicia o ambiente de desenvolvimento.

### Build

```bash
pnpm build
```

Gera a build de produção.

### Lint

```bash
pnpm lint
```

Executa o ESLint.

### TypeScript

```bash
pnpm typecheck
```

Valida os tipos TypeScript.

### Testes

```bash
pnpm test
```

Executa a suíte Vitest.

```bash
pnpm test:db
```

Executa os testes de banco com PostgreSQL embarcado por PGlite.

```bash
pnpm test:e2e
```

Executa os testes Playwright.

### Validação completa

```bash
pnpm check
```

Executa:

1. lint;
2. TypeScript;
3. testes;
4. build.

### Banco

```bash
pnpm db:generate
```

Gera migrations do Drizzle.

```bash
pnpm db:migrate
```

Aplica as migrations.

```bash
pnpm db:studio
```

Abre o Drizzle Studio.

### LRP

```bash
pnpm lrp:rebuild-cache
```

Reconstrói o cache LRP.

```bash
pnpm lrp:rebuild-projections
```

Reconstrói as projeções LRP a partir dos eventos públicos persistidos.

---

## Stack

- Next.js 16;
- React 19;
- TypeScript;
- PostgreSQL;
- Drizzle ORM;
- Nostr;
- NIP-07;
- Nostr Wallet Connect — NWC;
- Lightning Network;
- Breez SDK Liquid;
- Vitest;
- Playwright;
- PGlite;
- Zod;
- Tailwind CSS.

---

## Segurança

Este é um projeto experimental de hackathon.

Não utilize com fundos reais sem:

- auditoria independente;
- revisão jurídica;
- revisão do modelo de ameaça;
- segregação das funções operacionais;
- proteção e rotação de segredos;
- monitoramento;
- limites financeiros;
- plano de resposta a incidentes;
- testes adicionais com carteiras e relays;
- revisão do worker de pagamentos;
- reconciliação de resultados desconhecidos;
- plano de recuperação;
- autorização operacional explícita.

Nunca faça commit de:

```text
.env.local
nsec
seed
mnemonic
BREEZ_MNEMONIC
BREEZ_API_KEY
NWC_CONNECTION_ENCRYPTION_KEY
URI nostr+walletconnect
DATABASE_URL com credenciais
tokens privados de confirmação
management tokens
invoices privadas
preimages
```

---

## Limitações conhecidas

- o cliente originador concentra funções demais;
- NWC live ainda precisa de maior compatibilidade entre carteiras;
- a fila administrativa ainda precisa de melhorias de UX;
- recebíveis rejeitados não devem oferecer ações de processamento;
- o processo de validação de identidade ainda não representa KYC real;
- a verificação de documentos utiliza estados controlados no MVP;
- aportes permanecem desabilitados;
- não há DLC ativo;
- não há cobrança real;
- não há distribuição real;
- não há mainnet;
- a licença open source ainda precisa ser definida.

---

## Roadmap

Próximos passos planejados:

1. concluir a experiência administrativa;
2. melhorar diagnóstico e compatibilidade NWC;
3. impedir ações em recebíveis rejeitados;
4. implementar fluxo real de evidência e identidade;
5. conectar `ContributionIntent`;
6. implementar aportes controlados;
7. testar financiamento Lightning;
8. desenvolver DLC por contribuição;
9. separar executor, originador e oráculos;
10. implementar oracle 2 de 3;
11. implementar liquidação e distribuição;
12. permitir operação sem dependência do cliente originador;
13. separar o LRP e a plataforma em repositórios independentes;
14. publicar documentação para adoção por outros clientes.

---

## Documentação

Comece por:

```text
docs/00-contexto-do-projeto.md
docs/01-prd.md
docs/04-arquitetura.md
docs/12-decisoes.md
IMPLEMENTATION_PLAN.md
```

O protocolo e a plataforma permanecem no mesmo monorepo durante o hackathon.

A separação em repositórios independentes deverá acontecer quando o LRP estiver estável e puder ser adotado por outros clientes.

---

## Licença

A licença do protocolo e da implementação de referência ainda precisa ser definida antes da publicação oficial como projeto open source.