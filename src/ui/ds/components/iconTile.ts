/**
 * IconTile — a premium pixel-art icon (joystick/pause/bolt/…) as a *separate,
 * animated* DS component. Built for the Fatia V direction: nothing flat — every
 * icon can float, glow/pulse, and (when interactive) react to hover/press.
 *
 * The glow is a clone of the sprite rendered behind with ADD blend + a tint,
 * scaled up and pulsing in alpha — pixel-safe (no shader/blur), reads as a halo.
 * Icons keep nearest-neighbour scaling so the pixel art stays crisp.
 *
 * Consumes the assets extracted via rembg+connected-components
 * (public/imgs/ui/ic-*.png) — see memory reference_ui_component_extraction.
 */
import Phaser from 'phaser'
import { primitive } from '../tokens/colors'
import { padInteractive } from '../../../utils/iosVideo'

export interface IconTileOpts {
  x: number
  y: number
  /** Texture key, e.g. 'ic-pause' (preloaded in BootScene). */
  texture: string
  /** On-screen height in px (width keeps the source aspect ratio). Default 48. */
  size?: number
  depth?: number
  /** Pin to the camera (HUD). Default true. */
  fixed?: boolean
  /** Continuous idle bob (subtle vertical float). Default false. */
  float?: boolean
  /** Continuous halo pulse from creation. Default false. */
  glow?: boolean
  /** Halo colour (DS token, numeric). Default Arcade Gold. */
  glowColor?: number
  /**
   * Draw a keycap-style backplate behind the icon (rounded square, gold fill,
   * black + gold-hi border) so monochrome pixel-art icons (pause/lock/…) read
   * over any background — matches the concept's gold keycaps. Default false.
   */
  plate?: boolean
  /** Backplate fill colour (DS token, numeric). Default Arcade Gold. */
  plateColor?: number
  /** Makes the tile clickable with hover/press feedback + a glow on hover. */
  onClick?: () => void
}

export interface IconTileHandle {
  readonly sprite: Phaser.GameObjects.Sprite
  /** Turn the continuous halo pulse on/off. */
  setGlow(on: boolean): void
  /** One-shot attention pulse (e.g. value changed, special charged). */
  pulse(): void
  setEnabled(v: boolean): void
  setVisible(v: boolean): void
  setPosition(x: number, y: number): void
  destroy(): void
}

export function makeIconTile(scene: Phaser.Scene, o: IconTileOpts): IconTileHandle {
  const size = o.size ?? 48
  const depth = o.depth ?? 0
  const fixed = o.fixed ?? true
  const glowColor = o.glowColor ?? primitive.goldBrand
  let enabled = true

  const src = scene.textures.get(o.texture).getSourceImage() as { width: number; height: number }
  const aspect = src.width > 0 && src.height > 0 ? src.width / src.height : 1
  const dispH = size
  const dispW = Math.round(size * aspect)

  // ── Keycap-style backplate (optional) ────────────────────────────────────
  let plate: Phaser.GameObjects.Graphics | undefined
  if (o.plate) {
    const fill = o.plateColor ?? primitive.goldBrand
    const pad = Math.round(size * 0.34)
    const side = Math.max(dispW, dispH) + pad
    const r = Math.round(side * 0.18)
    const px = o.x - side / 2
    const py = o.y - side / 2
    plate = scene.add.graphics().setDepth(depth)
    if (fixed) plate.setScrollFactor(0)
    plate.fillStyle(fill, 1).fillRoundedRect(px, py, side, side, r)
    plate.lineStyle(4, primitive.black, 1).strokeRoundedRect(px, py, side, side, r)
    plate.lineStyle(2, primitive.goldHi, 1).strokeRoundedRect(px + 2, py + 2, side - 4, side - 4, r - 1)
  }

  // ── Halo (clone behind, ADD blend) ──────────────────────────────────────
  const halo = scene.add.sprite(o.x, o.y, o.texture)
    .setDisplaySize(dispW, dispH)
    .setTint(glowColor)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(depth)
    .setScale(0)               // hidden until glow/pulse
    .setAlpha(0)
  if (fixed) halo.setScrollFactor(0)

  // ── Icon ────────────────────────────────────────────────────────────────
  const sprite = scene.add.sprite(o.x, o.y, o.texture)
    .setDisplaySize(dispW, dispH)
    .setDepth(depth + 1)
  if (fixed) sprite.setScrollFactor(0)

  const haloBase = 1.18  // halo is ~18% bigger than the icon

  let glowTween: Phaser.Tweens.Tween | undefined
  const startGlow = () => {
    if (glowTween) return
    halo.setScale(sprite.scaleX * haloBase, sprite.scaleY * haloBase)
    glowTween = scene.tweens.add({
      targets: halo,
      alpha: { from: 0.15, to: 0.55 },
      duration: 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })
  }
  const stopGlow = () => {
    glowTween?.remove()
    glowTween = undefined
    scene.tweens.add({ targets: halo, alpha: 0, duration: 180 })
  }

  // ── Idle float ───────────────────────────────────────────────────────────
  if (o.float) {
    scene.tweens.add({
      targets: [sprite, halo],
      y: o.y - Math.max(3, size * 0.08),
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    })
  }

  if (o.glow) startGlow()

  // ── One-shot attention pulse ──────────────────────────────────────────────
  const pulse = () => {
    halo.setScale(sprite.scaleX * haloBase, sprite.scaleY * haloBase)
    scene.tweens.killTweensOf(halo)
    halo.setAlpha(0.7)
    scene.tweens.add({ targets: halo, alpha: glowTween ? 0.3 : 0, duration: 420, ease: 'Quad.Out' })
    scene.tweens.add({
      targets: sprite, scale: sprite.scaleX * 1.18, duration: 110, yoyo: true, ease: 'Quad.Out',
    })
  }

  // ── Interactive (hover/press) ─────────────────────────────────────────────
  let hit: Phaser.GameObjects.Rectangle | undefined
  if (o.onClick) {
    const baseScaleX = sprite.scaleX
    const baseScaleY = sprite.scaleY
    hit = scene.add.rectangle(o.x, o.y, dispW + 18, dispH + 18, 0x000000, 0).setDepth(depth + 2)
    if (fixed) hit.setScrollFactor(0)
    padInteractive(hit)
    hit.on('pointerover', () => {
      if (!enabled) return
      startGlow()
      scene.tweens.add({ targets: sprite, scaleX: baseScaleX * 1.12, scaleY: baseScaleY * 1.12, duration: 120, ease: 'Back.Out' })
    })
    hit.on('pointerout', () => {
      if (!o.glow) stopGlow()
      scene.tweens.add({ targets: sprite, scaleX: baseScaleX, scaleY: baseScaleY, duration: 140, ease: 'Quad.Out' })
    })
    hit.on('pointerdown', () => {
      if (!enabled) return
      scene.tweens.add({ targets: sprite, scaleX: baseScaleX * 0.9, scaleY: baseScaleY * 0.9, duration: 70, yoyo: true, ease: 'Quad.Out' })
      o.onClick!()
    })
  }

  return {
    sprite,
    setGlow: (on: boolean) => { on ? startGlow() : stopGlow() },
    pulse,
    setEnabled: (v: boolean) => {
      enabled = v
      sprite.setAlpha(v ? 1 : 0.4)
    },
    setVisible: (v: boolean) => {
      sprite.setVisible(v); halo.setVisible(v); plate?.setVisible(v); hit?.setVisible(v)
    },
    setPosition: (x: number, y: number) => {
      // Note: a keycap plate is drawn at absolute coords and does not follow.
      sprite.setPosition(x, y); halo.setPosition(x, y); hit?.setPosition(x, y)
    },
    destroy: () => {
      glowTween?.remove()
      scene.tweens.killTweensOf(sprite); scene.tweens.killTweensOf(halo)
      sprite.destroy(); halo.destroy(); plate?.destroy(); hit?.destroy()
    },
  }
}
