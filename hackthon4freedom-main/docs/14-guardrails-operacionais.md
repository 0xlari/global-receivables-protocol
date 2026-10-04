# Guardrails operacionais — versão 0.1

## Status e alcance

Este documento conclui a Etapa 0. Ele autoriza apenas a futura construção do MVP dentro destes limites; não habilita mainnet, não movimenta fundos e não substitui avaliação jurídica ou de segurança.

A fundadora é a responsável de produto pela aprovação destes guardrails. A pessoa responsável pela carteira e pela operação mainnet deverá ser nomeada antes da Etapa 9.

Qualquer aumento de valor, novo país, nova moeda, payout automático, uso real de USDT ou abertura pública exige nova decisão em `docs/12-decisoes.md`.

## Stack aprovada para iniciar a Etapa 1

| Camada | Escolha |
|---|---|
| Aplicação | Next.js App Router e TypeScript em modo estrito |
| Runtime/pacotes | Node.js LTS ativo no início da Etapa 1 e pnpm |
| UI | Tailwind CSS, componentes acessíveis e tokens próprios |
| Banco | PostgreSQL |
| Acesso a dados | Drizzle ORM e migrations versionadas |
| Validação | Schemas compartilhados no servidor e cliente |
| Testes | Vitest, Testing Library e Playwright |
| Jobs | Transactional outbox; worker separado quando necessário |
| Bitcoin/Lightning/USDt | Breez SDK Liquid atrás de interface própria; USDt exclusivamente na Liquid |
| Nostr | signer NIP-07/NIP-46 atrás de interface própria |
| Documentos | Object storage compatível com S3, privado |

Provedores comerciais e hospedagem permanecem substituíveis. Nenhuma lógica de domínio pode depender diretamente do SDK de um provedor.

## Recorte do piloto

- Origem da solicitante: Brasil.
- Cliente do cenário real controlado: exterior.
- Cenário padrão da demo: cliente fictício nos Estados Unidos e recebível em USD.
- Moeda contratual habilitada no primeiro fluxo: USD.
- BRL: somente referência visual.
- Desembolso da solicitante: somente BTC via Lightning.
- Aportes: BTC via Lightning.
- Pagamento do cliente: BTC via Lightning.
- Stablecoin da pool pareada: somente Tether USDt na Liquid; USDC fora do escopo.
- Aceite do cliente para liquidação em BTC: obrigatório antes da validação final.
- Entrada de USD, BRL ou outra moeda fiat: proibida; a plataforma recebe somente BTC.
- Originação pública e países reais: desabilitados até análise específica.

## Matriz de ambientes

| Ambiente | Rede financeira | Dados | Saídas | Limites |
|---|---|---|---|---|
| Local | simulador/regtest | fictícios | automáticas no simulador | sem valor real |
| Preview/CI | simulador; signet quando necessário | fictícios | nenhuma mainnet | sem valor real |
| Demo controlada | mainnet apenas por feature flag | fictícios, exceto pagamento autorizado | confirmação administrativa | limites abaixo |
| Produção | desabilitada | nenhuma usuária real | nenhuma | lançamento não autorizado |

Flags de ambiente são deny-by-default. Uma configuração ausente nunca habilita conexão ou efeito mainnet.

## Limites mainnet da demo

- Uma única invoice mainnet ativa por vez.
- Máximo por aporte: **1.000 sats**.
- Máximo acumulado recebido durante uma sessão de demo: **5.000 sats**.
- Saldo máximo intencional da carteira quente da demo: **10.000 sats**.
- Nenhum desembolso, swap ou distribuição mainnet automático antes da Etapa 9.
- Toda saída mainnet requer conferência de destino, valor, ambiente e aprovação administrativa explícita.
- Atingir qualquer teto desabilita novas invoices; nunca arredondar o limite para cima.

Os limites são expressos somente em sats para não crescerem com variação cambial. Alterá-los exige ADR nova e novo tabletop.

## Reserva e cobertura

### Origem

A reserva é capital próprio da plataforma, segregado do principal das pools. Aportes de outras pools, garantias não executadas e receita futura não contam como reserva disponível.

### Regra

Antes de abrir uma pool com cobertura, deve valer:

`reserva_disponivel >= 110% × payout_maximo_coberto`

O buffer de 10% cobre taxas e arredondamentos, não volatilidade ilimitada. A cobertura se limita à inadimplência definida nos termos e não compensa variação BTC/fiat da Full BTC.

No MVP antes da Etapa 9, reserva, inadimplência e recuperação são demonstradas no ledger com valores fictícios. Nenhuma garantia real é anunciada ao público.

### Bloqueios

Não abrir pool se a reserva estiver insuficiente, não conciliada, comprometida com outra obrigação ou se não houver responsável autorizado para a cobertura.

## Tesouraria da pool pareada

A pool pareada mantém a obrigação das aportadoras protegida em USDT, enquanto a solicitante recebe BTC. Portanto:

- o USDT protegido não pode ser contabilizado como BTC desembolsado;
- BTC de tesouraria precisa estar reservado antes da abertura;
- `BTC_reservado >= desembolso_BTC_maximo + buffer_de_taxas`;
- a modalidade permanece simulada até a Etapa 8 comprovar asset ID USDt, Breez SDK, liquidez, backup, restauração, conciliação e rebalanceamento;
- falha de swap, falta de liquidez ou resultado desconhecido bloqueia a operação.

## Política cambial

A política cambial calcula equivalências, mas não executa câmbio fiat. A moeda estrangeira permanece como referência do contrato; o cliente é responsável por adquirir BTC fora da plataforma.

### Registro obrigatório

Cada cotação registra moeda de origem, ativo de destino, preço, fonte, timestamp UTC, expiração, spread do provedor, spread da plataforma, tarifas estimadas, tarifas realizadas e regra de arredondamento.

### MVP

- Par contratual inicial: USD/BTC.
- BTC/BRL é apenas informativo.
- Spread adicional da plataforma: **0** no MVP.
- Taxas de rede, conversão, swap e spread são cobrados da solicitante pelo valor efetivo e exibidos separadamente.
- Esses custos reduzem o desembolso líquido da solicitante; nunca reduzem principal, resultado ou distribuição da pool.
- Cotação expira em 60 segundos para criar intenção financeira.
- Cotação expirada nunca é reutilizada para fixar valor.
- Se a diferença entre estimativa e execução superar 1%, exigir novo aceite ou cancelar.

A fonte de cotação será escolhida na etapa da integração por adapter e precisa oferecer timestamp e identificador da resposta. Uma única fonte pode servir à demo; produção exige redundância.

## Desconto da antecipação — regra demonstrativa v0.1

O desconto total é a soma da faixa de prazo com ajuste de risco, limitado a 5%:

| Prazo até vencimento | Base |
|---|---:|
| 1–15 dias | 2% |
| 16–30 dias | 3% |
| 31–60 dias | 4% |
| 61–90 dias | 5% |

Ajuste de risco demonstrativo: baixo `+0%`, médio `+1%`, alto `+2%`. Resultado acima de 5% é truncado para 5%. Recebíveis acima de 90 dias não são elegíveis no MVP.

Essa fórmula é explicável, determinística e apenas demonstrativa; não foi calibrada com dados de perda.

## Limite progressivo — regra demonstrativa v0.1

### Componente sem garantia

- Base: US$ 100.
- Identidade verificada: +US$ 100.
- Conta profissional externa verificada: +US$ 50 cada, máximo +US$ 100.
- 1ª operação quitada: +US$ 100.
- 2ª operação quitada: +US$ 200.
- 3ª operação quitada: +US$ 400.
- Teto sem garantia: US$ 1.000.

### Componente com garantia

`limite_por_garantia = 2 × valor_elegivel_da_garantia`

O limite total é o maior entre o componente sem garantia e o limite por garantia, não a soma. Assim, US$ 500 elegíveis em garantia permitem limite total de US$ 1.000.

Redes sociais não liberam limite por seguidores, gênero ou conteúdo. Servem apenas para comprovar controle de conta profissional. Garantia real permanece desabilitada até custódia e execução serem aprovadas.

## Split, custos e reembolso

- Desconto bruto não é receita garantida.
- `resultado_liquido = pagamento_recebido - principal - custos_externos_realizados - perdas_aplicaveis`.
- Se positivo: 30% plataforma e 70% aportadoras pro rata.
- Se não positivo: não existe parcela de resultado a distribuir.
- Pool Full BTC cancelada devolve o principal recebido; a plataforma absorve a taxa Lightning de saída na demo controlada.
- Pool pareada real não é habilitada até existir política testada de reversão de swap.

## Condições objetivas de “não abrir pool”

1. Recebível não aprovado, confirmação divergente ou cliente sem aceite explícito de pagamento em BTC.
2. Limite insuficiente ou evidência expirada.
3. Moeda, prazo, país ou modalidade fora do allowlist.
4. Cotação expirada ou sem origem auditável.
5. Reserva de cobertura abaixo de 110%.
6. Tesouraria BTC insuficiente para pool pareada.
7. Ledger, nó, swap ou reconciliação em estado desconhecido.
8. Feature flag mainnet desligada ou limite da sessão atingido.
9. Responsável administrativo indisponível para ação real exigida.
10. Qualquer segredo, backup ou controle de acesso sem validação.

## Tabletop de perda de fundos e demo

| Cenário | Resposta esperada | Resultado da revisão |
|---|---|---|
| Webhook Lightning duplicado | chave única impede segundo crédito | aprovado como requisito bloqueador |
| Pagamento chega após invoice expirar | conciliação manual; não alocar automaticamente | aprovado |
| Duas invoices excedem a meta | somente uma ativa na demo; reserva atômica futura | aprovado para demo |
| Cotação fica obsoleta | expirar e exigir novo aceite | aprovado |
| Cliente recusa pagamento em BTC | encerrar como inelegível antes de criar pool | aprovado |
| Reserva cai abaixo de 110% | bloquear abertura e novas invoices | aprovado |
| Carteira quente excede 10.000 sats | circuit breaker e nenhuma nova entrada | aprovado |
| API key, seed ou signer Breez é suspeito | desligar saídas, rotacionar o que for rotacionável, restaurar e reconciliar | aprovado |
| Relay Nostr cai | enfileirar; dinheiro continua independente | aprovado |
| Swap USDT falha | não marcar protegido nem desembolsar | aprovado |
| Demo perde internet | usar fixture claramente marcada como demonstração | aprovado |

## Checklist de autorização para etapas futuras

- [x] Stack definida.
- [x] Piloto e moeda inicial definidos.
- [x] Limites mainnet definidos, mas não habilitados.
- [x] Origem e razão mínima da reserva definidas.
- [x] Política cambial v0.1 definida.
- [x] Fórmulas demonstrativas de desconto e limite definidas.
- [x] Condições de bloqueio definidas.
- [x] Tabletop documental concluído.
- [ ] Responsável humano e carteira da demo nomeados antes da Etapa 9.
- [ ] Avaliação jurídica antes de qualquer operação pública.
- [x] Go/no-go de USDt Liquid/Breez após a Etapa 8: `NO_GO` operacional, conforme `docs/16-auditoria-usdt-liquid.md`.
