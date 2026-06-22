import Phaser from 'phaser'
import { init as initI18n, t } from './i18n'
import { BootScene }                from './scenes/BootScene'
import { TitleScene }               from './scenes/TitleScene'
import { HowToPlayScene }           from './scenes/HowToPlayScene'
import { SelectScene }              from './scenes/SelectScene'
import { GameScene }                from './scenes/GameScene'
import { GameOverContinueScene }    from './scenes/GameOverContinueScene'
import { YouWinScene }              from './scenes/YouWinScene'
import { TopTenScene }              from './scenes/TopTenScene'
import { AnimTestScene }            from './scenes/AnimTestScene'
import { LobbyScene }               from './scenes/LobbyScene'
import { StyleGuideScene }          from './scenes/StyleGuideScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-wrap',
  width: 1920,
  height: 1080,
  backgroundColor: 'rgba(0,0,0,0)',
  transparent: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, HowToPlayScene, SelectScene, GameScene, GameOverContinueScene, YouWinScene, TopTenScene, AnimTestScene, LobbyScene, StyleGuideScene],
  physics: {
    default: 'arcade',
    arcade: { debug: false },
  },
}

// Resolve the active language once, before any scene renders: an explicit stored
// choice wins, otherwise it is detected from the browser (pt/es → those; else en).
initI18n()

// Localize the static boot DOM (rendered by index.html, outside Phaser): the "PLAY"
// gate and the rotate-device hint. Done once here, after the locale is resolved.
const playEl = document.getElementById('loader-play-text')
if (playEl) playEl.textContent = t('boot.play')
const rotateEl = document.querySelector('#rotate-msg p')
if (rotateEl) {
  // Build the (multi-line) hint via text nodes + <br> instead of innerHTML, so a
  // translation string can never inject markup (Codex #13, defense-in-depth).
  rotateEl.replaceChildren()
  t('boot.rotate').split('\n').forEach((line, i) => {
    if (i > 0) rotateEl.appendChild(document.createElement('br'))
    rotateEl.appendChild(document.createTextNode(line))
  })
}

document.fonts.load('16px "Press Start 2P"').then(() => {
  const game = new Phaser.Game(config)
  // Expose the game instance for E2E test harnesses (co-op net smoke). Harmless in
  // production; only a reference, no behavior change.
  ;(window as unknown as Record<string, unknown>).__game = game
  const refreshScale = () => {
    requestAnimationFrame(() => game.scale.refresh())
  }
  const scheduleRefresh = (delay = 0) => {
    window.setTimeout(refreshScale, delay)
  }

  // WKWebView/iOS-on-Mac demora a estabilizar o tamanho real da janela.
  ;[0, 80, 300, 800].forEach(scheduleRefresh)

  window.addEventListener('orientationchange', () => scheduleRefresh(300))
  window.addEventListener('resize', () => scheduleRefresh(80))
  window.visualViewport?.addEventListener('resize', () => scheduleRefresh(80))
  window.addEventListener('pageshow', () => scheduleRefresh(80))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleRefresh(80)
  })

  const wrap = document.getElementById('game-wrap')
  if (wrap && 'ResizeObserver' in window) {
    new ResizeObserver(() => refreshScale()).observe(wrap)
  }
})
