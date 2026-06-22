/**
 * WebAdOverlay.ts — DOM overlay that simulates a rewarded / interstitial ad on
 * the web build. There is no real ad network on web (the monetized surface is
 * the native app via AdMob); this overlay lets QA and the beta experience the
 * REAL continue / host-unlock UX flow instead of the silent instant-grant Noop.
 *
 * It is intentionally framed as a SIMULATION (visible "simulação" tag) and is
 * only wired in when VITE_WEB_AD_SIM=true (see buildFlavor.WEB_AD_SIM). Default
 * web stays on NoopAdService so production web players get zero ad friction.
 *
 * Pure DOM, no Phaser dependency — it floats above the game canvas and the DOM
 * video layers, so it works regardless of which scene is active. The controller
 * is injectable (WebAdOverlayLike) so WebAdService is unit-testable without DOM.
 */

import { t } from '../../i18n'

export interface RewardedOverlayOpts {
  /** Seconds the user must "watch" before the reward unlocks. Default 5. */
  durationSec?: number
  /** Headline copy shown under the creative. */
  rewardLabel?: string
}

export interface InterstitialOverlayOpts {
  /** Seconds before the interstitial auto-closes. Default 5. */
  durationSec?: number
  /** Seconds before the skip (×) becomes available. Default 2. */
  skipAfterSec?: number
}

/** Minimal surface WebAdService depends on — mockable in tests. */
export interface WebAdOverlayLike {
  /** Resolves true if the user watched to the reward, false if dismissed early. */
  showRewarded(opts?: RewardedOverlayOpts): Promise<boolean>
  /** Resolves once the interstitial is closed (auto or skipped). */
  showInterstitial(opts?: InterstitialOverlayOpts): Promise<void>
}

const STYLE_ID = 'wf-adsim-style'
const ROOT_ID = 'wf-adsim-root'

const CSS = `
#${ROOT_ID}{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;
 justify-content:center;background:rgba(4,6,10,.86);backdrop-filter:blur(2px);
 font-family:'Press Start 2P','Pixelify Sans',system-ui,sans-serif;
 -webkit-font-smoothing:none;animation:wfAdIn .18s ease-out}
@keyframes wfAdIn{from{opacity:0}to{opacity:1}}
.wf-ad-card{position:relative;width:min(92vw,440px);background:#10141c;
 border:3px solid #c8a24a;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.6),
 0 0 0 4px #05070b;padding:16px 16px 18px;color:#e8edf6}
.wf-ad-head{display:flex;justify-content:space-between;align-items:center;
 font-size:9px;letter-spacing:.5px;color:#8a93a6;text-transform:uppercase;margin-bottom:10px}
.wf-ad-tag{color:#c8a24a;border:1px solid #c8a24a;border-radius:6px;padding:3px 6px;font-size:8px}
.wf-ad-chip{min-width:30px;height:30px;border-radius:50%;background:#05070b;
 border:2px solid #c8a24a;display:flex;align-items:center;justify-content:center;
 font-size:11px;color:#f3d27a;padding:0 4px}
.wf-ad-creative{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;
 background:radial-gradient(120% 120% at 30% 10%,#243044 0,#161b25 60%,#0a0d13 100%);
 display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;
 border:1px solid #2a3344}
.wf-ad-logo{font-size:20px;color:#f3d27a;text-shadow:2px 2px 0 #7a1f1f;letter-spacing:1px;text-align:center;line-height:1.4}
.wf-ad-sub{font-size:8px;color:#aeb7c6;letter-spacing:.5px}
.wf-ad-cta{margin-top:2px;font-size:9px;color:#10141c;background:#c8a24a;
 border-radius:8px;padding:8px 14px;font-weight:bold}
.wf-ad-bar{height:8px;background:#05070b;border-radius:6px;margin:12px 0 10px;overflow:hidden;border:1px solid #2a3344}
.wf-ad-bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#c8a24a,#f3d27a);transition:width .25s linear}
.wf-ad-status{font-size:9px;color:#aeb7c6;text-align:center;min-height:14px;line-height:1.5}
.wf-ad-actions{display:flex;justify-content:center;margin-top:12px;min-height:40px;align-items:center}
.wf-ad-btn{font-family:inherit;cursor:pointer;font-size:10px;color:#10141c;
 background:#c8a24a;border:none;border-radius:9px;padding:11px 22px;letter-spacing:.5px}
.wf-ad-btn:hover{background:#f3d27a}
.wf-ad-x{position:absolute;top:-12px;right:-12px;width:30px;height:30px;border-radius:50%;
 background:#05070b;border:2px solid #6b7384;color:#cfd6e2;font-size:13px;cursor:pointer;
 display:flex;align-items:center;justify-content:center;line-height:1}
.wf-ad-x:hover{border-color:#c8a24a;color:#f3d27a}
.wf-ad-reward{color:#7ad17a !important}
`

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const el = document.createElement('style')
  el.id = STYLE_ID
  el.textContent = CSS
  document.head.appendChild(el)
}

interface RunHandles {
  root: HTMLDivElement
  cleanup: () => void
}

/** Builds the shared card scaffold; returns the live element refs. */
function buildCard(opts: {
  tag: string
  logo: string
  sub: string
  cta: string
}): {
  root: HTMLDivElement
  chip: HTMLDivElement
  bar: HTMLElement
  status: HTMLDivElement
  actions: HTMLDivElement
  closeBtn: HTMLDivElement
} {
  ensureStyle()
  const root = document.createElement('div')
  root.id = ROOT_ID
  root.innerHTML = `
    <div class="wf-ad-card" role="dialog" aria-label="${t('ad.interstitialStatus')}">
      <div class="wf-ad-x" title="${t('ad.close')}">×</div>
      <div class="wf-ad-head">
        <span>${t('ad.advertising')}</span>
        <span class="wf-ad-tag">${opts.tag}</span>
        <span class="wf-ad-chip">0</span>
      </div>
      <div class="wf-ad-creative">
        <div class="wf-ad-logo">${opts.logo}</div>
        <div class="wf-ad-sub">${opts.sub}</div>
        <div class="wf-ad-cta">${opts.cta}</div>
      </div>
      <div class="wf-ad-bar"><i></i></div>
      <div class="wf-ad-status"></div>
      <div class="wf-ad-actions"></div>
    </div>`
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T
  return {
    root,
    chip: q<HTMLDivElement>('.wf-ad-chip'),
    bar: q<HTMLElement>('.wf-ad-bar > i'),
    status: q<HTMLDivElement>('.wf-ad-status'),
    actions: q<HTMLDivElement>('.wf-ad-actions'),
    closeBtn: q<HTMLDivElement>('.wf-ad-x'),
  }
}

class DomWebAdOverlay implements WebAdOverlayLike {
  private active: RunHandles | null = null

  private teardown(): void {
    if (!this.active) return
    this.active.cleanup()
    this.active.root.remove()
    this.active = null
  }

  showRewarded(opts: RewardedOverlayOpts = {}): Promise<boolean> {
    if (typeof document === 'undefined') return Promise.resolve(true)
    this.teardown()
    const total = Math.max(1, Math.round(opts.durationSec ?? 5))
    const rewardLabel = opts.rewardLabel ?? t('ad.rewardPrompt')

    const ui = buildCard({
      tag: t('ad.simulation'),
      logo: 'WERDUM<br>FIGHT',
      sub: 'STREETS OF FORTALEZA',
      cta: t('ad.playNow'),
    })
    ui.status.textContent = rewardLabel

    return new Promise<boolean>((resolve) => {
      let remaining = total
      let rewarded = false
      const tick = () => {
        remaining -= 1
        const elapsed = total - remaining
        ui.chip.textContent = rewarded ? '✓' : String(Math.max(remaining, 0))
        ui.bar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`
        if (remaining <= 0 && !rewarded) {
          rewarded = true
          ui.chip.textContent = '✓'
          ui.chip.classList.add('wf-ad-reward')
          // Build the reward badge via DOM (textContent) instead of innerHTML
          // so the i18n string can't inject markup (Codex #13, defense-in-depth).
          ui.status.replaceChildren()
          const badge = document.createElement('span')
          badge.className = 'wf-ad-reward'
          badge.textContent = t('ad.rewardUnlocked')
          ui.status.appendChild(badge)
          const btn = document.createElement('button')
          btn.className = 'wf-ad-btn'
          btn.textContent = t('common.continue')
          btn.onclick = () => finish(true)
          ui.actions.appendChild(btn)
        }
      }
      const timer = window.setInterval(tick, 1000)

      const finish = (granted: boolean) => {
        this.teardown()
        resolve(granted)
      }
      // Early × → dismissed (no reward). After reward, × also continues.
      ui.closeBtn.onclick = () => finish(rewarded)

      this.active = { root: ui.root, cleanup: () => window.clearInterval(timer) }
      document.body.appendChild(ui.root)
    })
  }

  showInterstitial(opts: InterstitialOverlayOpts = {}): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve()
    this.teardown()
    const total = Math.max(1, Math.round(opts.durationSec ?? 5))
    const skipAfter = Math.max(0, Math.round(opts.skipAfterSec ?? 2))

    const ui = buildCard({
      tag: t('ad.simulation'),
      logo: 'WERDUM<br>FIGHT',
      sub: t('ad.tagInterstitial'),
      cta: t('ad.downloadFree'),
    })
    ui.closeBtn.style.display = 'none'
    ui.status.textContent = t('ad.interstitialStatus')

    return new Promise<void>((resolve) => {
      let remaining = total
      const tick = () => {
        remaining -= 1
        const elapsed = total - remaining
        ui.chip.textContent = String(Math.max(remaining, 0))
        ui.bar.style.width = `${Math.min(100, (elapsed / total) * 100)}%`
        if (total - remaining >= skipAfter) ui.closeBtn.style.display = ''
        if (remaining <= 0) finish()
      }
      const timer = window.setInterval(tick, 1000)
      const finish = () => {
        this.teardown()
        resolve()
      }
      ui.closeBtn.onclick = () => finish()
      this.active = { root: ui.root, cleanup: () => window.clearInterval(timer) }
      document.body.appendChild(ui.root)
    })
  }
}

/** Factory — returns a DOM-backed overlay (safe no-op surface if document is absent). */
export function createWebAdOverlay(): WebAdOverlayLike {
  return new DomWebAdOverlay()
}
