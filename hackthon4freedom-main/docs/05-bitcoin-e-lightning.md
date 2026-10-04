# Bitcoin, Lightning, USDT e pools

## Princípios monetários

- BTC é armazenado em millisatoshis internamente quando necessário; nunca em ponto flutuante.
- Fiat usa unidade mínima da moeda e código ISO.
- USDT usa a precisão definida pelo ativo/protocolo.
- Toda conversão grava par, preço, spread, taxa, fonte, timestamp, validade e regra de arredondamento.
- A interface separa valor estimado de valor fixado.

## Cálculo-base

Para valor nominal `N` e desconto `d`, com `0 <= d <= 5%`:

`meta_fiat = N × (1 - d)`

Exemplo: recebível de US$ 2.000 e desconto de 5% gera meta de US$ 1.900. Se as taxas e o spread do recebimento forem US$ 10, a solicitante recebe líquido US$ 1.890 equivalentes em BTC. Esses US$ 10 não saem da pool. Quando o pagador quitar US$ 2.000 equivalentes, o resultado bruto da pool é US$ 100: US$ 30 para a plataforma e US$ 70 para aportadoras, antes de perdas atribuíveis à pool.

O exemplo não promete retorno: atraso, cotação, swaps, taxas, cobertura e perdas podem alterar o resultado.

## Recebível internacional e câmbio

O MVP começa com solicitantes residentes no Brasil e pagadores no exterior. Salário, venda, comissão, serviço e outros pagamentos legítimos podem ser cadastrados. O valor original nunca é sobrescrito por uma conversão. A tela apresenta:

- moeda e valor nominal do contrato;
- cotação e horário;
- spread de conversão;
- tarifa Lightning, rede e swap;
- desconto da antecipação;
- valor líquido em BTC ou USDT;
- equivalente informativo em BRL.

A plataforma pretende reduzir fricção e tornar a equivalência cambial mais transparente, mas não recebe nem converte moeda fiat. O cliente adquire BTC fora da plataforma. Não se afirma que essa rota será sempre mais barata.

A solicitante recebe somente BTC via Lightning. BRL e USDT podem aparecer como referência e mecanismo interno da modalidade, mas não são opções de saque neste projeto. Taxas, spread e custos de recebimento são de responsabilidade da solicitante, aparecem separados e reduzem apenas seu desembolso líquido.

USD/BRL nunca entram no caixa da plataforma. Servem para registrar o contrato, calcular a invoice em sats e explicar o resultado.

## Fixação da cotação

- Cada intenção de aporte recebe cotação com validade curta.
- A participação nasce do valor efetivamente recebido e conciliado.
- A meta é recalculada apenas por regra explícita; não oscila silenciosamente na tela.
- No fechamento, uma cotação de desembolso registra o valor efetivamente antecipado.
- No vencimento, nova cotação determina a invoice do cliente e a distribuição quando a obrigação é fiat-referenciada.

## Pool Full BTC

### Funcionamento

1. Meta fiat descontada é apresentada junto à estimativa em sats.
2. Aportadoras enviam sats via invoices Lightning individuais.
3. Pool fechada libera BTC à solicitante, líquido das taxas e do spread previamente aceitos.
4. No vencimento, o cliente — que já aceitou pagar em BTC — paga invoice Lightning calculada a partir do valor nominal de referência e da cotação aplicável.
5. Sats disponíveis, descontados custos, são distribuídos proporcionalmente.

### Risco

A quantidade de sats devolvida não é garantida. Se o BTC se valorizar, o pagamento fiat-referenciado compra menos sats; se desvalorizar, compra mais. Esse risco pertence à aportadora e deve aparecer antes da confirmação do aporte.

## Pool pareada em dólar

### Funcionamento proposto

1. Aportadora envia sats.
2. Após confirmação, a plataforma solicita swap imediato para USDT.
3. A participação é fixada no valor líquido em USD/USDT.
4. O USDT permanece como proteção da obrigação da pool; a plataforma libera BTC de uma conta de tesouraria separada para a solicitante.
5. Cliente paga em BTC via Lightning; a obrigação é reconciliada pelo valor USD da cotação registrada.
6. Por padrão do produto, a aportadora recebe sats equivalentes ao principal em USD mais seu resultado líquido. A quantidade de sats é calculada pela cotação de distribuição.

Se o swap falhar ou exceder o slippage permitido, o aporte não é marcado como convertido e a pool não avança como se estivesse protegida.

## USDt na Liquid via Breez

O único stablecoin do MVP é o Tether USDt emitido na Liquid, usando o asset ID oficial da rede selecionada e integração pelo Breez SDK Liquid. Liquid é uma sidechain da Bitcoin: o saldo USDt não fica na blockchain principal nem é um ativo Taproot Assets. BTC continua entrando e saindo da experiência por Lightning, com swaps explícitos e conciliados entre Lightning, L-BTC e USDt.

Antes da mainnet controlada devem ser comprovados: asset ID oficial, API key da Breez, liquidez e slippage dos swaps, taxas, recuperação da carteira, diretório persistente do SDK, reconciliação com o ledger, limites e resposta a resultados desconhecidos. Não será criado um token próprio chamado USDT e USDC não integra o escopo do MVP.

## Aportes parciais e excesso

- Cada invoice tem valor máximo e expiração.
- A API reserva capacidade por tempo curto para evitar duas invoices ultrapassarem a meta.
- Excesso recebido vai para conciliação/reembolso, nunca para receita.
- Ao expirar parcialmente, a solicitante vê valor líquido, custos e novo impacto antes de aceitar.
- Se recusar, todos os aportes são reembolsados no mesmo ativo quando possível; diferenças inevitáveis de rede/swap seguem política exibida previamente.

## Pagamento e distribuição

- O cliente só participa se tiver aceitado a liquidação em BTC e recebe invoice Lightning com expiração adequada.
- Pagamento parcial não quita automaticamente a obrigação.
- Resultado da pool deduz apenas perdas atribuíveis à pool antes do split 30/70; taxas e spread de recebimento pertencem à solicitante.
- Distribuição usa fração do principal efetivamente alocado, não ordem de chegada.
- Falha de payout mantém obrigação no ledger e entra em retry/conciliação.

## Cobertura de inadimplência

A plataforma pretende cobrir a aportadora, mas a cobertura é limitada por termos, reserva e teto da operação. O ledger separa `reserva`, `garantia da solicitante`, `principal das pools` e `receita`. Cobertura não pode usar principal de outras pools.

Na pool pareada, a tesouraria também precisa manter liquidez BTC suficiente para desembolsar à solicitante enquanto o principal da pool permanece protegido em USDT. Sem essa liquidez, a modalidade não pode abrir.

## Custódia e segurança

- O Breez SDK Liquid fica atrás de um adapter de servidor e não é exposto diretamente à internet pública.
- Mnemonic, seed, signer e API key nunca entram em Git, banco, logs ou frontend.
- Se a plataforma controlar a chave, a operação é tratada como custodial e sujeita aos respectivos controles e análise jurídica.
- Saídas acima do limite exigem dupla aprovação.
- Carteira quente contém apenas exposição autorizada.
- Backups e restauração do estado da carteira Breez/Liquid, signer e banco são testados.
- Endereços e invoices são verificados contra ambiente e ativo.

## Falhas esperadas

Sem rota, liquidez insuficiente, invoice expirada, pagamento em trânsito, evento duplicado, swap sem cotação, slippage alto, serviço Breez indisponível, estado local não restaurável, asset ID incorreto, cotação obsoleta e saldo externo divergente.

## Demonstração, real e futuro

| Camada | Hackathon |
|---|---|
| UI, estados, cálculo e ledger | Demonstrado integralmente com dados fictícios auditáveis |
| Um aporte Lightning baixo | Real em mainnet, com limite e allowlist |
| Ciclo completo de custódia e distribuição | Demonstrado/controlado até aprovação de segurança |
| USDt Liquid via Breez | Gateway mainnet deny-by-default; ativação somente com feature flag, segredos locais, limites e conciliação |
| Escrow/multisig | Futuro |
| Originação fora do Brasil e payout fiat local | Futuro, após integração e revisão país a país |

## Referências técnicas

- [Breez SDK Liquid](https://sdk-doc-liquid.breez.technology/guide/about_breez_sdk_liquid.html)
- [Ativos e USDt na Liquid](https://sdk-doc-liquid.breez.technology/guide/assets.html)
- [Conexão, mainnet e armazenamento local](https://sdk-doc-liquid.breez.technology/guide/connecting.html)
- [Signer externo](https://sdk-doc-liquid.breez.technology/guide/self_signer.html)
