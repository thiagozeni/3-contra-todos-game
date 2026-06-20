/**
 * WebAdSenseService.ts — AdService REAL para o WEB, via Google AdSense
 * "H5 Games Ads" (Ad Placement API). É o equivalente web do AdMobService:
 * roda no navegador (werdumfight.com), enquanto o AdMob só roda no app nativo.
 *
 * Diferença vs AdMob: a H5 Games Ads NÃO usa ad unit IDs por placement — só o
 * CLIENT ID da conta AdSense (ca-pub-...). Os placements são nomeados no código
 * (`name`), e o AdSense gerencia o preenchimento. Test mode (data-adbreak-test=on)
 * mostra um anúncio de teste antes da aprovação do site.
 *
 * Contrato igual ao AdService:
 *  - showRewarded: {granted:true} se o usuário viu até o fim (adViewed),
 *    {granted:false} se dispensou / não havia ad (adDismissed / breakStatus≠viewed).
 *  - showInterstitial: resolve void quando o adBreak termina.
 *  - init injeta o script adsbygoogle uma vez. Never throws.
 *
 * Ref: https://developers.google.com/ad-placement
 */

import type { AdService, RewardResult } from './AdService'

interface AdBreakPlacement {
  type: 'start' | 'pause' | 'next' | 'browse' | 'reward'
  name: string
  beforeReward?: (showAdFn: () => void) => void
  adViewed?: () => void
  adDismissed?: () => void
  adBreakDone?: (info: { breakStatus?: string }) => void
}

type AdsByGoogle = Array<Record<string, unknown> | AdBreakPlacement>

const SCRIPT_ID = 'adsense-h5'
const REWARD_TIMEOUT_MS = 30_000
const INTERSTITIAL_TIMEOUT_MS = 15_000

export class WebAdSenseService implements AdService {
  private initialized = false

  constructor(private readonly client: string, private readonly test: boolean) {}

  private queue(): AdsByGoogle {
    const w = window as unknown as { adsbygoogle?: AdsByGoogle }
    w.adsbygoogle = w.adsbygoogle ?? []
    return w.adsbygoogle
  }

  async init(): Promise<void> {
    if (typeof document === 'undefined' || this.initialized) return
    this.initialized = true
    try {
      if (!document.getElementById(SCRIPT_ID)) {
        const s = document.createElement('script')
        s.id = SCRIPT_ID
        s.async = true
        s.crossOrigin = 'anonymous'
        s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${this.client}`
        // Test mode: anúncio de teste sem aprovação do site (remover na produção).
        if (this.test) s.setAttribute('data-adbreak-test', 'on')
        document.head.appendChild(s)
      }
      // adConfig — pré-carrega os ad breaks (a API lê do mesmo array).
      this.queue().push({ preloadAdBreaks: 'on', sound: 'on' })
    } catch (err) {
      console.warn('[WebAdSense] init failed (non-fatal):', err)
    }
  }

  async prepareRewarded(): Promise<void> {
    // preloadAdBreaks:'on' já cuida do preload; nada a fazer.
  }

  async showRewarded(): Promise<RewardResult> {
    if (typeof window === 'undefined') return { granted: false }
    return new Promise<RewardResult>((resolve) => {
      let granted = false
      let settled = false
      const done = (g: boolean) => { if (settled) return; settled = true; resolve({ granted: g }) }
      try {
        this.queue().push({
          type: 'reward',
          name: 'continue',
          // O jogador JÁ confirmou ("ver propaganda"), então mostramos na hora.
          beforeReward: (showAdFn: () => void) => { showAdFn() },
          adViewed: () => { granted = true },
          adDismissed: () => { granted = false },
          adBreakDone: () => done(granted),
        })
      } catch (err) {
        console.warn('[WebAdSense] showRewarded failed (non-fatal):', err)
        done(false)
        return
      }
      // Rede de segurança: se a API nunca chamar adBreakDone, não trava o jogo.
      window.setTimeout(() => done(granted), REWARD_TIMEOUT_MS)
    })
  }

  async prepareInterstitial(): Promise<void> {
    // preloadAdBreaks:'on' já cuida.
  }

  async showInterstitial(): Promise<void> {
    if (typeof window === 'undefined') return
    return new Promise<void>((resolve) => {
      let settled = false
      const done = () => { if (settled) return; settled = true; resolve() }
      try {
        this.queue().push({ type: 'next', name: 'between-matches', adBreakDone: () => done() })
      } catch (err) {
        console.warn('[WebAdSense] showInterstitial failed (non-fatal):', err)
        done()
        return
      }
      window.setTimeout(done, INTERSTITIAL_TIMEOUT_MS)
    })
  }
}
