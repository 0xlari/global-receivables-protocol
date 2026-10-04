# Roteiro da demo — 3 a 5 minutos

## Narrativa

“Ana mora no Brasil e tem US$ 2.000 a receber de uma empresa no exterior no dia 30. Pode ser salário, venda, comissão ou serviço. Em vez de esperar e enfrentar um câmbio pouco transparente, transforma o pagamento confirmado em uma pool.”

## Preparação

- Dados inteiramente fictícios.
- Conta da solicitante, pagador e aportadora prontas.
- Pool pré-carregada em 92% para aporte pequeno.
- Wallet mainnet com valor mínimo e canal testado.
- Modo offline pronto.

## Sequência

### 0:00–0:35 — problema e limite

Mostrar perfil da Ana: limite inicial de US$ 100. US$ 500 de garantia elevam o limite total para até US$ 1.000; identidade verificada e histórico positivo completam os sinais que justificam o limite demonstrativo de US$ 2.500. Destacar que redes sociais são sinal limitado, não prova de riqueza.

### 0:35–1:15 — recebível e confirmação

Mostrar recebível internacional de US$ 2.000, origem do pagamento, país do pagador, vencimento dia 30 e desconto de 5%. Exibir cotação, tarifas e equivalente em BRL. Abrir a confirmação, mostrar o pagador aceitando pagar em BTC e então executar a validação automática. Explicar que nenhum dólar entra na plataforma. Não abrir documentos reais.

### 1:15–2:00 — duas modalidades

Comparar:

- Full BTC: sats finais variam; aportadora assume volatilidade.
- Pareada em dólar: aporte convertido para USDT; principal acompanhado em USD.

Selecionar Full BTC para o caminho principal, explicar US$ 1.900 de antecipação e mostrar que a solicitante recebe exclusivamente BTC via Lightning. Exibir separadamente taxas e spread: se forem US$ 10, ela recebe líquido US$ 1.890, enquanto a pool continua em US$ 1.900.

### 2:00–2:40 — aporte real

Mostrar pool em 92%, gerar invoice pequena, pagar com carteira e ver confirmação idempotente/progresso. Dizer explicitamente que o valor é real e limitado.

### 2:40–3:30 — vencimento e resultado

Avançar o cenário controlado ao dia 30. Pagador paga por link Lightning. Mostrar principal, resultado da pool e divisão: 30% plataforma, 70% aportadoras. Mostrar também a quantidade final de sats afetada pela cotação.

### 3:30–4:15 — confiança portátil

Mostrar reputação por dimensões e atestado Nostr assinado sem valor, documento ou identidade do pagador.

### 4:15–4:45 — resiliência

Alternar rapidamente para o cenário de inadimplência: reserva limitada cobre aportadoras e abre recuperação. Encerrar com o impacto para mulheres que recebem do exterior.

## Momentos de impacto

- Limite que cresce de forma explicável.
- Confirmação do pagador sem expor contrato.
- Aporte real Lightning.
- Comparação honesta das modalidades.
- Reputação portátil sem PII.

## Plano alternativo

- Lightning indisponível: reproduzir pagamento previamente capturado e usar evento fixture marcado “demonstração”.
- Relay indisponível: mostrar evento assinado localmente e fila pendente.
- Cotação indisponível: usar cotação versionada pré-carregada e identificada.
- USDt Liquid/Breez indisponível: mostrar simulador e resultado do spike, sem alegar transferência real.
