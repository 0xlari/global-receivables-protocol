# Modelo de confiança

## Atores

- **Prestadora:** cria o recebível e a pool e aceita ou cancela dentro dos limites de autoridade.
- **Pagador:** confirma privadamente o compromisso e concede autorização NWC fora do evento público.
- **Cliente originador:** verifica a confirmação, decide segundo sua política, guarda NWC cifrado e, nesta versão, acumula execução, oráculo e coordenação.
- **Aportadora:** observa o grafo público; aporte e DLC permanecem simulados nesta etapa.
- **Relays:** transportam eventos, mas não decidem validade nem estado.

## O que não precisa ser confiado

Um relay isolado, o cache local e o banco da plataforma não podem inventar autoria ou estado. Assinaturas, hashes canônicos, regras de autoridade e referências são verificados localmente.

## Confianças residuais da LRP v0.1

O cliente originador pode omitir eventos, reter operação, indisponibilizar o scheduler ou atestar fatos incorretos sob sua própria pubkey. A assinatura torna a autoria auditável, mas não prova que a afirmação corresponde ao mundo externo. O NWC continua revogável e pode falhar por saldo, quota, rota ou indisponibilidade.

## Falhas seguras

- Menos de dois ACKs: publicação inconclusiva; não promover estado local como publicado.
- Referência ausente: evento rejeitado até que a dependência seja obtida.
- Assinatura, schema ou autoridade inválida: evento ignorado com motivo.
- Resultado NWC `UNKNOWN`: bloquear retry até reconciliação.
- Dados privados em payload público: rejeitar antes da assinatura e novamente na leitura.

## Não objetivos

Esta versão não oferece neutralidade de oráculo, continuidade sem o cliente originador, privacidade de metadados contra relays, prova criptográfica do documento, custódia, settlement ou resolução completa de disputa.
