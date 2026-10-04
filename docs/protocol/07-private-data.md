# Dados privados e projeções públicas

## Permitido no armazenamento privado

Documentos, CPF/identificação civil, contratos, sessões, confirmação completa do pagador, URI NWC cifrada, scheduler, auditoria privada e operações internas do cliente originador podem permanecer no banco com controle de acesso e retenção.

## Permitido no evento público

Somente fatos mínimos previstos por schema, IDs opacos, hashes seguros não reconstruíveis, termos públicos e pubkeys necessárias para verificar autoria e autoridade.

Hashes de valores com espaço pequeno de busca não são privacidade. Confirmações e evidências devem usar representação canônica e material aleatório privado quando necessário para impedir enumeração.

## Cache reconstruível

Uma entrada pode guardar event ID, kind, pubkey, `created_at`, tags, content, assinatura, relays observados e última sincronização. Ela não pode sobrescrever o evento original nem decidir estado. Apagar projeções e reler os mesmos eventos deve produzir estado público equivalente e relatório determinístico.

## Logs e respostas

Nunca registrar ou devolver `nsec`, seed, documento, CPF, confirmação privada, invoice, preimage, URI/secret NWC ou credencial de relay privado. Erros usam códigos estáveis e metadados allowlisted.
