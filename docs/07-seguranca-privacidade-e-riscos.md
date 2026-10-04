# Segurança, privacidade e riscos

## Ativos protegidos

Fundos BTC/USDT, credenciais do nó, macaroons, documentos, identidade, contatos, tokens de confirmação, cotações, ledger, garantias, decisões de validação e pubkeys vinculadas.

## Fronteiras de confiança

Navegador, API, banco, object storage, workers, administração, Breez SDK Liquid, diretório persistente da carteira, signer, provedores de cotação/swap, mensageria e relays Nostr. Cada integração externa pode falhar, mentir, repetir ou atrasar respostas.

## Controles do MVP

- Buckets privados, URLs temporárias e criptografia.
- Tokens armazenados por hash, com expiração e invalidação.
- MFA e menor privilégio administrativo.
- Segregação lógica por pool e ledger de partidas dobradas.
- Idempotência e reconciliação externa.
- Allowlist e limites mínimos para mainnet.
- Dupla aprovação para saídas e mudança de regras financeiras.
- Logs sem PII/segredos e auditoria de acesso a documentos.
- Consentimento granular para redes sociais; revogação interrompe novas consultas.
- Dados fictícios na demo, exceto aporte explicitamente autorizado.
- Nenhuma conta, saldo, cobrança ou custódia fiat: o cliente adquire BTC fora da plataforma.

## Documentos e validação

Upload verifica tipo real, tamanho, malware e extensão; documentos não são servidos inline sem headers seguros. OCR ou IA pode extrair sinais, mas não aprova sozinha. Acesso administrativo excepcional registra justificativa.

Duplicidade usa hashes internos, atributos normalizados protegidos e comparação de cliente/valor/vencimento. Hash puro de CPF ou e-mail não deve ser publicado nem tratado como anonimização.

## Redes sociais

Conexão é opcional e usa OAuth quando disponível. Guardar apenas dados necessários, fonte e validade. Não pedir senha, não raspar conteúdo privado e não inferir gênero. Popularidade pode ser manipulada; o sinal aumenta no máximo uma parcela limitada do limite.

## Reserva e cobertura

A promessa de cobrir inadimplência cria risco de crédito para a plataforma. Devem existir reserva segregada, teto por operação, teto por cliente, concentração máxima, suspensão automática e termos claros. Sem reserva suficiente, novas pools não abrem. A cobertura não será descrita como ilimitada.

## Tabela de riscos

| Risco | Probabilidade | Impacto | Mitigação no MVP | Mitigação futura |
|---|---|---:|---|---|
| Documento falso | Média | Alto | confirmação do cliente, revisão excepcional, limite baixo | provedores de identidade e fraude |
| Recebível duplicado | Média | Alto | fingerprints internos e bloqueio | compartilhamento antifraude permitido por lei |
| Cliente falso/colusão | Média | Alto | contato independente, histórico, limite | verificação empresarial e análise de rede |
| Conta social comprada | Alta | Médio | peso limitado e múltiplas fontes | modelo antifraude validado |
| Inadimplência | Média | Crítico | garantia, reserva e tetos | precificação e recuperação profissionais |
| Reserva insuficiente | Média | Crítico | bloquear novas pools por exposição | capital e stress testing |
| Liquidez BTC insuficiente para pool pareada | Média | Crítico | reservar BTC antes de abrir a pool | gestão de tesouraria e hedge automatizado |
| Roubo da carteira quente | Baixa/Média | Crítico | saldo mínimo, menor privilégio, dupla aprovação | HSM/MPC e escrow |
| Perda da seed/estado Breez Liquid | Média | Crítico | signer protegido, backup e teste de restauração | HSM/MPC e redundância madura |
| Falha/baixa liquidez USDt Liquid | Alta | Alto | feature flag e spike antes de uso | múltiplos provedores/rotas |
| Manipulação de cotação | Média | Alto | fonte versionada, validade e limites | múltiplos oráculos e circuit breaker |
| Webhook duplicado | Alta | Alto | idempotência e unicidade | reconciliação contínua |
| Pool sobre-financiada | Média | Alto | reserva temporária de capacidade | invoices/quotes atômicas aprimoradas |
| Vazamento de documento | Baixa/Média | Crítico | bucket privado, auditoria, retenção | DLP e gestão de chaves dedicada |
| Exposição em Nostr | Média | Alto | schema mínimo e revisão de payload | relay/política especializada |
| Sybil Nostr | Alta | Médio | pubkey sozinha não aumenta limite | rede de emissores confiáveis |
| Evento incorreto permanente | Média | Alto | correção referenciada; negativos internos | governança e apelação independente |
| Ação administrativa maliciosa | Baixa/Média | Crítico | MFA, quatro olhos, auditoria | HSM, segregação organizacional |
| Disputa transfronteiriça | Média | Alto | Brasil primeiro, termos limitados | operação e aconselhamento por país |
| Cotação ou spread cambial pouco transparente | Média | Alto | exibir fonte, horário, spread, tarifas e líquido | múltiplas fontes e auditoria independente |
| Classificação regulatória adversa | Média | Crítico | não lançar publicamente sem análise | licenças/parceiros adequados |
| Demo mainnet falhar | Média | Médio | valor baixo e roteiro alternativo | ambiente operacional redundante |

## Privacidade e retenção

Definir finalidade e prazo por categoria. Documentos expiram após obrigação legal/contratual; tokens e dados temporários têm prazo curto. Usuária pode desconectar rede social e solicitar exclusão quando aplicável, preservando somente registros necessários à obrigação, fraude e auditoria.

## Resposta a incidentes

Congelar novas invoices/saídas, preservar evidências, conciliar nó e ledger, rotacionar credenciais, comunicar pessoas afetadas conforme obrigação, publicar status sem dados sensíveis e produzir análise de causa raiz.

## Riscos abertos antes de produção

- Enquadramento jurídico de antecipação, câmbio, pagamento transfronteiriço, oferta de retorno, custódia, garantia e stablecoin no Brasil e no país do cliente.
- Fonte e capitalização da reserva.
- Breez SDK Liquid e infraestrutura de swaps USDt com liquidez comprovada.
- Recuperação de carteira, signer, estado persistente e banco sob desastre real.
- Política contratual de garantia, inadimplência e disputa.

## Controles e riscos NWC

- URI NWC é credencial: AES-256-GCM no servidor, chave dedicada, fingerprint separado, leitura sem secret e acesso restrito ao worker.
- APIs exigem token por recurso, mesma origem, limite de payload, rate limit, expiração, revogação e auditoria sem credenciais.
- Relays aceitos usam apenas `wss://` público, com quantidade, tamanho e timeout limitados.
- Resultado desconhecido bloqueia retry; falha definitiva preserva uma única invoice para fallback manual.

Vazamento ou abuso de conexão NWC tem impacto crítico; mitigação atual combina cifragem, ausência em logs/Nostr, uso único, limites internos e revogação. Indisponibilidade ou malícia do relay não bloqueia pagamento manual. Produção ainda exige KMS/cofre, rotação, reconciliação externa, alertas e auditoria independente.
