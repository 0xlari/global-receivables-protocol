# Registro de decisões

## ADR-040 — criação de pool assinada pela prestadora no LRP

- **Data:** 2026-07-21
- **Status:** implementada atrás dos modos `LEGACY`, `SHADOW` e `LRP`
- **Decisão:** `PoolCreated` somente é preparado após `ReceivableCreated`, `PayerCommitmentProof`, `ClientValidationDecision = APPROVED` e `NwcAuthorizationAttestation = ACTIVE`. O identificador canônico do atestado é `NwcAuthorizationAttestation`. Os termos são calculados pelo domínio financeiro, exibidos integralmente e vinculados a consentimento explícito antes da assinatura pela mesma pubkey de `ReceivableCreated`.
- **Persistência:** a preparação privada e o hash dos termos ficam em `lrp_pool_originations`; em `LRP`, a pool privada só é aberta depois do quórum 2/3 e do vínculo imutável com o event ID. Em `SHADOW`, o legado continua canônico e o candidato não é publicado.
- **Consequências:** retry reutiliza o mesmo evento assinado; alteração posterior dos termos, perda da autorização NWC, autoria divergente e segunda pool para o mesmo recebível são bloqueadas. Leitura de `/pools`, aportes, DLC, pagamentos reais e mainnet permanecem fora deste corte.

## ADR-039 — sessão e perfil separados por carteira

- **Data:** 2026-07-19
- **Status:** implementada no fluxo demonstrativo
- **Contexto:** LNURL-auth já associava a linking key específica do domínio a um usuário distinto, mas a API de sessão devolvia somente um booleano e todo o estado demonstrativo era salvo numa única chave do navegador. Assim, carteiras diferentes no mesmo navegador pareciam acessar a mesma conta.
- **Decisão:** a sessão `HttpOnly` continua sendo a única credencial da aplicação e passa a devolver apenas um `reputation_id` opaco e um rótulo curto. Recebíveis, pools originadas e aportes demonstrativos são isolados por esse perfil. A opção “Trocar carteira” revoga a sessão atual antes de emitir novo desafio LNURL-auth. A mesma linking key no mesmo domínio recupera o mesmo perfil; chaves diferentes criam perfis diferentes.
- **Privacidade:** pubkey, linking key, assinatura, hash do autenticador e token de sessão não são devolvidos à interface. O estado legado não é atribuído automaticamente a nenhuma carteira, porque não existe prova segura de propriedade.
- **Limitação:** o perfil e a autenticação são persistidos no PostgreSQL, mas o roteiro demonstrativo de recebíveis e aportes permanece no navegador, agora separado por perfil. Sincronização entre dispositivos exige ligar esses históricos aos repositórios PostgreSQL em etapa posterior.
- **Consequências:** testes devem provar isolamento entre carteiras, recuperação do mesmo perfil, revogação na troca e ausência de acesso horizontal.

## ADR-001 — público aberto com foco em mulheres

- **Data:** 2026-07-14
- **Status:** confirmada
- **Contexto:** produto nasce para mulheres no Brasil que recebem pagamentos do exterior, sem exclusividade obrigatória.
- **Alternativas:** exclusivo; prioridade formal; aberto com posicionamento focado.
- **Decisão:** aberto a todos, com marca e comunidade focadas em mulheres.
- **Consequências:** não verificar gênero; medir impacto com consentimento e dados agregados.

## ADR-002 — validação pela plataforma

- **Data:** 2026-07-14
- **Status:** confirmada
- **Alternativas:** verificadora comunitária; aportadora; plataforma.
- **Decisão:** plataforma automática com revisão administrativa excepcional.
- **Consequências:** regras versionadas, explicabilidade e auditoria; aportadora não valida.

## ADR-003 — desconto variável até 5%

- **Data:** 2026-07-14
- **Status:** confirmada
- **Decisão:** preço varia por prazo/risco, limitado inicialmente a 5%.
- **Consequências:** fórmula precisa ser transparente e não pode prometer competitividade universal.

## ADR-004 — resultado 30/70

- **Data:** 2026-07-14
- **Status:** confirmada
- **Decisão:** depois de custos, 30% do resultado líquido para plataforma e 70% para aportadoras.
- **Consequências:** principal é intocável; perdas e resultado não positivo precisam de regra explícita.

## ADR-005 — pool parcial

- **Data:** 2026-07-14
- **Status:** confirmada
- **Decisão:** solicitante pode aceitar antecipação parcial; se recusar, aportes são devolvidos.
- **Consequências:** novo aceite informado e custo de reembolso transparente.

## ADR-006 — duas modalidades

- **Data:** 2026-07-14
- **Status:** substituída pela ADR-035
- **Decisão:** Full BTC com risco cambial da aportadora; pool USD com conversão imediata a USDT.
- **Consequências:** UI e ledger separam exposição; Full BTC não garante os mesmos sats.

## ADR-007 — USDT no ecossistema Bitcoin

- **Data:** 2026-07-14
- **Status:** substituída pela ADR-026
- **Decisão anterior:** avaliar USDT via Taproot Assets/Lightning.
- **Consequências:** não será implementada no MVP; preservada apenas como histórico da decisão.

## ADR-008 — custódia

- **Data:** 2026-07-14
- **Status:** assumida para o MVP
- **Alternativas:** carteira da plataforma; escrow/multisig.
- **Decisão:** custódia própria extremamente limitada no MVP; escrow como arquitetura futura.
- **Consequências:** segurança, reserva, reconciliação e avaliação jurídica são bloqueadores de produção.

## ADR-009 — pagamento Lightning

- **Data:** 2026-07-14
- **Status:** confirmada
- **Decisão:** aportes e pagamento do pagador usam BTC via Lightning.
- **Consequências:** pagador precisa de carteira/liquidez; invoice e cotação têm validade.

## ADR-010 — cobertura de inadimplência

- **Data:** 2026-07-14
- **Status:** confirmada com limites pendentes
- **Decisão:** plataforma cobre aportadoras e recupera da parte responsável.
- **Consequências:** reserva segregada, tetos e termos; não pode ser ilimitada.

## ADR-011 — limite progressivo

- **Data:** 2026-07-14
- **Status:** regra demonstrativa confirmada
- **Decisão:** US$ 100 base; identidade, redes sociais consentidas, histórico e garantia aumentam limite. Exemplo: US$ 500 em garantia pode liberar até US$ 1.000.
- **Consequências:** regras explicáveis, expiração e proteção contra fraude. A fórmula v0.1 está em `docs/14-guardrails-operacionais.md`; calibração e haircut para operação real permanecem futuros.

## ADR-012 — Nostr sem chave privada

- **Data:** 2026-07-14
- **Status:** parcialmente substituída pela ADR-032
- **Decisão:** NIP-98 assinado por NIP-07 para vínculo opcional de reputação; NIP-46 atrás de adapter alternativo; atestados `kind 30078` mínimos, sem PII, contratos ou valores. NIP-85 foi descartado no MVP porque o draft atual não modela os fatos operacionais necessários.
- **Consequências:** assinatura não prova verdade; desafio é efêmero e de uso único; correção é append-only; relays não participam da autorização financeira.

## ADR-013 — recorte geográfico e cambial

- **Data:** 2026-07-14
- **Status:** confirmada
- **Decisão:** primeiro público composto por pessoas no Brasil com pagamentos devidos por pagadores no exterior, com foco de produto e comunidade em mulheres; expansão posterior para outras origens na LATAM.
- **Consequências:** preservar moeda original, exibir câmbio e tarifas, avaliar Brasil e país do pagador e não alegar operação regional simultânea.

## ADR-014 — dinheiro real no pitch

- **Data:** 2026-07-14
- **Status:** confirmada
- **Decisão:** um aporte Lightning real e pequeno; restante controlado quando não seguro/autorizado.
- **Consequências:** modo demo explícito, allowlist, teto e plano alternativo.

## ADR-015 — transparência cambial

- **Data:** 2026-07-14
- **Status:** confirmada em princípio
- **Decisão:** a plataforma facilita a compreensão da equivalência entre a moeda estrangeira contratual, BTC/USDT e referência em BRL, exibindo cotação, spread, tarifas e líquido separadamente.
- **Consequências:** a plataforma não executa conversão fiat, não recebe USD/BRL e não promete menor custo sem comparação verificável.

## ADR-016 — desembolso exclusivo em BTC

- **Data:** 2026-07-14
- **Status:** confirmada
- **Decisão:** a solicitante recebe a antecipação exclusivamente em BTC via Lightning, inclusive na modalidade pareada em dólar.
- **Consequências:** a pool pareada mantém obrigação/hedge em USDT e exige liquidez BTC separada da tesouraria; BRL e USDT não são opções de saque da solicitante.

## ADR-017 — stack do MVP

- **Data:** 2026-07-14
- **Status:** aprovada para implementação
- **Decisão:** Next.js/TypeScript, pnpm, PostgreSQL, Drizzle, Vitest, Testing Library e Playwright; integrações externas atrás de adapters.
- **Consequências:** monólito modular na primeira versão; versões exatas serão fixadas na Etapa 1 usando releases estáveis/LTS.

## ADR-018 — limites mainnet da demo

- **Data:** 2026-07-14
- **Status:** aprovada para implementação
- **Decisão:** 1.000 sats por aporte, 5.000 sats recebidos por sessão e 10.000 sats na carteira quente; uma invoice ativa; saídas automáticas desabilitadas antes da Etapa 9.
- **Consequências:** qualquer aumento exige decisão e novo tabletop; produção continua desabilitada.

## ADR-019 — reserva e cobertura

- **Data:** 2026-07-14
- **Status:** aprovada para implementação demonstrativa
- **Decisão:** capital próprio segregado e mínimo de 110% do payout máximo coberto; antes da Etapa 9 a cobertura é apenas demonstrada com valores fictícios.
- **Consequências:** principal de pools e receita futura não contam como reserva; cobertura não inclui volatilidade da Full BTC.

## ADR-020 — política cambial v0.1

- **Data:** 2026-07-14
- **Status:** aprovada para implementação demonstrativa
- **Decisão:** USD/BTC inicial, BRL informativo, spread da plataforma zero, custos externos separados, cotação por 60 segundos e novo aceite acima de 1% de desvio.
- **Consequências:** produção exige fonte redundante e análise cambial; payout continua somente em BTC.

## ADR-021 — fórmulas demonstrativas v0.1

- **Data:** 2026-07-14
- **Status:** aprovada para implementação demonstrativa
- **Decisão:** desconto por faixas de prazo com ajuste de risco e teto de 5%; limite explicável com base de US$ 100, sinais verificados, histórico e garantia de 2x não aditiva.
- **Consequências:** fórmulas não são modelos calibrados de crédito; detalhes estão em `docs/14-guardrails-operacionais.md`.

## ADR-022 — aceite e liquidação do pagador somente em BTC

- **Data:** 2026-07-14
- **Status:** confirmada
- **Decisão:** o link de confirmação pergunta se o pagador aceita pagar em BTC. Sem aceite, o recebível é inelegível e nenhuma pool é criada. Com aceite, o pagador recebe invoice Lightning no vencimento e a plataforma recebe somente BTC.
- **Consequências:** USD/BRL são referências contratuais; aquisição e conversão para BTC acontecem fora da plataforma e são responsabilidade do pagador.

## ADR-023 — PostgreSQL, ledger assinado e invariantes no banco

- **Data:** 2026-07-14
- **Status:** implementada na Etapa 2
- **Decisão:** valores financeiros usam inteiros; cada partida do ledger tem valor assinado e a soma precisa fechar em zero para cada ativo dentro da transação. Idempotência, pool ativa única, limites de financiamento, correspondência entre conta e ativo e transições de estado também são protegidos por constraints, índices ou triggers PostgreSQL.
- **Consequências:** BTC, USDT e USD de referência nunca se compensam entre si; partidas publicadas são imutáveis e correções futuras exigem evento compensatório. Os testes aplicam todas as migrations em PostgreSQL embarcado, enquanto execução normal usa PostgreSQL via `DATABASE_URL`.

## ADR-024 — limite explicável, consentido e tolerante à expiração

- **Data:** 2026-07-14
- **Status:** implementada na Etapa 3
- **Decisão:** o limite v0.1 usa US$ 100 base, identidade consentida, até duas contas profissionais verificadas, histórico interno de operações quitadas e garantia exclusivamente simulada. Seguidores, gênero e conteúdo social não entram no cálculo. O total é o maior entre o componente sem garantia, limitado a US$ 1.000, e duas vezes a garantia elegível; os componentes não são somados.
- **Consequências:** evidência expirada, revogada ou sem consentimento deixa de contar. Se o limite recalculado ficar abaixo do valor já utilizado, a obrigação existente permanece registrada, o disponível vira zero e novos usos são bloqueados. Toda alteração gera evento append-only com regra, composição, motivo, correlação e chave idempotente.

## ADR-025 — confirmação por bearer token e validação exclusiva da plataforma

- **Data:** 2026-07-14
- **Status:** implementada na Etapa 4
- **Decisão:** o pagador recebe um token aleatório de 256 bits no fragmento do link. O navegador remove o fragmento da barra e envia o token apenas no corpo de requisições `POST`; o banco armazena somente SHA-256, expiração e estado de uso. A resposta confirma origem e descrição do pagamento, valor, vencimento e aceite de BTC. Regras determinísticas versionadas da plataforma avaliam identidade consentida, evidência, correspondência, duplicidade, histórico, limite, país e moeda. A aportadora apenas consulta pools posteriormente e não valida recebíveis.
- **Consequências:** recusa de BTC rejeita o recebível; divergência preserva a versão anterior e exige novo link; aprovação reivindica o fingerprint e reserva o limite na mesma transação. Histórico de inadimplência exige revisão administrativa excepcional e auditada. Não existe endpoint administrativo ou cadastro público antes de autenticação apropriada. Rate limiting distribuído, armazenamento S3 privado, antimalware real e envio do link dependem da infraestrutura futura.

## ADR-026 — USDt exclusivo na Liquid via Breez SDK

- **Data:** 2026-07-14
- **Status:** removida do produto atual pela ADR-035; preservada como pesquisa de roadmap
- **Decisão:** a única stablecoin da pool pareada será o Tether USDt emitido na Liquid. A integração usará Breez SDK Liquid atrás de adapter próprio. Aportes e pagamentos continuam em BTC via Lightning; swaps explícitos convertem entre Lightning, L-BTC e USDt. USDC e USDT via Taproot Assets ficam fora do MVP.
- **Consequências:** Liquid é uma sidechain da Bitcoin, não a blockchain principal. O asset ID precisa ser allowlisted por rede. Seed, signer, API key e estado persistente são segredos operacionais. Se a plataforma controlar a chave, a operação é tratada como custodial. Mainnet permanece deny-by-default, limitada por feature flag e somente pode ser habilitada após testnet, backup/restore, liquidez, slippage, conciliação, responsável humano e avaliação jurídica.

## ADR-027 — regras financeiras e capacidade das pools v0.1

- **Data:** 2026-07-14
- **Status:** implementada na Etapa 5
- **Decisão:** o desconto usa faixas de prazo de 2% a 5% mais ajuste de risco, sempre limitado a 5%. A antecipação em centavos é arredondada para baixo e a meta em sats para cima. Perdas atribuíveis à pool podem reduzir o resultado; taxas, spread e custos de recebimento não podem. Esses custos são cobrados separadamente da solicitante e reduzem apenas seu desembolso líquido. Do resultado da pool, 30% são destinados à plataforma por arredondamento para baixo e todo resíduo fica nos 70% das aportadoras. A divisão proporcional usa maior resto, com desempate por ID opaco. Intenções reservam capacidade no PostgreSQL antes da emissão de invoice. Pool parcial recebe exatamente uma decisão append-only: aceitar ou reembolsar.
- **Consequências:** soma de principal e resultado é preservada em inteiros, invoices concorrentes não podem ultrapassar a meta e retries com parâmetros divergentes falham. A modalidade USD_PAIRED exige obrigação em unidades USDt e reserva BTC de tesouraria ao menos igual à meta em sats, sem tratar os dois ativos como o mesmo saldo. Todos os registros da Etapa 5 usam ambiente `SIMULATION`; nenhuma cotação, invoice, swap ou distribuição externa foi habilitada.

## ADR-028 — origens amplas de pagamento internacional

- **Data:** 2026-07-14
- **Status:** implementada como correção transversal antes da Etapa 6
- **Decisão:** freelancer não é condição de elegibilidade. O recebível registra uma origem entre salário, venda, comissão, serviço e outro pagamento legítimo, além de descrição e evidência. O pagador confirma esses dados; a validação continua sendo responsabilidade exclusiva da plataforma.
- **Consequências:** telas, testes e documentação usam “solicitante” e “pagador”. Freelance permanece apenas como exemplo. A mudança não habilita Breez, testnet, mainnet, USDt real nem movimentação financeira.

## ADR-029 — Breez Liquid diretamente em mainnet, deny-by-default

- **Data:** 2026-07-14
- **Status:** autorizada para implementação; ativação financeira pendente
- **Contexto:** a fundadora substituiu expressamente a passagem obrigatória por testnet e solicitou integração direta em mainnet.
- **Decisão:** usar `@breeztech/breez-sdk-liquid` fixado em `0.12.4`, rede `mainnet`, L-BTC e Tether USDt em allowlist oficial. O gateway permanece desligado sem `BREEZ_ENABLE_MAINNET=true`, API key, mnemonic e diretório persistente. Cada invoice é limitada a 1.000 sats, uma sessão a 5.000 sats e a carteira quente a 10.000 sats. Resultado externo incerto bloqueia retry automático e exige conciliação.
- **Consequências:** a decisão substitui apenas o requisito “testnet primeiro” da ADR-026. Não autoriza depósito de segredos no Git, abertura pública, aumento de teto ou movimentação durante testes automatizados. O pacote e o adapter mainnet podem ser validados sem conectar a carteira; o aceite operacional permanece pendente até uma invoice mainnet controlada ser paga e reconciliada com responsável humano.

## ADR-030 — auditoria USDt com decisão deny-by-default

- **Data:** 2026-07-14
- **Status:** implementada na Etapa 8; resultado operacional `NO_GO`
- **Decisão:** fixar USDt Liquid mainnet no asset ID oficial e precisão 8, manter USDC fora, limitar a sondagem de rota a preparação de 1 USDt e slippage de 1%, sem executar `sendPayment`. Um relatório `GO` exige rota fresca, backup/restauração isolada equivalente, zero reembolsáveis, zero resultados desconhecidos, carteira até 10.000 sats, ledger conciliado, diretório persistente e responsável nomeado.
- **Consequências:** o PostgreSQL registra relatório e checks idempotentes e rejeita `GO` inconsistente. A implementação técnica da auditoria não autoriza fundos nem Fase 9. Sem credenciais, responsável e provas reais, a decisão permanece `NO_GO`.

## ADR-031 — demo mainnet com dupla autorização e circuit breaker

- **Data:** 2026-07-14
- **Status:** preparação técnica implementada; ativação operacional pendente
- **Decisão:** uma invoice real da demo exige auditoria `GO`, sessão armada, aprovação humana vigente, operadora identificada por hash, flag mainnet, flag exclusiva da demo e credenciais no cofre. Só uma invoice mainnet pode ficar ativa. Saldo acima do teto, reembolsável, resultado desconhecido ou conciliação divergente abrem um circuit breaker append-only e abortam a sessão.
- **Consequências:** configurar chaves não ativa dinheiro por si só. Testes usam apenas gateways falsos; o fallback `/demo` é local e declara que nenhum fundo foi movimentado. A Fase 9 só termina após invoice mínima real, evento único, ledger balanceado, restauração e conciliação acompanhados.

## ADR-032 — Supabase Auth para acesso; Nostr somente na reputação

- **Data:** 2026-07-15
- **Status:** substituída pela ADR-033
- **Decisão:** acesso e cadastro usam link mágico de e-mail do Supabase Auth. Nostr não autentica a conta e não autoriza ações financeiras; uma usuária já autenticada pode vincular opcionalmente uma pubkey por desafio NIP-98 assinado em signer NIP-07. A pubkey permanece um atributo de reputação portátil.
- **Consequências:** o projeto não recebe `nsec`; ausência de signer ou relay não bloqueia cadastro, recebíveis, pools ou pagamentos. O backend valida o access token Supabase antes de vincular a pubkey, e o desafio efêmero fica associado à usuária interna para impedir troca de identidade.

## ADR-033 — acesso por carteira com LNURL-auth e reputação pseudônima

- **Data:** 2026-07-16
- **Status:** substituída pela ADR-045; infraestrutura preservada como legado
- **Decisão:** cadastro e acesso usam exclusivamente LNURL-auth. A plataforma cria um desafio aleatório de 32 bytes, a carteira assina com uma chave secp256k1 derivada para o domínio e o backend cria uma sessão própria em cookie `HttpOnly`. A chave de vinculação é armazenada somente como hash e aponta para um `User` interno opaco com `reputation_id` aleatório. Endereço Lightning/BIP353 é destino privado de pagamento, não credencial. Nostr não participa do login: atestados positivos, mínimos e pseudônimos são assinados institucionalmente e publicados de forma assíncrona.
- **Consequências:** `auth.agendacryptoo.com` é o host de produção recomendado e deve permanecer estável, pois carteiras derivam chaves diferentes por domínio. Localhost serve para testes internos; carteira em outro dispositivo exige callback HTTPS público. Desafios expiram em cinco minutos, são de uso único e possuem token de polling separado; sessões duram até 30 dias e podem ser revogadas. Uma nova carteira não vinculada cria outra conta; vínculo de carteira adicional e recuperação serão uma etapa própria. E-mail e Nostr signer pessoal deixam de ser requisitos de acesso. Falha de relay nunca bloqueia autenticação ou finanças.

## ADR-034 — Fedi opcional como canal comunitário e carteira interoperável

- **Data:** 2026-07-17
- **Status:** cancelada pela ADR-044; implementação não iniciada
- **Decisão histórica:** foi considerada uma integração opcional com Fedi para comunidade, descoberta e distribuição de pools.
- **Consequências:** a proposta foi retirada integralmente antes de ser implementada. O documento de execução associado foi removido e o Fedi não integra o escopo atual nem o roadmap aprovado do MVP.

## ADR-035 — fluxo único, pools somente BTC e aportes não custodiais por DLC

- **Data:** 2026-07-18
- **Status:** confirmada pela fundadora; implementação incremental
- **Decisão:** o produto atual terá somente pools Full BTC. USDt/Liquid deixa a interface e permanece apenas como pesquisa de roadmap. Cada aporte será financiado em um DLC bilateral entre aportadora e solicitante, com execução condicionada por atestação do oráculo da plataforma e transação de reembolso após timelock. Durante a abertura da pool, a plataforma não recebe nem controla os aportes. No vencimento, o pagamento do pagador pode passar por carteira transitória segregada somente durante a distribuição automática.
- **Consequências:** o login Nostr não assina DLC. A chave contratual precisa permanecer sob controle da aportadora, com backup e recuperação; a carteira externa apenas financia o endereço on-chain do contrato. DLC mainnet exige auditoria própria, custo mínimo economicamente viável, reembolso, indisponibilidade do oráculo e recuperação testados. O código USDt existente não é apagado silenciosamente, mas fica inacessível ao produto atual.

## ADR-036 — painel único, recebível ativo único, cobertura do principal e compartilhamento público

- **Data:** 2026-07-18
- **Status:** confirmada pela fundadora; experiência inicial em implementação
- **Decisão:** depois do login, a participante acessa um painel único com as ações criar recebível e ver pools, histórico de recebíveis e pools aportadas, limite, missões e reputação. Cada pessoa pode manter somente um recebível ativo por vez. Toda pool terá URL pública opaca e compartilhamento por WhatsApp; páginas públicas mostram condições financeiras e reputação resumida, nunca PII, documentos ou dados do pagador. Garantia em BTC e tesouraria reservada cobrem somente o principal aportado, com percentual e parcela descoberta visíveis; rendimentos nunca são cobertos.
- **Consequências:** recebíveis concluídos, cancelados ou rejeitados não bloqueiam um novo cadastro. Reserva de tesouraria não pode ser contada simultaneamente em duas pools. A ordem de cobertura na inadimplência é pagamento parcial, garantia, tesouraria e perda proporcional remanescente. Páginas separadas de demo, limite e reputação saem da navegação e são consolidadas no painel.

## ADR-037 — fluxo completo do hackathon em modo demonstrativo explícito

- **Data:** 2026-07-18
- **Status:** implementada como complemento da Etapa 11
- **Decisão:** o pitch pode percorrer cadastro do recebível, link do pagador, confirmação, avaliação administrativa sem senha, criação da pool, estimativa de retorno e aporte usando estado local do navegador. Toda tela afetada identifica o modo demonstração e declara que nenhum sat é movimentado. A área administrativa aberta é exclusiva do hackathon e possui comando para reiniciar o roteiro.
- **Consequências:** o modo local não é fonte de verdade, não sincroniza entre dispositivos e não substitui PostgreSQL, object storage, autenticação administrativa, assinatura real do pagador, DLC ou pagamento Lightning. A estimativa da pool aplica os 70% das aportadoras sobre o resultado decorrente do desconto e mostra cenários de preço do BTC em ±10%; ela não é promessa de retorno. Produção continua exigindo administração com MFA, dados persistentes e integração financeira auditada.

## ADR-038 — NWC opcional para pagamento único do pagador

- **Data:** 2026-07-18
- **Status:** implementação simulada concluída; ativação financeira não autorizada
- **Decisão:** após confirmar o recebível, o pagador pode conectar Nostr Wallet Connect para uma solicitação automática única no vencimento ou escolher pagamento manual com qualquer carteira Lightning. NWC é autorização de pagamento, não login, conta Nostr ou assinatura LNURL-auth. O secret é cifrado no servidor e nunca retorna ao frontend; a plataforma aplica vencimento, valor máximo, tarifa, expiração, revogação e bloqueio após sucesso.
- **Consequências:** `info` e `pay_invoice` seguem NIP-47 atrás de adapter. Saldo e pagamento futuro não são garantidos. Falha definitiva expõe a invoice manual sem nova cobrança; resultado desconhecido exige conciliação. `NWC_ENABLE_LIVE` fica desligado; testes e demo usam fakes sem fundos. A referência de sats antes da cotação final não é preço garantido.

## ADR-040 — conexão NWC de um clique como experiência principal

- **Data:** 2026-07-19
- **Status:** experiência implementada; ativação financeira permanece não autorizada
- **Decisão:** a conexão do pagador usa Bitcoin Connect filtrado para NWC, solicita somente `pay_invoice`, não consulta saldo e não persiste a conexão no navegador. No celular, a biblioteca pode abrir uma carteira compatível; entre computador e celular, apresenta o pareamento para leitura pela própria carteira. A conexão devolvida é enviada à API existente para validação e armazenamento cifrado. URI manual deixa a experiência principal e permanece somente em “Opções avançadas”, em campo do tipo senha. Pagamento manual continua disponível.
- **Consequências:** a plataforma não promete automação para carteiras sem NWC ou que não devolvam uma credencial utilizável pelo executor agendado. A compatibilidade deve ser verificada por carteira e versão. O botão simplifica o pareamento, mas não remove limites, revogação, idempotência, fallback manual ou a necessidade de autorização operacional para mainnet. O desenho completo está em `docs/19-pagamento-automatico-nwc-um-clique.md`.

## ADR-041 — eventos Nostr como fonte canônica do estado público

- **Data:** 2026-07-20
- **Status:** aprovada para implementação experimental da LRP v0.1; sem ativação financeira
- **Contexto:** recebíveis e pools públicos hoje derivam de tabelas ou estado demonstrativo local, impedindo verificação e reconstrução independentes. A nova versão requer autoria portável, decisões de validação por cliente e projeções reproduzíveis.
- **Decisão:** a pubkey e a assinatura Nostr determinam autoria dos eventos do Lightning Receivables Protocol (LRP). Eventos válidos e seu grafo tornam-se a fonte canônica do estado público; PostgreSQL permanece permitido para dados privados, sessões, NWC cifrado, scheduler, auditoria e cache reconstruível. A sessão Nostr NIP-07 vincula a conta à mesma pubkey usada pela prestadora nos eventos; LNURL-auth permanece somente como infraestrutura legada. Os kinds 8100–8114 são experimentais e versionados; somente sete tipos descritos em `docs/protocol/` serão aceitos na versão de eventos `lrp/0.1.0`. Decisões `APPROVED`, `REJECTED` e `NEEDS_INFORMATION` pertencem ao cliente que as assinou, permitindo que outro cliente avalie o mesmo recebível.
- **Consequências:** esta decisão substitui, somente no protocolo experimental, a exclusividade de validação das ADR-002/025, a restrição de Nostr apenas à reputação das ADR-032/033 e a opcionalidade de NWC da ADR-038 para criação de pool. A experiência NWC da ADR-040 continua reutilizável. Nenhuma decisão habilita mainnet, pagamento, aporte, DLC ou publicação de dados privados. Cache, UI e banco serão migrados incrementalmente e o fluxo atual permanece até a projeção Nostr ser validada.

## ADR-042 — concentração temporária de papéis no cliente originador

- **Data:** 2026-07-20
- **Status:** limitação aceita exclusivamente para a versão experimental do hackathon
- **Contexto:** separar imediatamente todos os agentes impediria a entrega da vertical verificável no prazo, mas ocultar a concentração criaria uma falsa promessa de descentralização.
- **Decisão:** na LRP v0.1, o cliente originador concentra validação, armazenamento NWC cifrado, contraparte do futuro DLC, executor NWC, carteira operacional, oráculo e coordenação da liquidação. Seus eventos são assinados, limitados por autoridade e auditáveis; segredos permanecem privados; pagamentos, DLC e mainnet continuam desabilitados. A interface e `PoolCreated` devem declarar essa concentração.
- **Riscos e controles:** censura, indisponibilidade, conflito de interesse e contraparte única são riscos conhecidos. Controles mínimos são eventos verificáveis, três relays com quórum 2, dados minimizados, NWC revogável, idempotência, bloqueio em resultado desconhecido, fakes sem fundos e logs sanitizados.
- **Plano obrigatório:** separar cliente, validador, contraparte, executor, carteira, oráculo e árbitro; permitir escolha de executor e agentes do pagador; usar oráculos 2 de 3; remover contraparte única; garantir continuidade sem o originador; e descentralizar disputas, conforme `docs/protocol/10-decentralization-roadmap.md`.
- **Critério de saída:** a centralização só é removida quando nenhuma entidade isolada puder validar e executar a obrigação, existir substituição de executor, a operação continuar sem o originador, fatos críticos exigirem quórum independente e disputas tiverem procedimento fora dele, todos demonstrados por testes interoperáveis.

## ADR-043 — nomenclatura canônica e próximo corte do LRP

- **Data:** 2026-07-21
- **Status:** nomenclatura aprovada; migração da plataforma não iniciada
- **Decisão:** o protocolo passa a se chamar **Lightning Receivables Protocol**, sigla **LRP**, release **LRP v0.1**, identificador técnico `lrp` e versão dos eventos `lrp/0.1.0`. Nomes temporários que o vinculavam à marca da plataforma ou apenas à tecnologia de transporte deixam de identificar o protocolo.
- **Integração atual:** `packages/protocol` continua isolando schemas, builders, validadores, autoridades e reducers públicos; `packages/nostr` fornece signer, transporte e reconstrução. As rotas experimentais apenas demonstram essa integração e não substituem o domínio operacional atual.
- **Duplicação:** regras públicas do LRP e regras privadas/operacionais atuais permanecem separadas enquanto seus estados e autoridades ainda não são equivalentes. Nenhuma fórmula financeira ou máquina de estados operacional foi copiada nesta etapa.
- **Próxima etapa:** apresentar e aprovar um plano de corte para migrar gradualmente os consumidores da plataforma existente ao LRP como fonte de verdade dos estados públicos. Não remover regras antigas nem promover o LRP a fonte canônica da plataforma antes desse plano, dos testes de compatibilidade e de uma estratégia de rollback.
- **Guardrails:** esta decisão não habilita mainnet, pagamentos, aportes, DLC, custódia, saques ou publicação de dados privados.

## ADR-044 — LRP exclusivo no MVP Elas Recebem Hoje

- **Data:** 2026-07-21
- **Status:** confirmada pela fundadora
- **Contexto:** a proposta anterior avaliava usar o Fedi como canal comunitário, de descoberta e de acesso a pools. Essa integração aumentaria o escopo sem ser necessária para validar o produto ou o protocolo.
- **Decisão:** o Fedi não será implementado. No MVP, o Lightning Receivables Protocol será utilizado exclusivamente pelo produto Elas Recebem Hoje. Publicação, leitura, reconstrução e experiência do LRP permanecem dentro da aplicação e de seus pacotes internos, usando Nostr apenas como transporte de eventos conforme a especificação.
- **Consequências:** não haverá comunidade Fedi, mini app, botão específico, publicação automatizada, identidade, reputação ou fluxo de pagamento dependente do Fedi. Links públicos e compartilhamento permanecem funcionalidades próprias do Elas Recebem Hoje e podem usar canais genéricos, sem integração dedicada. A compatibilidade Lightning continua definida pelo protocolo e pelas integrações aprovadas da plataforma, não por uma carteira específica.
- **Escopo futuro:** qualquer reconsideração do Fedi exige nova decisão explícita e não faz parte da migração da plataforma para consumir o LRP.
- **Guardrails:** esta decisão não inicia a migração para o LRP, não habilita mainnet e não altera regras financeiras.

## ADR-045 — identidade Nostr única para login e autoria LRP

- **Data:** 2026-07-22
- **Status:** aprovada pela fundadora e implementada por corte incremental
- **Decisão:** novos acessos do produto usam exclusivamente Nostr NIP-07. O servidor emite um desafio NIP-98 aleatório, expirável, de uso único e vinculado a URL, método, domínio e propósito `LOGIN`; a participante assina no próprio signer. `users.nostr_pubkey` identifica a conta e a mesma pubkey deve assinar `ReceivableCreated` e `PoolCreated`. O servidor verifica ID e assinatura, cria ou recupera a conta e emite o cookie `erh_session` já existente.
- **Privacidade e separação de papéis:** a plataforma nunca solicita, recebe ou armazena `nsec`. NWC permanece autorização operacional de pagamento, não login. A autoridade administrativa e o cliente originador não são substituídos pela pubkey da prestadora. Pubkeys diferentes não são unidas automaticamente.
- **Compatibilidade:** LNURL-auth deixa a interface do produto, mas rotas, tabelas, repositórios, contas e sessões antigas permanecem intactos para expiração natural e rollback. Uma sessão antiga sem pubkey pode concluir o vínculo Nostr existente; uma sessão já vinculada nunca troca silenciosamente de identidade.
- **Consequências:** ausência do signer bloqueia apenas novas autenticações e assinaturas públicas, não apaga o acesso já emitido. Este corte não habilita NIP-46, pagamentos, aportes, DLC, mainnet ou poderes administrativos.
