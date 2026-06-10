// src/core — ponto de entrada da simulação pura (zero Phaser)
// Exporta tudo que o servidor e os testes precisam consumir deste diretório.
// NUNCA importe 'phaser' aqui nem em nenhum arquivo dentro de src/core/.

// Config
export * from './config/ring'
export * from './config/waves'
export * from './config/stats'
export * from './config/combat'

// RNG
export { createRng } from './rng'
export type { Rng } from './rng'

// Types / state model
export type {
  MoveInput,
  PlayerFsm,
  EnemyFsm,
  AllyFsm,
  PlayerState,
  EnemyState,
  AllyState,
  WandState,
  WaveState,
  ScoreState,
  GameStatus,
  GameState,
  SimEvent,
  EnemyType,
} from './types'
