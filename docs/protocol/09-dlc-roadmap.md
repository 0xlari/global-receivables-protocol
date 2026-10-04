# Roadmap de DLC

## Estado desta versão

DLC real não faz parte da LRP v0.1. As interfaces, o schema público mínimo da prova de funding e o fake determinístico estão implementados em `packages/protocol/src/dlc`. Nenhum aporte on-chain, funding transaction ou settlement é criado.

## Interface futura

O gateway deverá separar criação de oferta, aceite, prova de funding e consulta de status. A contraparte inicial será o cliente originador, explicitamente centralizado e substituível.

O fake usa somente identificadores determinísticos e a rede nominal `regtest-simulation`. Ele existe para testar contratos de integração; não contém wallet, chave, RPC Bitcoin, broadcast ou caminho de mainnet.

## Guardrails futuros

- funding outpoint público e verificável;
- reembolso pré-assinado/timelock testado;
- liquidação inicial on-chain;
- taxa on-chain estimada limitada a 2% do aporte;
- chaves sob controle das partes, nunca derivadas silenciosamente pela plataforma;
- recuperação, indisponibilidade do oráculo e reorg testados antes de mainnet.

## Condição para ativação

Revisão criptográfica independente, test vectors cruzados, teste em ambiente sem fundos reais, runbook de recuperação, aprovação operacional explícita e atualização dos guardrails. Este documento não concede essa autorização.
