# P3.4 — Demo flow final do GRP

Este documento define o percurso operacional do vídeo. Pitch, narração e duração
final pertencem à P3.7. A verificação de produção e envs pertence à P3.5.

## Cenário principal

Ana, personagem fictícia, tem US$ 100 a receber de um cliente dos Estados Unidos
por um serviço. Ela usa Elas Recebem Hoje, o primeiro Market do GRP.
Rede: Solana Devnet; ativo: token de teste do mint configurado como USDC no ambiente.
Não apresentar tokens de teste como dinheiro real ou como USDC mainnet.

Usar o mesmo recebível da criação ao Passport e financiamento completo.
Funding parcial, D+1, D+5 e cura são cenários opcionais separados: dependem do relógio
e não devem alongar o percurso principal.

### Valores do exemplo, com funding completo

| Movimento | Valor |
|---|---:|
| Valor nominal | 100,00 USDC |
| Meta/antecipação (80%) | 80,00 USDC |
| Pagamento integral do pagador | 100,00 USDC |
| Principal + retorno do investidor (3,5% sobre 80) | 82,80 USDC |
| Fee ERH (1% sobre nominal) | 1,00 USDC |
| Fee GRP (0,50% sobre nominal) | 0,50 USDC |
| Residual da solicitante | 15,70 USDC |

Fonte das regras: `src/config/erh-market-rules.ts` e MarketConfig on-chain.
Antes da gravação, conferir que a configuração publicada coincide com estas regras.
Alterar o tamanho do exemplo é permitido; alterar regras financeiras não faz parte desta etapa.

## Preparação

- Carteiras separadas: solicitante, pagador, investidor e operador autorizado.
- Todas com SOL Devnet suficiente para taxas/criação de contas; pagador e investidor
  também com saldo do mint exato configurado no ambiente (100 e 80 tokens, respectivamente).
- Usar apenas comprovante fictício em PDF/PNG/JPG. A interface envia metadados e um
  compromisso salted; não afirmar que o arquivo completo foi armazenado ou auditado.
- Solicitante sem outro recebível ativo que bloqueie um novo cadastro.
- Escolher vencimento pelo menos 7 dias à frente e funding antes do vencimento.
- Preferir perfis de navegador separados por papel para não confundir sessão e carteira.
  No mesmo perfil, trocar a carteira na extensão e fazer novo login como o próximo papel.
  Abas do mesmo perfil compartilham a sessão.
- Guardar ID do recebível, PDA da pool, PDA do Passport e assinaturas públicas.
  Links privados do pagador contêm token: não colocar em README, repo ou submission.

## Percurso e critério de sucesso

| Passo | Papel | Tela / ação | Evidência antes de avançar |
|---|---|---|---|
| 1 | Visitante | Home GRP → Markets → Open first Market | Marca GRP e Market ERH apresentados como protocolo e aplicação |
| 2 | Solicitante | ERH → Criar recebível → login Solana | Sessão vinculada à carteira da solicitante; login não transfere tokens |
| 3 | Solicitante | Criar serviço, descrição fictícia, país US, valor 100 e vencimento futuro | Registro privado + transação confirmada; link do pagador disponível |
| 4 | Pagador | Abrir o link privado; aceitar os dados; registrar compromisso | Confirmação no banco + compromisso on-chain com a carteira do pagador; nenhum débito automático |
| 5 | Operador | /administracao/grp → revisar o recebível → aprovar | Carteira autorizada; decisão confirmada on-chain e sincronizada no banco |
| 6 | Solicitante | Painel → detalhe do recebível → criar oportunidade | Pool confirmada; meta de 80 USDC e prazo válido |
| 7 | Investidor | /elas-recebem-hoje/oportunidades → financiar 80 USDC | Aporte confirmado, pool FULL e contribuição da carteira registrada |
| 8 | Solicitante | Oportunidades → Receber antecipação | Desembolso confirmado de 80 USDC e status ADVANCED |
| 9 | Solicitante | Painel/detalhe → Gerar link de pagamento | Novo link privado válido disponível para o mesmo recebível |
| 10 | Pagador | Abrir link → Pagar em USDC → assinar nova transação | Quitação integral de 100 USDC confirmada; banco sincronizado; pool SETTLED |
| 11 | Investidor | Oportunidades → Resgatar retorno | Resgate confirmado de 82,80 USDC para a mesma carteira do aporte |
| 12 | Solicitante | Oportunidades → Receber saldo residual | 15,70 USDC à solicitante; fees de 1,00 e 0,50 enviadas às tesourarias separadas |
| 13 | Solicitante | /elas-recebem-hoje/passaporte → atualizar | Contagem/volume de liquidação refletem o recebível e PDA verificável no Explorer Devnet |

O pagamento da interface usa `manual_repayment`, com nova assinatura do pagador.
O código atual permite quitação voluntária antes do vencimento. Já `settle_receivable`
marca cobrança devida e exige vencimento: não confundir essas instruções.
Confirmar a quitação antecipada no programa publicado durante o ensaio.
Se a versão publicada não permitir, usar um recebível já antecipado e vencido para
a segunda parte, identificando a mudança de cenário. Não burlar relógio ou regras.

## Plano de recuperação

| Interrupção | Ação |
|---|---|
| Cadastro privado salvo sem registro Solana | Usar Registrar na Solana no mesmo cadastro; não criar duplicata |
| Carteira diferente da sessão | Trocar carteira e refazer login no perfil correto |
| Link expirado/inválido | Solicitante reemite no painel/detalhe; usar apenas o link mais recente |
| Transação enviada com resultado desconhecido | Conferir assinatura no Explorer e atualizar; não repetir a transferência às cegas |
| Transação confirmada, banco não sincronizado | Registrar assinatura e erro; resolver sincronização antes de continuar |
| RPC ou carteira indisponível | Usar captura previamente gravada de uma operação real Devnet, identificada; não simular sucesso financeiro |

## Verificação desta etapa

- Inspecionado: encadeamento de componentes, APIs de sincronização e instruções do programa.
- Observado em produção: Markets → ERH; dois desvios identificados (CTA genérico e exemplo de 95%).
- Corrigido no código: CTA preserva o Market ERH; exemplo usa os 80% da configuração.
- Texto do protocolo corrigido: liquidação requer nova assinatura do pagador.
- Pendente: ensaio com as quatro carteiras e registro de assinaturas/saldos.
- Pendente: confirmação da versão do programa publicado e comportamento de quitação antecipada.

P3.4 só está concluída quando o percurso de 1 a 13 tiver sido ensaiado com evidências.
Revisão de código, testes locais e navegação pública não substituem transações assinadas.
