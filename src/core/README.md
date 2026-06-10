# src/core — Simulação Pura (Zero Phaser)

Este diretório contém a camada de simulação pura do jogo: lógica de entidades, combate, ondas e qualquer regra de negócio que não dependa de renderização.

## Regra fundamental

**Importar Phaser aqui é PROIBIDO.**

Todo código em `src/core/` deve ser executável:
- No servidor de jogo (Node.js sem contexto de browser)
- Em testes unitários (Vitest, sem DOM)
- Sem nenhuma dependência de `phaser`, `window`, `document` ou APIs de browser

## Por que essa restrição existe

A separação entre simulação e renderização permite:
1. Testar a lógica do jogo sem inicializar o Phaser
2. Rodar a simulação no servidor para validação anti-cheat
3. Manter o código de jogo reutilizável e portável

## Enforcement automático

O arquivo `tests/core/no-phaser-imports.test.ts` verifica automaticamente que nenhum `.ts` deste diretório importa `phaser`. O teste roda em todo `npm test` e bloqueia commits que violem a regra.
