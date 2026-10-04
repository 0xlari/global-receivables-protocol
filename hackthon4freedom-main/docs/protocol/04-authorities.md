# Matriz de autoridades

| Ação | Autoridade na LRP v0.1 | Condições |
|---|---|---|
| Criar recebível | prestadora | assinatura corresponde à pubkey declarada |
| Decidir validação | cliente originador | decisão vale somente sob sua pubkey e política |
| Atestar NWC | cliente originador | mesmo cliente da decisão usada pela pool |
| Criar pool | prestadora | mesma autora do recebível e pré-condições válidas |
| Cancelar livremente | prestadora | nenhum aporte financiado |
| Solicitar reembolso | prestadora/cliente | com aporte, antes de `DISBURSED` |
| Aceitar parcial | prestadora | entre 5000 e 9999 bps, dentro de 24 horas |
| Confirmar fato financeiro | cliente originador | apenas papel transitório na LRP v0.1 |

## Regras determinísticas

- Rejeição por um cliente não impede que outro cliente avalie o mesmo recebível.
- Uma pool não pode combinar aprovação de um cliente com atestado NWC de outro.
- O cliente que rejeitou não pode originar a pool sem publicar uma nova decisão válida e autorizada que substitua semanticamente sua decisão anterior segundo a política definida nos schemas.
- `DISBURSED` torna cancelamento proibido.
- Autoridade é verificada pela pubkey que assinou o evento, nunca por cookie ou linha do banco.
- Eventos conflitantes sem uma regra de precedência explícita são rejeitados como ambíguos; `created_at` não desempata autoridade.
