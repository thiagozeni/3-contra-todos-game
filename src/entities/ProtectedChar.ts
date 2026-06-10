import Phaser from 'phaser'
import { RING } from '../core/config/ring'

export class ProtectedChar extends Phaser.GameObjects.Image {
  public hp: number = 200
  public readonly maxHp: number = 200

  private baseScaleX = 1
  private baseScaleY = 1

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'wand-ko')

    // Perspectiva baseada na posição Y — preserva proporção natural da imagem (paisagem)
    const frameH = this.height   // 768
    const t = Phaser.Math.Clamp((y - RING.top) / (RING.bottom - RING.top), 0, 1)
    const dispH = Phaser.Math.Linear(204, 420, t)
    this.baseScaleY = (dispH / frameH) * 0.877
    this.baseScaleX = this.baseScaleY  // sem achatamento — mesma escala nos dois eixos
    this.setScale(this.baseScaleX, this.baseScaleY)

    // Sombra/halo de perigo ao redor do Wand
    const radius = scene.add.circle(x, y, 68, 0xff0000, 0.10)
      .setDepth(y - 1)
    scene.tweens.add({
      targets: radius,
      alpha: 0.25,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    scene.add.existing(this as unknown as Phaser.GameObjects.GameObject)
    this.setDepth(y)

    this.createDizzyStars()
  }

  private createDizzyStars() {
    const headY   = this.y - this.displayHeight * 0.46 + 45  // topo da cabeça
    const orbitX  = 22   // raio horizontal da órbita
    const orbitY  = 8    // raio vertical (elipse de perspectiva)
    const count   = 5
    const depth   = this.depth + 1

    const stars = Array.from({ length: count }, (_) => {
      const star = this.scene.add.star(this.x, headY, 5, 3, 8, 0xffe500)
        .setDepth(depth)
      return star
    })

    let angle = 0
    this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        angle += 0.045
        stars.forEach((star, i) => {
          const a = angle + (i / count) * Math.PI * 2
          star.setPosition(
            this.x + 115 + Math.cos(a) * orbitX,
            headY       + Math.sin(a) * orbitY,
          )
          star.setAngle(star.angle + 4)  // gira no próprio eixo
          star.setDepth(depth)
        })
      },
    })
  }

  takeDamage(amount: number): boolean {
    this.hp = Math.max(0, this.hp - amount)

    // Flash branco ao levar dano
    this.setTint(0xffffff)
    this.scene.time.delayedCall(150, () => {
      if (this.active) this.setTint(0xffbbbb)
    })

    return this.hp === 0
  }

  update(_delta: number) {
    // sem animação
  }
}
