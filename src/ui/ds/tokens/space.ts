/** Spacing scale — base 4. Phaser-free. Every gap/pad/margin uses one of these. */
export const SPACE = {
  s4: 4, s8: 8, s12: 12, s16: 16, s24: 24, s32: 32, s48: 48, s64: 64, s96: 96,
} as const
export type SpaceId = keyof typeof SPACE
