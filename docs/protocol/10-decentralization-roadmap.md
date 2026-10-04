# Roadmap de descentralização

## Limitação deliberada do hackathon

Na LRP v0.1, o cliente originador concentra validação, armazenamento NWC, contraparte do futuro DLC, executor NWC, carteira operacional, oráculo e coordenação da liquidação. Isso reduz o tempo de integração, mas cria censura, indisponibilidade, conflito de interesse e contraparte única.

## Separação obrigatória

1. Distinguir identidade e eventos do cliente originador, validador, executor, contraparte, carteira de liquidação, oráculo e árbitro.
2. Permitir que a prestadora escolha entre executores compatíveis e publique essa escolha.
3. Aceitar agentes operados pelos pagadores sem compartilhar o secret com o cliente originador.
4. Introduzir oráculos 2 de 3 e substituir atestados unilaterais.
5. Remover contraparte DLC única e permitir continuidade quando o cliente originador estiver offline.
6. Definir resolução descentralizada de disputas e provas portáveis.

## Critério de remoção da centralização

A limitação só será considerada removida quando nenhuma entidade isolada puder, sozinha, validar e executar a mesma obrigação; houver escolha e substituição de executor; settlement continuar sem o cliente originador; atestação crítica exigir quórum independente; e disputa possuir árbitro/procedimento fora do originador. Isso deve ser demonstrado por testes de falha e reconstrução entre implementações.
