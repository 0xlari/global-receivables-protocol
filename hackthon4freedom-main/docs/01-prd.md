# PRD — Elas Recebem Hoje

## Objetivo

Demonstrar que um pagamento legítimo devido a uma pessoa no Brasil por um pagador no exterior pode, depois de confirmado e validado, originar uma pool BTC com aportes não custodiais, reputação portátil, cobertura explícita do principal e regras auditáveis de distribuição.

## Personas

1. **Solicitante no Brasil com pagador internacional:** tem salário, venda, comissão, serviço ou outro pagamento comprovável a receber e deseja antecipar até 95% do valor nominal.
2. **Aportadora:** aceita risco após consultar evidências resumidas, modalidade, prazo, reputação e proteção disponível.
3. **Pagador no exterior:** confirma a obrigação, aceita quitá-la em BTC e paga por link Lightning no vencimento.
4. **Operação administrativa:** trata exceções da validação automática e incidentes; não constitui papel público de verificadora.

## Histórias principais

- Como solicitante, quero saber meu limite antes de cadastrar um recebível.
- Como solicitante, quero aumentar meu limite conectando evidências de identidade, presença digital, histórico e garantia.
- Como solicitante, quero cadastrar e acompanhar um recebível sem expor documentos às aportadoras ou ao Nostr.
- Como pagador, quero confirmar os dados sem criar conta completa.
- Como aportadora, quero comparar pools BTC por prazo, cobertura e risco antes de aportar.
- Como participante, quero consultar no mesmo perfil meus recebíveis e as pools em que aportei.
- Como solicitante, quero compartilhar a página sanitizada da minha pool pelo WhatsApp para ajudá-la a fechar.
- Como aportadora, quero ver exatamente quem assume volatilidade, inadimplência e custos.
- Como plataforma, quero impedir recebíveis duplicados e pagadores reincidentes.
- Como participante, quero entrar com minha identidade Nostr e autorizar eventos públicos sem entregar minha chave privada à plataforma.

## Requisitos funcionais

### Conta, identidade e limite

- RF-01: criar conta sem exigir gênero.
- RF-01A: criar e acessar a conta por desafio Nostr NIP-07 de uso único, sem exigir e-mail, telefone, endereço de pagamento, saldo ou chave privada.
- RF-01B: usar `nostr_pubkey` como identidade principal e manter a reputação vinculada à mesma conta, sem unir automaticamente pubkeys diferentes.
- RF-02: atribuir limite inicial equivalente a US$ 100.
- RF-03: usar a identidade Nostr autenticada para autoria dos eventos LRP e permitir conexão de redes sociais por consentimento.
- RF-04: registrar evidências verificadas, fonte, data, expiração e impacto no limite.
- RF-05: aceitar garantia em BTC pela regra não aditiva em que US$ 1 elegível sustenta até US$ 2 de limite total.
- RF-06: explicar cada aumento ou redução do limite; missões consentidas elevam o componente sem garantia de US$ 100 até US$ 5.000 por recebível.

### Recebível e validação

- RF-07: cadastrar país do pagador, moeda estrangeira de referência, valor nominal, vencimento e evidências.
- RF-08: gerar link único, expirável e de uso controlado para o pagador confirmar e assinar com a carteira o compromisso de pagamento em BTC, deixando claro que a assinatura não movimenta sats.
- RF-09: comparar confirmação do pagador com a solicitação e registrar o aceite explícito da liquidação em BTC.
- RF-09A: tornar o recebível inelegível se o pagador recusar pagamento em BTC; não criar pool.
- RF-10: verificar identidade, integridade, duplicidade, histórico da solicitante e histórico de pagamento do pagador.
- RF-10A: registrar a origem do pagamento como `SALARY`, `SALE`, `COMMISSION`, `SERVICE` ou `OTHER`, com descrição e evidência compatíveis.
- RF-11: aprovar, recusar ou solicitar correções automaticamente; permitir revisão administrativa excepcional auditada.
- RF-11A: permitir no máximo um recebível ativo por participante; estados concluído, cancelado e rejeitado liberam novo cadastro.

### Pool e aportes

- RF-12: calcular meta da pool a partir do valor nominal e desconto de até 5%.
- RF-13: criar exatamente uma pool Full BTC para cada recebível aprovado; USDt fica fora do produto atual.
- RF-14: exibir modalidade, meta, prazo, progresso, custos, retorno estimado e riscos.
- RF-15: criar um contrato DLC bilateral por aporte, financiado sem transferir custódia à plataforma, com execução por atestação do oráculo e reembolso por timelock. **Estado: planejado — DLC permanece simulado no MVP.**
- RF-16: aceitar múltiplos aportes até a meta, impedindo sobre-financiamento.
- RF-17: se o prazo terminar parcialmente financiado, permitir à solicitante aceitar o parcial ou devolver todos os aportes.
- RF-17A: fornecer URL pública opaca e botão de compartilhamento por WhatsApp sem PII, documentos ou dados reconstruíveis do pagador.

### Liquidação

- RF-18: liberar a antecipação somente após as condições de fechamento.
- RF-18A: desembolsar a antecipação da solicitante exclusivamente em BTC via Lightning, independentemente da modalidade da pool.
- RF-18B: cobrar taxas de rede, conversão e spread da solicitante, exibindo antecipação bruta, custos e desembolso líquido; esses custos não reduzem principal ou resultado da pool.
- RF-19: gerar invoice Lightning de pagamento ao pagador no vencimento, fixando a quantidade de sats pela cotação e validade exibidas.
- RF-20: distribuir principal e resultado líquido proporcionalmente.
- RF-21: destinar 30% do resultado líquido à plataforma e 70% às aportadoras.
- RF-22: acionar a cobertura limitada da plataforma na inadimplência e registrar recuperação.
- RF-22A: apresentar separadamente valor contratual de referência, cotação, spread, tarifa Lightning, custo de swap e valor líquido; a plataforma recebe apenas BTC.
- RF-22B: exibir por pool a garantia BTC, tesouraria exclusivamente reservada, percentual coberto do principal e risco não coberto; rendimentos nunca integram cobertura.
- RF-22C: manter eventual saldo recebido do pagador segregado durante a distribuição, sem reutilização e com estado explícito para payout pendente.

### Nostr e auditoria

- RF-23: publicar atestados por signer institucional externo sem solicitar `nsec` da participante.
- RF-24: publicar somente IDs opacos, hashes, tipos de atestado e status não sensíveis.
- RF-25: manter trilha interna imutável de decisões, cotações e movimentos.

## Requisitos não funcionais

- RNF-01: operações monetárias idempotentes e conciliáveis.
- RNF-02: valores em inteiros (`msat`, centavos ou unidade mínima do ativo).
- RNF-03: criptografia em trânsito e repouso para documentos.
- RNF-04: acesso mínimo por função, MFA administrativo e dupla aprovação para saídas.
- RNF-05: nenhuma chave privada em frontend, repositório ou logs.
- RNF-06: modo demonstração visualmente distinto do modo mainnet.
- RNF-07: recuperação de falhas de webhook, relay, cotação e pagamento.
- RNF-08: acessibilidade básica, português e arquitetura preparada para espanhol.
- RNF-09: desafios Nostr expiráveis, de uso único e vinculados a URL, método, domínio e propósito; sessões revogáveis em cookie `HttpOnly`.
- RNF-10: a plataforma não armazena chaves de aportes DLC nem mantém o principal enquanto a pool está aberta.

## Regras financeiras

- `antecipacao = valor_nominal - desconto`.
- `desconto_percentual <= 5%` e varia por prazo e risco.
- `resultado_liquido = valor_recebido - principal - custos_e_perdas_aplicaveis`.
- Se `resultado_liquido > 0`, plataforma recebe 30% e aportadoras 70% proporcionalmente.
- Nenhuma distribuição pode consumir o principal de outra pool.
- Cotações têm provedor, par, instante, validade e política de arredondamento.

## Critérios de sucesso do hackathon

- Fluxo narrável em 3–5 minutos.
- Uma invoice Lightning mainnet de pequeno valor paga e conciliada.
- Pools BTC comparáveis por prazo, cobertura e risco.
- Limite inicial e aumento explicável.
- Nenhum documento ou dado pessoal em Nostr.
- Falha externa não impede a conclusão da demo em modo controlado.

## Critérios de aceite do fluxo principal

1. Uma conta com limite suficiente cadastra recebível.
2. Pagador confirma origem, descrição, valor, vencimento e aceite de BTC por link válido.
3. Pagador aceita explicitamente pagar em BTC; recusa encerra a solicitação sem pool.
4. Plataforma aprova e cria exatamente uma pool.
5. Aporte real de baixo valor altera o progresso uma única vez.
6. Encerramento parcial oferece aceitar ou reembolsar.
7. Liquidação demonstra a divisão 30/70 após custos.
8. Eventos de reputação não revelam dados reconstruíveis.

## Fora do escopo do MVP

- Operação pública irrestrita com valores relevantes.
- Cobertura ilimitada de inadimplência.
- Originação por solicitantes fora do Brasil no primeiro MVP.
- Promessa de que a rota cambial será sempre mais barata que bancos ou plataformas concorrentes.
- Recebimento, custódia ou conversão de USD, BRL ou outra moeda fiat pela plataforma.
- Motor de crédito por IA.
- Mercado secundário de participações.
- Custódia não unilateral completa e autônoma.
- Garantia de retorno ou de paridade de qualquer ativo.

## Limitações

USDt/Liquid permanece apenas como pesquisa de roadmap. DLC mainnet, carteira contratual autocustodial, recuperação, timelocks, taxas, oráculo, cobertura, custódia transitória e intermediação financeira exigem auditoria técnica, jurídica e operacional antes de produção.

## Pagamento do pagador no vencimento

> **Estado:** implementado (conexão NWC, vínculo ao recebível, validação de `pay_invoice`, armazenamento cifrado, revogação local, uso único, atestado público); controlado (validação sem execução real com `NWC_ENABLE_LIVE=false`); planejado (scheduler de vencimento, cobrança automática real, retries, reconciliação).

Depois de confirmar o recebível e aceitar BTC, o pagador conecta sua carteira via NWC para autorizar previamente o pagamento no vencimento. NWC não é login e permanece separado da identidade Nostr usada pela prestadora.

Na versão `lrp/0.1.0`, uma `NwcAuthorizationAttestation` ativa é requisito do grafo para a publicação de `PoolCreated`. A implementação de referência Elas Recebem Hoje aplica essa regra exigindo que o pagador autorize previamente o pagamento via NWC. O caminho de pagamento manual permanece disponível como fallback operacional, mas não produz `NwcAuthorizationAttestation` e, portanto, na versão `lrp/0.1.0`, não libera `PoolCreated`.

A plataforma valida `pay_invoice`, protege o secret com criptografia AES-256-GCM e aplica limite máximo, validade, revogação local e uso único. A conexão não garante saldo, rota, disponibilidade ou pagamento futuro.

**Implementado:**

- conexão da carteira por NWC;
- vínculo da autorização ao recebível;
- armazenamento cifrado dos dados privados da conexão;
- limite máximo e validade da autorização;
- verificação de `pay_invoice`;
- revogação local da autorização na plataforma; a permissão remota na carteira não é revogada automaticamente por NWC;
- uso único da autorização;
- publicação do `NwcAuthorizationAttestation` pelo originador;
- `NwcAuthorizationAttestation` ativa como requisito do grafo para `PoolCreated` na versão `lrp/0.1.0`.

**Modo controlado (`NWC_ENABLE_LIVE=false`):**

- nenhuma cobrança real é executada;
- a conexão e a autorização são registradas e validadas para demonstrar o fluxo;
- a criação da pool não movimenta fundos;
- a validação utiliza um gateway controlado (fake).

**Planejado ou experimental:**

- scheduler que identifica o vencimento e dispara a cobrança;
- criação de invoice real;
- execução real de `pay_invoice` via `RelayNwcGateway`;
- retries, reconciliação e tratamento de estado de pagamento desconhecido;
- cobrança automática real no vencimento.

Conectar a carteira NWC não movimenta fundos. A autorização é um compromisso prévio do pagador; a execução do pagamento depende do scheduler, que ainda não está conectado ao fluxo principal da aplicação.
