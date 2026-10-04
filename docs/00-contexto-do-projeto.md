# Elas Recebem Hoje — contexto do projeto

## Visão

Elas Recebem Hoje é uma plataforma de antecipação comunitária de pagamentos internacionais. Uma pessoa no Brasil cadastra um pagamento legítimo a receber do exterior — salário, venda, comissão, serviço ou outra origem comprovável — e seu vencimento; após confirmação do pagador e validação da plataforma, uma pool permite que outras pessoas antecipem o valor usando Bitcoin.

A plataforma é aberta a pessoas de qualquer gênero, mas produto, marca, comunidade e distribuição são orientados inicialmente às necessidades de mulheres no Brasil que recebem pagamentos do exterior. Freelancers são um dos públicos possíveis, não um requisito. A expansão para outros países da América Latina permanece como visão futura.

## Problema e tese

Mulheres no Brasil frequentemente esperam por salários, vendas, comissões, serviços e outros pagamentos devidos por pessoas ou empresas no exterior, além de enfrentarem conversão, spread, tarifas e fricção para receber. A tese é que um pagamento internacional verificável pode financiar uma antecipação transparente, com custos, risco e remuneração explícitos.

## Proposta de valor

- Para a solicitante: liquidez em BTC antes do vencimento, com desconto máximo inicial de 5%; taxas, spread e custos do recebimento são exibidos à parte e pagos por ela, sem serem retirados da pool.
- Para a aportadora: participação proporcional em uma pool, com regras, risco e resultado visíveis antes do aporte.
- Para o pagador: confirmação simples do recebível e pagamento Lightning no vencimento.
- Para a comunidade: histórico portátil de eventos não sensíveis por Nostr.

## Participantes

### Solicitante

Cadastra o recebível estrangeiro, envia evidências, identifica o pagador e seu país, escolhe a modalidade da pool, recebe a antecipação exclusivamente em BTC via Lightning e constrói histórico. Toda conta começa com limite equivalente a US$ 100.

### Aportadora

Consulta pools já validadas, entende modalidade, prazo e riscos, decide quanto aportar e recebe a distribuição proporcional. Não valida nem aprova recebíveis.

### Pagador

Recebe um link para confirmar serviço, valor e vencimento e declarar que aceita quitar o recebível em BTC. Somente com esse aceite a operação é elegível. No vencimento, recebe uma invoice Lightning; a plataforma recebe BTC, nunca USD ou outra moeda fiat. Seu histórico de confirmações, pontualidade e inadimplência integra a análise da plataforma.

### Plataforma

Valida automaticamente identidade, documentos, confirmação, aceite de liquidação em BTC, inconsistências, duplicidades e reputação. Casos excepcionais podem passar por revisão administrativa. A plataforma forma as pools, mantém a escrituração, recebe e executa pagamentos em BTC e cobre a inadimplência conforme limites e reserva definidos.

Não existe o papel de “verificadora” da comunidade.

## Modalidades

- **Full BTC:** aporte, antecipação e liquidação usam BTC/Lightning. O recebível continua referenciado em moeda fiduciária; a quantidade final de sats varia com a cotação e o risco cambial é da aportadora.
- **Pareada em dólar:** cada aporte em sats é convertido imediatamente em USDt na Liquid, sidechain da Bitcoin, para proteger a obrigação da pool. A solicitante ainda recebe BTC via Lightning; por isso, a plataforma precisa fornecer liquidez BTC separada para o desembolso. Na liquidação, a aportadora recebe sats equivalentes ao valor devido em USD.

## Princípios

- Transparência antes do aporte.
- Nenhum retorno apresentado como garantido por natureza; eventual cobertura da plataforma tem limites e condições.
- A plataforma não recebe nem armazena `nsec`.
- Dados pessoais e comerciais não são publicados em relays Nostr.
- Valores monetários usam inteiros na menor unidade e cotações versionadas.
- Dinheiro real só entra após controles, limites e integrações explicitamente habilitados.
- A plataforma não recebe, custodia nem converte USD/BRL; moedas fiat são referências contratuais e de cotação.

## Glossário

| Termo | Definição |
|---|---|
| Recebível internacional | Direito de uma pessoa no Brasil receber do exterior salário, venda, comissão, serviço ou outro pagamento legítimo. |
| Valor nominal | Valor devido pelo pagador no vencimento. |
| Desconto | Diferença entre valor nominal e antecipação, limitada inicialmente a 5%. |
| Pool | Conjunto de aportes vinculados a um único recebível. |
| Aporte | Participação financeira de uma aportadora. |
| Sats | Satoshis, menor unidade do Bitcoin. |
| Full BTC | Modalidade exposta à variação BTC/moeda de referência. |
| Pareada em dólar | Modalidade cujo principal é contabilizado em USD e protegido com USDT. |
| Câmbio | Conversão entre moeda do contrato, BTC/USDT e moeda de referência, com cotação, spread e tarifas registrados. |
| Limite | Máximo de valor nominal que uma pessoa pode solicitar. |
| Garantia | Valor bloqueado para elevar limite e absorver perdas conforme contrato. |
| Atestado Nostr | Evento assinado que registra uma declaração não sensível; não prova sozinho que ela é verdadeira. |

## Contexto do hackathon

O pitch deve mostrar um fluxo completo e tecnicamente honesto. Um aporte Lightning de baixo valor será real; passos de alto risco, indisponíveis ou ainda não autorizados podem ser demonstrados em modo controlado, sempre identificados como demonstração.

## Hipóteses assumidas para o MVP

- Brasil é o primeiro país de origem das solicitantes; os pagadores ficam no exterior e a expansão para outras origens exige análise país a país.
- **ASSUMIDA PARA O MVP:** USD como moeda estrangeira principal e BRL como referência local inicial.
- **ASSUMIDA PARA O MVP:** limite e cobertura reais serão extremamente baixos durante o hackathon.
- **ASSUMIDA PARA O MVP:** a fórmula de aumento de limite será por regras transparentes, não por modelo de IA opaco.
