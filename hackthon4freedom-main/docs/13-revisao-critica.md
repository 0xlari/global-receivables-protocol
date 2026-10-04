# Revisão crítica da especificação

Revisão realizada em 2026-07-14 após a primeira consolidação dos documentos.

## Perspectiva de jurado de hackathon

- **Forte:** problema humano claro, aporte Lightning real, duas modalidades e reputação portátil.
- **Confuso:** USDT em Bitcoin pode consumir tempo de pitch e soar como promessa pronta.
- **Inviável no prazo:** ciclo completo mainnet, custódia, swap e distribuição com segurança de produção.
- **Falta provar:** uma invoice real conciliada e diferença visual entre Full BTC e pareada.
- **Pode comprometer:** depender de relay, cotação ou liquidez ao vivo.
- **Melhoria aplicada:** USDt Liquid via Breez virou spike e o roteiro ganhou fallback controlado; USDC e Taproot Assets saíram do MVP.

## Perspectiva de arquitetura

- **Forte:** monólito modular, ledger, estados e outbox.
- **Confuso:** fronteira entre saldo interno e saldo do nó.
- **Inviável:** escrow não custodial completo como primeira etapa.
- **Falta provar:** idempotência sob concorrência e backup/restauração.
- **Pode comprometer:** marcar efeitos externos desconhecidos como concluídos.
- **Melhoria aplicada:** conciliação, estados `pending/unknown` e custódia limitada foram explicitados.

## Perspectiva de segurança

- **Forte:** nenhuma `nsec`, PII fora do Nostr e acesso mínimo.
- **Confuso:** “plataforma cobre” poderia parecer cobertura ilimitada.
- **Inviável:** operar LATAM sem revisão país a país.
- **Falta provar:** reserva, limites, recuperação e segurança do nó.
- **Pode comprometer:** documentos, macaroons, hot wallet e ações administrativas.
- **Melhoria aplicada:** reserva segregada, tetos, dupla aprovação e bloqueadores de produção.

## Perspectiva da solicitante

- **Forte:** limite inicial, caminho explícito para crescer e opção de aceitar parcial.
- **Confuso:** redes sociais poderiam parecer requisito ou concurso de popularidade.
- **Inviável:** exigir garantia alta de quem busca liquidez.
- **Falta provar:** por que a solicitação foi recusada e quanto ela receberá líquido.
- **Pode comprometer:** cliente não querer usar Lightning.
- **Melhoria aplicada:** conexão social opcional, peso limitado e decisão explicável.

## Perspectiva da aportadora

- **Forte:** pool já validada e risco cambial descrito antes do aporte.
- **Confuso:** garantia de cobertura versus variação de sats.
- **Inviável:** prometer mesmos sats na Full BTC quando o recebível é fiat.
- **Falta provar:** custos, reserva e fórmula de distribuição.
- **Pode comprometer:** linguagem de retorno garantido.
- **Melhoria aplicada:** Full BTC devolve quantidade variável; cobertura limita-se à inadimplência sob termos.

## Perspectiva da operação

- **Forte:** revisão excepcional auditada, estados e tratamento de disputa.
- **Confuso:** quem autoriza mainnet, cobertura e saídas.
- **Inviável:** validação totalmente automática para todos os casos desde o início.
- **Falta provar:** fila de revisão, SLA e reconciliação diária.
- **Pode comprometer:** excesso de casos manuais no pitch.
- **Melhoria aplicada:** caminho feliz determinístico, exceções separadas e feature flags.

## Contradições e correções

| Achado | Correção |
|---|---|
| Mesmos sats na Full BTC e risco da aportadora eram incompatíveis | Quantidade final de sats passou a variar com a cotação |
| US$ 500 de garantia apareciam como US$ 1.000 adicionais | Corrigido para limite total de até US$ 1.000 |
| Plataforma cobria inadimplência sem teto | Cobertura condicionada a reserva, termos e limites |
| USDt parecia garantido em mainnet | Breez/Liquid classificado como spike com go/no-go |
| LATAM parecia lançamento simultâneo | Público inicial definido como pessoas no Brasil com pagamentos de pagadores no exterior, com foco em mulheres |
| Nostr poderia expor fatos negativos permanentes | MVP público prioriza fatos positivos; negativos exigem política e revisão |

## Requisitos resolvidos para a demo e pendentes para produção

- Desconto por prazo e risco recebeu fórmula demonstrativa v0.1.
- Aumento de limite por cada tipo de evidência recebeu fórmula demonstrativa v0.1.
- Haircut e liquidação da garantia.
- Teto da cobertura e tamanho da reserva.
- Custos reembolsáveis em pool cancelada.
- Fonte e política de cotações.

As fórmulas demonstrativas e os guardrails foram fechados na Etapa 0. Calibração com dados, execução real de garantias, capitalização da cobertura, swaps e fontes redundantes continuam bloqueadores de produção, mas não da Etapa 1.

## Conclusão

O MVP é coerente se limitar dinheiro real a um aporte pequeno, manter o ciclo completo controlado e tratar USDT como experimento técnico. A operação pública com fundos de terceiros continua fora do escopo até segurança, liquidez, reserva e enquadramento jurídico serem comprovados.
