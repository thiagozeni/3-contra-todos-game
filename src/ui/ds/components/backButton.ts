/**
 * BackButton — the DS "‹ VOLTAR" control with an animated rollover. On hover the
 * chevron slides left-and-back in a loop (reads as "go back") and the whole
 * button leans in slightly (a soft scale "apoio"); on press it dips. Built from
 * a Container (chevron + label) so the lean scales as one unit. Used by every
 * secondary screen (How to Play, Top 10, …) for a consistent back affordance.
 */
import type Phaser from 'phaser'
import { dsText } from '../text'
import type { TypeRole } from '../tokens/type'

export interface BackButtonOpts {
  x: number
  y: number
  label?: string
  onClick: () => void
  role?: TypeRole
  depth?: number
  /** Pin to camera. Default true. */
  fixed?: boolean
}

export interface BackButtonHandle {
  readonly container: Phaser.GameObjects.Container
  setVisible(v: boolean): void
  destroy(): void
}

export function makeBackButton(scene: Phaser.Scene, o: BackButtonOpts): BackButtonHandle {
  const role: TypeRole = o.role ?? 'h3'
  const depth = o.depth ?? 2
  const fixed = o.fixed ?? true
  const label = o.label ?? 'VOLTAR'

  const container = scene.add.container(o.x, o.y).setDepth(depth)
  if (fixed) container.setScrollFactor(0)

  // Chevron + label, both gold, baseline-centred. Chevron sits at relative x=0.
  const chevron = dsText(scene, 0, 0, '‹', { role, color: 'textBrand', origin: [0, 0.5] })
  const gap = 10
  const labelText = dsText(scene, chevron.width + gap, 0, label, { role, color: 'textBrand', origin: [0, 0.5] })
  container.add([chevron, labelText])

  const totalW = chevron.width + gap + labelText.width
  const h = Math.max(chevron.height, labelText.height)

  // Expanded, forgiving hit area (touch on iPad).
  const padX = 22
  const padY = 18
  const hit = scene.add.rectangle(o.x - padX, o.y, totalW + padX * 2, h + padY * 2, 0x000000, 0)
    .setOrigin(0, 0.5).setDepth(depth + 1).setInteractive({ useHandCursor: true })
  if (fixed) hit.setScrollFactor(0)

  let chevronTween: Phaser.Tweens.Tween | undefined
  const enter = () => {
    scene.tweens.add({ targets: container, scale: 1.08, duration: 150, ease: 'Back.Out' })
    chevronTween?.remove()
    chevron.x = 0
    chevronTween = scene.tweens.add({
      targets: chevron, x: -7, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    })
  }
  const leave = () => {
    chevronTween?.remove(); chevronTween = undefined
    scene.tweens.add({ targets: chevron, x: 0, duration: 140, ease: 'Quad.Out' })
    scene.tweens.add({ targets: container, scale: 1, duration: 160, ease: 'Quad.Out' })
  }
  hit.on('pointerover', enter)
  hit.on('pointerout', leave)
  hit.on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev?: Phaser.Types.Input.EventData) => {
    ev?.stopPropagation()
    // Dip "press" then fire.
    scene.tweens.add({ targets: container, scale: 0.94, duration: 80, yoyo: true, ease: 'Quad.Out' })
    o.onClick()
  })

  return {
    container,
    setVisible: (v: boolean) => { container.setVisible(v); hit.setVisible(v) },
    destroy: () => {
      chevronTween?.remove()
      scene.tweens.killTweensOf(container); scene.tweens.killTweensOf(chevron)
      container.destroy(); hit.destroy()
    },
  }
}
