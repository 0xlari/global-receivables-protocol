# Plano de testes

## Estratégia

Pirâmide com muitos testes de regras puras, integrações reais em ambientes isolados e poucos E2E críticos. Testes financeiros usam relógio e cotações controláveis.

## Unitários

- Desconto variável com teto de 5%.
- Split 30/70 após custos.
- Participação proporcional e arredondamento residual determinístico.
- Conversões fiat/sats/USDT.
- Limite inicial, evidências, garantia e expiração.
- Sanitização do payload Nostr.
- Codificação LNURL, assinatura secp256k1 DER, domínio, expiração e replay.

## Propriedades e máquinas de estado

- Nenhuma sequência inválida chega a `FUNDED` ou `SETTLED`.
- Soma de participações <= 100%.
- Ledger sempre balanceado.
- Retry não duplica dinheiro.
- Pool parcial aceita ou reembolsa, nunca ambos.
- Distribuição não excede fundos conciliados.

## Componentes

- Formulário de recebível e erros.
- Explicação do limite.
- Comparador Full BTC/pareada.
- Avisos de volatilidade, garantia e cobertura.
- Progresso da pool e decisão parcial.
- Acessibilidade de modais financeiros.

## Integração

- PostgreSQL, locks e unicidade.
- Object storage privado e URLs expiradas.
- Breez SDK Liquid mainnet atrás de fake determinístico: invoice criada, liquidada, duplicada, expirada e sem rota; teste real somente com teto e responsável operacional.
- USDt Liquid: asset ID correto, swaps, slippage, eventos, backup e restauração.
- Relays Nostr: publish, readback, indisponibilidade e conflito.
- Cotação/swap: timeout, slippage e resposta desconhecida.

## Segurança

- Controle de acesso horizontal e administrativo.
- Reutilização e adivinhação de token.
- Upload poliglota/malicioso e path traversal.
- SSRF em URLs de redes sociais/documentos.
- Vazamento em logs, erros, analytics e Nostr.
- CSRF, XSS e sessão.
- Sequestro do token de polling, troca de domínio LNURL-auth e reutilização de `k1`.
- Escopo de macaroons e rotação.
- Abuso de invoices, saques e webhook replay.

## E2E

1. Limite suficiente -> recebível de salário/venda/comissão/serviço/outro -> pagador confirma -> plataforma aprova -> pool -> aporte -> liquidação.
2. Limite insuficiente -> garantia -> novo limite -> sucesso.
3. Cliente diverge -> correção -> nova confirmação.
4. Cliente recusa pagamento em BTC -> recebível inelegível -> nenhuma pool.
5. Pool parcial -> aceita -> desembolso proporcional.
6. Pool parcial -> recusa -> reembolsos.
7. Inadimplência -> cobertura limitada -> recuperação aberta.
8. Relay fora -> financeiro conclui -> publicação posterior.

## Dados fictícios

Solicitante: Ana Lima (nome fictício), residente no Brasil, limite US$ 2.500 após garantia e histórico. Pagador: Northstar Studio, empresa fictícia no exterior com três pagamentos anteriores. Recebível internacional: salário, venda, comissão ou serviço de US$ 2.000, vencimento dia 30, desconto 5%. Taxas e spread de US$ 10 reduzem o desembolso líquido da solicitante, nunca a pool. Não usar documentos, telefones, pubkeys ou invoices reais de terceiros.

## Cenário do pitch

- Pré-carregar estados para não depender do relógio.
- Aporte real limitado e previamente autorizado.
- Validar saldo e canais antes da apresentação.
- Ter gravação/capturas e modo offline para cada integração.

## Critério de saída

Zero falhas críticas; invariantes e E2E principal verdes; reconciliação sem divergência; revisão manual de payload Nostr; tabletop de incidente concluído.

## Cobertura NWC do pagador

- Unitários: URI/relay malicioso, criptografia autenticada, sanitização, estados, limites, expiração, revogação e mensagens seguras.
- Banco/API: autorização manual e NWC, acesso horizontal, CSRF, secret ausente nas respostas, unicidade e migrations partindo de banco vazio.
- Worker: sucesso único com ledger balanceado, falhas, fallback manual, invoice única e resultado desconhecido sem retry.
- E2E desktop/mobile: confirmação independente de NWC, escolha manual, conexão NWC simulada, acompanhamento e revogação.
