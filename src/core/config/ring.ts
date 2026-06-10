// Pure TS — zero Phaser. Shared by server simulation and Phaser client.

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export const RING = {
  top: 650,
  bottom: 1000,
  leftTop: 670,
  leftBottom: 430,
  rightTop: 1260,
  rightBottom: 1530,
  // Lateral limits interpolated by depth (y)
  leftAt:  (y: number) => lerp(670, 430,  clamp((y - 650) / 350, 0, 1)),
  rightAt: (y: number) => lerp(1260, 1530, clamp((y - 650) / 350, 0, 1)),
  // Compat: extreme limits for legacy code
  left: 430,
  right: 1530,
}
