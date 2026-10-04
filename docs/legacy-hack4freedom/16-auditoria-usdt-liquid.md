# Auditoria USDt Liquid e prontidão mainnet

## Resultado em 2026-07-14

**Decisão: NO_GO operacional.** A integração técnica está preparada para produzir um relatório `GO`/`NO_GO`, mas nenhuma credencial, carteira, rota ou fundo real foi usado nesta auditoria. A Fase 9 permanece bloqueada.

## Evidências verificadas sem conexão financeira

- O Breez SDK Liquid instalado e fixado é `0.12.4`.
- A documentação oficial do SDK lista, para Liquid mainnet, L-BTC `6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d` e Tether USDt `ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2`, ambos com precisão 8.
- USDC não integra configuração, domínio, schema ou fluxo.
- O pacote Node exige runtime 22 ou superior; o projeto usa Node 24.
- A sondagem de rota tem flag separada, fica desligada por padrão e chama apenas preparação. `sendPayment` nunca faz parte do coletor de auditoria.
- O teto da auditoria é 1% de slippage, inferior ao máximo estrutural de 5% do registro de swaps.
- Backup/restauração são comparados por snapshots SHA-256 de fingerprint, pagamentos e saldos; seed, mnemonic e conteúdo do backup não entram no relatório.
- Reembolsáveis, resultados desconhecidos, saldo superior a 10.000 sats, divergência de ledger, cotação expirada ou restauração divergente resultam em `NO_GO`.
- O PostgreSQL impede registrar `GO` com execução externa, USDC, asset ID divergente, slippage acima de 1%, saldo acima do teto, reembolsável, resultado desconhecido, reconciliação ausente ou prova de backup inválida.

## Motivos do NO_GO atual

1. Pessoa responsável pela carteira/interrupção ainda não foi nomeada.
2. API key e mnemonic não foram configurados em cofre de runtime.
3. Diretório persistente e backup externo isolado não foram provisionados.
4. Rota L-BTC → USDt, liquidez, tarifa e slippage não foram sondados em mainnet.
5. Backup/restauração real e conciliação zerada não foram comprovados.
6. Nenhuma avaliação jurídica autoriza operação pública.

## Como produzir um novo relatório

1. Nomear responsável e janela acompanhada.
2. Provisionar dois diretórios persistentes isolados e caminho absoluto de backup fora do repositório.
3. Configurar segredos somente no cofre do runtime.
4. Manter `BREEZ_ENABLE_MAINNET=false` enquanto valida configuração e banco.
5. Em janela aprovada, habilitar mainnet e `BREEZ_ENABLE_AUDIT_PROBES=true` apenas para preparar a rota de 1 USDt; não executar o swap.
6. Executar backup, restaurar em instância isolada e comparar snapshots.
7. Confirmar zero reembolsáveis, zero resultados desconhecidos, saldo dentro do teto e reconciliação `MATCHED`.
8. Persistir o relatório idempotente. Mesmo um `GO` técnico não movimenta fundos nem habilita a Fase 9 automaticamente.

## Fontes primárias

- [Ativos e metadados padrão do Breez SDK Liquid](https://sdk-doc-liquid.breez.technology/guide/assets.html)
- [Conexão e diretório de trabalho](https://sdk-doc-liquid.breez.technology/guide/connecting.html)
- [Checklist de produção e reembolsáveis](https://sdk-doc-liquid.breez.technology/guide/production.html)
- [Pacote oficial e requisito de Node](https://sdk-doc-liquid.breez.technology/guide/install.html)
