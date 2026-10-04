# Escopo do MVP

> **Estado:** implementado (login NIP-07, recebível, confirmação, validação, NWC, atestado, pool, projeções); controlado (NWC com `NWC_ENABLE_LIVE=false`, simulação de câmbio); planejado (aportes reais, scheduler, cobrança, distribuição, mainnet).
>
> Este documento descreve a plataforma **Elas Recebem Hoje**. O protocolo **LRP** é especificado em `docs/protocol/`.

## Obrigatório para o pitch

- Landing/proposta de valor orientada a mulheres, sem exclusão por gênero.
- Login por NIP-07 com a mesma pubkey assinando os eventos da prestadora.
- Conta demonstrativa com limite inicial de US$ 100 e explicação de aumentos.
- Cadastro de recebível e upload fictício protegido.
- Pagamento legítimo devido a uma solicitante no Brasil por pagador no exterior: salário, venda, comissão, serviço ou outro comprovável.
- Desembolso da solicitante exclusivamente em BTC via Lightning, líquido de taxas e spread cobrados dela sem reduzir a pool. **Estado: planejado — desembolso real não habilitado.**
- Link de confirmação do cliente.
- Aceite explícito do cliente para pagamento em BTC; recusa encerra a solicitação antes da pool.
- Validação automática explicável e revisão excepcional representada.
- Conexão NWC do pagador: vinculada ao recebível, com limite máximo, `pay_invoice`, validade, armazenamento cifrado, revogação local na plataforma e uso único. **Na versão `lrp/0.1.0`, uma `NwcAuthorizationAttestation` ativa é requisito do grafo para a publicação de `PoolCreated`. A implementação de referência Elas Recebem Hoje aplica essa regra exigindo que o pagador autorize previamente o pagamento via NWC. O pagamento manual não produz `NwcAuthorizationAttestation` e, portanto, na versão `lrp/0.1.0`, não libera `PoolCreated`.**
- Prestadora revisa os termos e assina `PoolCreated`.
- Comparação clara entre Full BTC e pareada em dólar. **Estado: pareada em dólar fora do MVP.**
- Tela de pool com progresso e riscos.
- Cenários de pool completa e parcial; aceite ou reembolso. **Estado: planejado — aportes reais não habilitados.**
- Perfil de reputação dimensional e um atestado Nostr seguro.
- Modo alternativo da demo sem dependência externa.

## Importante

- Ledger de partidas dobradas para o caminho demonstrado.
- Idempotência de invoices e eventos.
- Painel administrativo mínimo para exceções.
- Histórico do cliente e detecção de duplicidade com dados fictícios.
- Português e base de internacionalização para espanhol.
- Auditoria das decisões de limite.

## Opcional

- Pagamento real do cliente via NWC (`NWC_ENABLE_LIVE=true`). **Estado: experimental — compatibilidade live ainda em endurecimento.**
- Payout Lightning real da distribuição. **Estado: planejado.**
- Badge NIP-58.
- Spike real de USDt Liquid via Breez SDK, sem entrar no caminho crítico.

## Pós-hackathon

- USDt Liquid em produção somente após liquidez, recuperação, conciliação e custódia comprovadas.
- Escrow/multisig e timelocks.
- Scheduler automático de vencimento com retries e reconciliação.
- Motor de risco calibrado com dados.
- Reserva capitalizada e recuperação de crédito.
- Expansão país a país na LATAM.
- Payout bancário em BRL e suporte a múltiplos trilhos fiat.
- Recebimento ou conversão de moeda fiat pela plataforma.
- Saque da solicitante em USDT ou qualquer ativo diferente de BTC.
- App móvel, múltiplos idiomas e múltiplos meios de pagamento.
- Mercado secundário e integrações contábeis.

## Explicitamente fora do escopo

- Valores reais relevantes ou acesso público irrestrito.
- Retorno garantido sem condições.
- Cobertura ilimitada da plataforma.
- Publicação de documentos ou dados pessoais em Nostr.
- Armazenamento de `nsec`.
- Aprovação por aportadoras ou papel comunitário de verificadora.
- Decisão financeira autônoma por IA generativa.
- Alegação de conformidade regulatória sem avaliação profissional.

## Linha de corte

Se o prazo apertar, preservar nesta ordem: história completa, cálculo correto, transparência de risco, aporte Lightning pequeno e roteiro alternativo. USDT real, redes sociais reais e refinamentos administrativos são removidos primeiro.
