# Runbook Breez Liquid mainnet

## Estado

O gateway está implementado, mas permanece desligado por padrão. Testes automatizados usam fakes e não criam invoices, swaps ou transações reais. Nunca cole mnemonic, seed ou API key em issue, chat, log ou arquivo versionado.

## Pré-requisitos para a primeira ativação

1. Nomear a pessoa responsável pela carteira e pela interrupção da operação.
2. Obter API key específica do Breez SDK Liquid.
3. Gerar e guardar o mnemonic em cofre de segredos, com backup offline conferido.
4. Preparar diretório persistente exclusivo para o estado do SDK e um backup separado.
5. Aplicar as migrations PostgreSQL e confirmar banco/ledger vazios para a sessão controlada.
6. Manter os asset IDs fixos: L-BTC `6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d` e Tether USDt `ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2`.

## Limites imutáveis desta fase

- Invoice: até 1.000 sats.
- Total solicitado na sessão: até 5.000 sats, protegido transacionalmente no PostgreSQL.
- Carteira quente: até 10.000 sats.
- Slippage: no máximo 5% no schema; a operação deve escolher limite menor.
- Uma divergência ou resultado desconhecido bloqueia retry automático.

## Sequência controlada

1. Iniciar com `BREEZ_ENABLE_MAINNET=false` e validar carregamento, banco, backup e conciliação zerada.
2. Configurar API key e mnemonic somente no cofre do runtime.
3. Obter nova auditoria `GO`, aprovação humana vigente e armar uma sessão controlada.
4. Habilitar `BREEZ_ENABLE_MAINNET=true` e `BREEZ_ENABLE_CONTROLLED_DEMO=true` somente durante a janela acompanhada.
5. Criar uma única invoice de valor abaixo de 1.000 sats.
6. Pagar a invoice, aguardar evento `paymentSucceeded` e executar polling de confirmação.
7. Conferir: uma contribuição, duas partidas BTC balanceadas, pool incrementada uma vez e conciliação `MATCHED`.
8. Fazer backup do estado Breez e testar restauração em ambiente isolado antes de qualquer segunda sessão.
9. Encerrar a sessão e desligar as duas flags.

## Auditoria da Fase 8 — sem movimentação

1. Manter `BREEZ_ENABLE_AUDIT_PROBES=false` por padrão.
2. Validar asset IDs, precisão 8, versão fixada e ausência de USDC offline.
3. Restaurar um backup em uma segunda instância/diretório isolado e comparar os hashes dos snapshots.
4. Após autorização da janela, habilitar `BREEZ_ENABLE_AUDIT_PROBES=true` e preparar uma rota L-BTC → 1 USDt com slippage máximo de 1%.
5. Não chamar `sendPayment`; a sondagem termina após a preparação.
6. Rescanear swaps, listar reembolsáveis, verificar resultados desconhecidos e conciliar saldos.
7. Persistir `GO` somente se todas as verificações passarem. Qualquer item ausente registra `NO_GO`.
8. Desligar as flags. Um `GO` de auditoria não autoriza invoice, swap, saque ou Fase 9.

O resultado inicial e os bloqueios atuais estão em `docs/16-auditoria-usdt-liquid.md`.
Os controles e pendências da Fase 9 estão em `docs/17-demo-mainnet-controlada.md`.

## Interrupção

Desligar imediatamente a flag e impedir novas saídas se houver saldo acima do teto, asset desconhecido, valor divergente, pagamento tardio, swap `UNKNOWN`, falha de restauração ou diferença entre Breez e ledger. Preservar banco e diretório do SDK; não repetir o efeito externo até concluir a conciliação.
