# Plano de implementação

Nenhuma etapa está autorizada até a mensagem exata **APROVADO PARA IMPLEMENTAR**.

## Etapa 0 — decisões e guardrails

- **Objetivo:** confirmar stack, países permitidos para clientes, limites mainnet, fonte da reserva, ativos e política cambial.
- **Áreas:** decisões, configuração, threat model.
- **Dependências:** aprovação e responsáveis operacionais.
- **Aceite:** nenhuma contradição financeira aberta; matriz de ambientes e tabela de cotação/spread/tarifas aprovadas.
- **Testes:** tabletop de perda de fundos e demo.
- **Risco:** iniciar código financeiro sem limites.
- **Resultado:** checklist de autorização.
- **Complexidade:** baixa; não paralelizável com dinheiro real.

## Etapa 1 — fundação e design system

- **Objetivo:** aplicação navegável, CI, lint, tipos e layout responsivo.
- **Áreas:** app web, configurações, testes.
- **Dependências:** stack confirmada.
- **Aceite:** rotas e componentes-base acessíveis; nenhum segredo.
- **Testes:** unitários, componentes e smoke.
- **Risco:** excesso visual antes do domínio.
- **Resultado:** shell demonstrável.
- **Complexidade:** média; frontend pode avançar em paralelo ao schema.

## Etapa 2 — domínio, banco e ledger

- **Objetivo:** entidades, migrations, máquinas de estado e partidas dobradas.
- **Áreas:** banco, domínio, repositórios.
- **Dependências:** Etapa 0.
- **Aceite:** constraints impedem dupla alocação e desequilíbrio.
- **Testes:** propriedades, transações e concorrência.
- **Risco:** arredondamento e estados impossíveis.
- **Resultado:** cenários financeiros reproduzíveis.
- **Complexidade:** alta; paralelização limitada.

## Etapa 3 — identidade, limite e reputação interna

- **Objetivo:** conta autenticada por LNURL-auth, US$ 100 base, evidências e cálculo explicável.
- **Áreas:** auth, perfil, limites, consentimento.
- **Dependências:** Etapa 2.
- **Aceite:** desafio e sessão não podem ser reutilizados; cada alteração de limite tem regra, versão e justificativa.
- **Testes:** assinatura secp256k1, expiração, replay, revogação, concorrência e garantia.
- **Risco:** sinais sociais discriminatórios/manipuláveis.
- **Resultado:** painel “como aumentar meu limite”.
- **Complexidade:** média; UI e regras podem avançar em paralelo.

## Etapa 4 — recebível, cliente e validação

- **Objetivo:** cadastro, link, confirmação e pipeline automático.
- **Áreas:** recebíveis, uploads, tokens, administração.
- **Dependências:** Etapas 2–3.
- **Aceite:** divergência, duplicidade ou recusa do cliente em pagar BTC impedem pool; revisão é auditada.
- **Testes:** token expirado/reutilizado, aceite/recusa de BTC, uploads hostis, correção e duplicidade.
- **Risco:** vazamento de documentos.
- **Resultado:** recebível aprovado ponta a ponta.
- **Complexidade:** alta; upload e UI podem ser paralelos.

## Etapa 5 — pools e simulador financeiro

- **Objetivo:** modalidades, cotação, progresso, parcial e distribuição.
- **Áreas:** pools, quotes, calculadora, telas.
- **Dependências:** Etapas 2 e 4.
- **Aceite:** exemplos fecham centavo/sat; riscos aparecem antes do aporte.
- **Testes:** limites, rounding, volatilidade, 30/70 e propriedades.
- **Risco:** confundir retorno estimado com garantido.
- **Resultado:** demo completa sem integração externa.
- **Complexidade:** alta; cálculos e UI podem ser paralelos.

## Etapa 6 — Breez Liquid e Lightning em mainnet bloqueada

- **Objetivo:** adapter Breez SDK Liquid mainnet, invoices Lightning, eventos/polling, swaps L-BTC/USDt e conciliação, com efeitos externos desligados por padrão.
- **Áreas:** gateway, worker, segredos e ledger.
- **Dependências:** Etapas 2 e 5.
- **Aceite:** pacote oficial fixado; mainnet exige flag e segredos locais; invoice paga uma vez; duplicatas, expiração e resultados desconhecidos são seguros; tetos de 1.000/5.000/10.000 sats são imutáveis por configuração.
- **Testes:** integração, falhas de rota, retry e reconciliação.
- **Risco:** efeito externo sem commit interno.
- **Resultado:** gateway mainnet implementado sem movimentar fundos durante desenvolvimento; ativação real requer credenciais, saldo controlado e conciliação operacional.
- **Complexidade:** alta; infraestrutura pode avançar separadamente.

## Etapa 7 — Nostr

- **Objetivo:** atestados institucionais mínimos, sem usar Nostr como login.
- **Áreas:** identidade, publisher, relays.
- **Dependências:** Etapas 3–5.
- **Aceite:** nenhuma `nsec`; payload passa verificação de privacidade.
- **Testes:** assinatura, relay offline, duplicidade e correção.
- **Risco:** exposição permanente.
- **Resultado:** perfil portátil demonstrável.
- **Complexidade:** média; paralelizável após schema.

## Etapa 8 — auditoria USDt Liquid e preparação mainnet

- **Objetivo:** validar USDt oficial na Liquid, Breez SDK, carteira/signer, swaps, liquidez e operação mainnet limitada.
- **Áreas:** laboratório isolado, adapter Breez, tesouraria e reconciliação.
- **Dependências:** Etapa 6 e segurança operacional.
- **Aceite:** relatório reproduzível; USDC permanece fora; mainnet não entra no fluxo se qualquer premissa falhar.
- **Testes:** backup/restore, asset ID, swap, liquidez, slippage, eventos duplicados e resultados desconhecidos.
- **Risco:** perda de ativos, seed ou estado local; custódia involuntária.
- **Resultado:** go/no-go técnico e operacional para USDt Liquid.
- **Complexidade:** muito alta; paralela, fora do caminho crítico.
- **Resultado em 2026-07-14:** auditoria técnica implementada e reproduzível; decisão operacional `NO_GO` por ausência de responsável, segredos em cofre, diretórios persistentes, prova real de restauração, sondagem real de rota e conciliação. Nenhum fundo foi movimentado e a Etapa 9 permanece bloqueada.

## Etapa 9 — mainnet controlada e demo

- **Objetivo:** habilitar um aporte real pequeno e ensaiar roteiro.
- **Áreas:** feature flags, allowlist, monitoramento e operação.
- **Dependências:** auditoria das Etapas 2, 5 e 6.
- **Aceite:** teto aprovado, saldo mínimo, plano de interrupção e conciliação.
- **Testes:** ensaio completo, restauração e fallback offline.
- **Risco:** perda real e falha ao vivo.
- **Resultado:** pitch de 3–5 minutos.
- **Complexidade:** média técnica, alto risco operacional; não delegar sem responsável.
- **Resultado técnico em 2026-07-14:** sessão/aprovação, flag exclusiva, tetos, invoice única, circuit breaker append-only, monitor e fallback offline foram implementados e testados sem credenciais ou fundos. A etapa permanece operacionalmente aberta até uma nova auditoria `GO`, operadora nomeada, credenciais no cofre, restauração real e uma invoice mínima paga e reconciliada.

## Etapa 13 — autorização NWC opcional do pagador

- **Objetivo:** pagamento automático único sem tornar NWC requisito para confirmar o recebível.
- **Áreas:** domínio, migration, criptografia, NIP-47, APIs por recurso, worker, ledger, UI e fallback manual.
- **Aceite:** `pay_invoice`; secret nunca retorna; revogação/expiração/limites impedem uso; liquidação idempotente; falha cria fallback; `UNKNOWN` não repete.
- **Testes:** URI/relay malicioso, criptografia, CSRF, acesso horizontal, estados, PostgreSQL vazio, desktop e mobile.
- **Resultado em 2026-07-18:** modo demonstrativo concluído com gateway fake. Adapter de relay permanece bloqueado por flag e nenhuma cobrança real foi habilitada.
