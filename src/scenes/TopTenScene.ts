import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { getTopTen, ScoreEntry } from '../lib/leaderboard'
import { gameCenter } from '../systems/GameCenterBridge'
import { charDisplay } from '../core/charNames'
import { padInteractive } from '../utils/iosVideo'
import {
  dsText, makeListRow, makeBackButton, makeIconTile,
  primitive, semantic, hex, FAMILY,
} from '../ui/ds'
import { mountSceneBg } from '../ui/sceneBg'

// Column x-offsets from the row's left edge (x=100): rank,name,char,cont,time,score
const COLS: [number, number, number, number, number, number] = [0, 80, 540, 940, 1140, 1430]
const ROW_X = 100
const ROW_W = 1720

export class TopTenScene extends Phaser.Scene {
  private navigating = false

  constructor() {
    super({ key: 'TopTenScene' })
  }

  async create() {
    this.navigating = false
    const { width, height } = this.scale

    this.cameras.main.fadeIn(600, 0, 0, 0)

    // Fundo (camada DOM #scene-bg, cover responsivo até ultrawide)
    mountSceneBg(this, 'imgs/cenario/arena-premium-bg.png')
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.55).setDepth(1)

    // Reveal helper — entra cada bloco com fade + leve slide (cascata). Sprites
    // de iconTile (com halo/glow próprio) entram só por alpha, sem deslocar Y.
    const reveal = (objs: Array<Phaser.GameObjects.GameObject | undefined>, delay: number, dy = 16) => {
      objs.forEach((o) => {
        if (!o) return
        const go = o as Phaser.GameObjects.GameObject & { alpha?: number; y?: number; setAlpha?: (a: number) => void; __a?: number; __y?: number }
        go.__a = go.alpha ?? 1
        go.setAlpha?.(0)
        if (typeof go.y === 'number' && dy) { go.__y = go.y; go.y = go.y + dy }
      })
      objs.forEach((o) => {
        if (!o) return
        const go = o as Phaser.GameObjects.GameObject & { __a?: number; __y?: number; y?: number }
        this.tweens.add({ targets: go, alpha: go.__a ?? 1, y: go.__y ?? (go as { y?: number }).y, duration: 320, delay, ease: 'Back.Out' })
      })
    }
    // Reveal por janela da display-list (para blocos criados em loop, ex.: rows).
    const revealSince = (mark: number, delay: number) => {
      reveal(this.children.list.slice(mark) as Phaser.GameObjects.GameObject[], delay, 0)
    }

    // Botão VOLTAR — rollover animado (seta desliza + leve apoio); reaproveitado no Top 10.
    const backBtn = makeBackButton(this, {
      x: 64, y: 64, label: 'VOLTAR', role: 'h3', depth: 4,
      onClick: () => this.goToTitle(),
    })
    reveal([backBtn.container], 80)

    // Toggle Multiplataforma / Game Center (canto superior direito)
    // Em iOS mostra os dois botões, em Android/web só o ativo
    const toggleBtnStyle = {
      fontSize: '20px',
      fontFamily: FAMILY.display,
      stroke: hex(semantic.ink),
      strokeThickness: 4,
      padding: { x: 14, y: 8 },
    }
    const activeColors   = { color: hex(primitive.black), backgroundColor: hex(primitive.goldBrand) }
    const inactiveColors = { color: hex(semantic.textDisabled), backgroundColor: hex(primitive.panel) }

    const multiBtn = this.add.text(
      1860,
      60,
      'MULTIPLATAFORMA',
      { ...toggleBtnStyle, ...activeColors },
    ).setOrigin(1, 0.5).setDepth(3)
    padInteractive(multiBtn)

    if (gameCenter.isAvailable()) {
      multiBtn.setStyle({ ...toggleBtnStyle, ...activeColors })

      const gcBtn = this.add.text(
        multiBtn.x - multiBtn.width - 12,
        60,
        'GAME CENTER',
        { ...toggleBtnStyle, ...inactiveColors },
      ).setOrigin(1, 0.5).setDepth(3)

      // Hit area expandida — touch em iPad sofre com áreas apertadas
      const gcPad = 24
      gcBtn.setInteractive(
        new Phaser.Geom.Rectangle(-gcPad, -gcPad, gcBtn.width + gcPad * 2, gcBtn.height + gcPad * 2),
        Phaser.Geom.Rectangle.Contains,
      )
      gcBtn.input!.cursor = 'pointer'

      gcBtn.on('pointerdown', async () => {
        sound.select()
        try {
          let authed = await gameCenter.isAuthenticated()
          if (!authed) {
            authed = await gameCenter.signIn()
          }
          if (!authed) {
            this.showGcToast('FAÇA LOGIN NO GAME CENTER\nEM AJUSTES → GAME CENTER')
            return
          }
          await gameCenter.showLeaderboard()
        } catch (e: any) {
          console.warn('[GameCenter] tap falhou:', e)
          this.showGcToast(`GAME CENTER INDISPONÍVEL\n${e?.message ?? ''}`.trim())
        }
      })
    }

    // Título + estrelas premium (sprites ic-star com glow) ladeando, como no conceito.
    const title = dsText(this, 960, 70, 'TOP 10', { role: 'title', color: 'textBrand', origin: [0.5, 0] }).setDepth(2)
    const titleCY = 70 + title.height / 2   // centro vertical do título — estrelas alinham aqui
    // Brilho em loop: cópia em ADD pulsando atrás do título (shimmer dourado).
    const titleGlow = dsText(this, 960, 70, 'TOP 10', { role: 'title', color: 'textBrand', origin: [0.5, 0] })
      .setDepth(1.9).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0)
    this.tweens.add({ targets: titleGlow, alpha: 0.45, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    const starGap = title.width / 2 + 46
    const stars = [960 - starGap, 960 + starGap].map((sx) =>
      this.textures.exists('ic-star')
        ? makeIconTile(this, { x: sx, y: titleCY, texture: 'ic-star', size: 44, depth: 2, glow: true })
        : null,
    )
    reveal([title], 120)
    stars.forEach((s, i) => {
      if (!s) return
      s.sprite.setAlpha(0)
      this.tweens.add({ targets: s.sprite, alpha: 1, duration: 320, delay: 220 + i * 90, ease: 'Quad.Out' })
    })

    // Cabeçalho colunas + divisória — entram juntos após o título.
    const headerMark = this.children.list.length
    const header = (cx: number, label: string) =>
      dsText(this, ROW_X + cx, 195, label, { role: 'small', color: 'textSecondary' }).setDepth(2)
    header(COLS[0], '#')
    header(COLS[1], 'NOME')
    header(COLS[2], 'PERSONAGEM')
    header(COLS[3], 'CONT.')
    header(COLS[4], 'TEMPO')
    header(COLS[5], 'SCORE')
    this.add.rectangle(960, 230, ROW_W, 2, primitive.goldBrand, 0.5).setDepth(2)
    revealSince(headerMark, 360)

    // Entrada recém salva (para destacar)
    const lastName      = this.registry.get('lastEntryName')      as string | undefined
    const lastContinues = this.registry.get('lastEntryContinues') as number | undefined
    const lastTime      = this.registry.get('lastEntryTime')      as number | undefined
    const lastScore     = this.registry.get('lastEntryScore')     as number | undefined

    // Carrega dados
    let rows: ScoreEntry[] = []
    try {
      rows = await getTopTen()
    } catch {
      dsText(this, 960, 540, 'ERRO AO CARREGAR\nRANKING', {
        role: 'h3', color: 'hpLow', align: 'center', origin: [0.5, 0.5],
      }).setDepth(2)
    }

    rows.forEach((entry, i) => {
      const y = 283 + i * 72
      const rowMark = this.children.list.length

      // Destaca se for a entrada recém inserida
      const isNew = lastName !== undefined
        && entry.player_name === lastName
        && entry.continues   === lastContinues
        && entry.time_ms     === lastTime
        && entry.score       === lastScore

      // Pódio: sprites de medalha (ouro/prata/bronze) nas 3 primeiras; número nas demais.
      const medalKey = i === 0 ? 'ic-medal-gold' : i === 1 ? 'ic-medal-silver' : i === 2 ? 'ic-medal-bronze' : null
      const medal = medalKey ? '' : `${i + 1}.`
      const mm = String(Math.floor(entry.time_ms / 60000)).padStart(2, '0')
      const ss = String(Math.floor((entry.time_ms % 60000) / 1000)).padStart(2, '0')
      const charKey = entry.character ?? 'werdum'
      const charName = charDisplay(charKey)

      // Zebra striping (linhas pares com leve realce) — só quando não é a destacada.
      if (!isNew && i % 2 === 1) {
        this.add.rectangle(960, y, ROW_W, 64, primitive.steel, 0.10).setDepth(1.5)
      }

      // character vazio no row — o avatar + nome são desenhados manualmente abaixo.
      makeListRow(this, {
        x: ROW_X, y, w: ROW_W, cols: COLS, highlight: isNew, depth: 2,
        data: {
          rank: medal,
          name: entry.player_name,
          character: '',
          continues: String(entry.continues),
          time: `${mm}:${ss}`,
          score: entry.score.toLocaleString(),
        },
      })

      // Medalha (sprite) na coluna # para o pódio — pulse no 1º lugar (ouro).
      if (medalKey && this.textures.exists(medalKey)) {
        const m = makeIconTile(this, { x: ROW_X + COLS[0] + 22, y, texture: medalKey, size: 54, depth: 3, glow: i === 0 })
        if (i === 0) this.time.delayedCall(400 + i * 120, () => m.pulse())
      }

      // Avatar do personagem (retrato do HUD) + nome ao lado, na coluna PERSONAGEM.
      const avatarKey = `hud-${charKey}`
      const charX = ROW_X + COLS[2]
      if (this.textures.exists(avatarKey)) {
        this.add.image(charX + 22, y, avatarKey).setDisplaySize(46, 46).setDepth(3)
          .setOrigin(0.5, 0.5)
      }
      dsText(this, charX + 54, y, charName, {
        role: 'body', color: isNew ? 'textBrand' : 'textPrimary', origin: [0, 0.5],
      }).setDepth(3)

      revealSince(rowMark, 480 + i * 70)
    })

    if (rows.length === 0) {
      dsText(this, 960, 540, 'NENHUMA PONTUAÇÃO\nAINDA', {
        role: 'h3', color: 'textDisabled', align: 'center', origin: [0.5, 0.5],
      }).setDepth(2)
    }

    // Linha inferior + PRESS START — fecham a cascata.
    const footMark = this.children.list.length
    this.add.rectangle(960, 1010, ROW_W, 2, primitive.goldBrand, 0.5).setDepth(2)
    const startText = dsText(this, 960, 1048, 'PRESS START', {
      role: 'h3', color: 'textBrand', origin: [0.5, 0.5],
    }).setDepth(2)
    padInteractive(startText)
    const footDelay = 520 + rows.length * 70
    revealSince(footMark, footDelay)

    // Blink só começa depois da entrada (senão briga com o reveal pelo alpha).
    this.time.delayedCall(footDelay + 360, () => {
      this.tweens.add({
        targets: startText, alpha: 0.2, duration: 600,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    })

    startText.on('pointerdown', () => this.goToTitle())

    this.time.delayedCall(800, () => {
      this.input.keyboard!.off('keydown-SPACE')
      this.input.keyboard!.off('keydown-ENTER')
      this.input.keyboard!.off('keydown-ESCAPE')
      this.input.keyboard!.on('keydown-SPACE',  () => this.goToTitle())
      this.input.keyboard!.on('keydown-ENTER',  () => this.goToTitle())
      this.input.keyboard!.on('keydown-ESCAPE', () => this.goToTitle())
    })
  }

  private showGcToast(message: string) {
    const toast = dsText(this, 960, 990, message, {
      role: 'small', color: 'textPrimary', align: 'center', origin: [0.5, 0.5],
    }).setDepth(10).setAlpha(0)
    toast.setStyle({ backgroundColor: hex(primitive.red), padding: { x: 18, y: 12 } })

    this.tweens.add({
      targets: toast,
      alpha: 1,
      duration: 200,
      yoyo: false,
      hold: 3000,
      onComplete: () => {
        this.tweens.add({
          targets: toast,
          alpha: 0,
          duration: 400,
          delay: 3000,
          onComplete: () => toast.destroy(),
        })
      },
    })
  }

  private goToTitle() {
    if (this.navigating) return
    this.navigating = true
    sound.select()
    this.registry.remove('lastEntryName')
    this.registry.remove('lastEntryContinues')
    this.registry.remove('lastEntryTime')
    this.registry.remove('lastEntryScore')
    this.cameras.main.fadeOut(400, 0, 0, 0)
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('TitleScene'))
  }
}
