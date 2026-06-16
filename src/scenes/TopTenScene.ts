import Phaser from 'phaser'
import { sound } from '../systems/SoundManager'
import { getTopTen, ScoreEntry } from '../lib/leaderboard'
import { gameCenter } from '../systems/GameCenterBridge'
import { charDisplay } from '../core/charNames'
import { padInteractive } from '../utils/iosVideo'
import {
  dsText, makeListRow, makeMenuButton,
  primitive, semantic, hex, FAMILY,
} from '../ui/ds'

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

    // Fundo
    this.add.image(width / 2, height / 2, 'select-player-bg').setDisplaySize(width, height).setDepth(0)
    this.add.rectangle(width / 2, height / 2, width, height, primitive.black, 0.55).setDepth(1)

    // Botão VOLTAR (link do DS)
    makeMenuButton(this, {
      x: 60, y: 60, label: '< VOLTAR', variant: 'link', role: 'h3', depth: 2,
      onClick: () => this.goToTitle(),
    })

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

    // Título
    dsText(this, 960, 70, 'TOP 10', { role: 'title', color: 'textBrand', origin: [0.5, 0] }).setDepth(2)

    // Cabeçalho colunas
    const header = (cx: number, label: string) =>
      dsText(this, ROW_X + cx, 195, label, { role: 'small', color: 'textSecondary' }).setDepth(2)
    header(COLS[0], '#')
    header(COLS[1], 'NOME')
    header(COLS[2], 'PERSONAGEM')
    header(COLS[3], 'CONT.')
    header(COLS[4], 'TEMPO')
    header(COLS[5], 'SCORE')

    // Linha divisória
    this.add.rectangle(960, 230, ROW_W, 2, primitive.goldBrand, 0.5).setDepth(2)

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

      // Destaca se for a entrada recém inserida
      const isNew = lastName !== undefined
        && entry.player_name === lastName
        && entry.continues   === lastContinues
        && entry.time_ms     === lastTime
        && entry.score       === lastScore

      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const mm = String(Math.floor(entry.time_ms / 60000)).padStart(2, '0')
      const ss = String(Math.floor((entry.time_ms % 60000) / 1000)).padStart(2, '0')
      const charName = charDisplay(entry.character ?? 'werdum')

      makeListRow(this, {
        x: ROW_X, y, w: ROW_W, cols: COLS, highlight: isNew, depth: 2,
        data: {
          rank: medal,
          name: entry.player_name,
          character: charName,
          continues: String(entry.continues),
          time: `${mm}:${ss}`,
          score: entry.score.toLocaleString(),
        },
      })
    })

    if (rows.length === 0) {
      dsText(this, 960, 540, 'NENHUMA PONTUAÇÃO\nAINDA', {
        role: 'h3', color: 'textDisabled', align: 'center', origin: [0.5, 0.5],
      }).setDepth(2)
    }

    // Linha inferior
    this.add.rectangle(960, 1010, ROW_W, 2, primitive.goldBrand, 0.5).setDepth(2)

    // PRESS START (pisca)
    const startText = dsText(this, 960, 1048, 'PRESS START', {
      role: 'h3', color: 'textBrand', origin: [0.5, 0.5],
    }).setDepth(2)
    padInteractive(startText)

    this.tweens.add({
      targets: startText, alpha: 0.2, duration: 600,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
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
