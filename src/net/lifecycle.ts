/**
 * lifecycle.ts — Pure state machine for app background/foreground lifecycle.
 *
 * Handles the iOS/Android pattern where WebSockets drop when the app backgrounds:
 *   - active → backgrounded: record timestamp, pause input sending
 *   - backgrounded → active (within window): resume input + trigger reconnect
 *   - backgrounded → active (window expired): leave to menu (graceful)
 *
 * PURE: no side effects beyond calling the injectable deps. No Capacitor imports here.
 * All state transitions return new objects (immutable — global coding rule).
 *
 * Wire-up to @capacitor/app is done separately in the scene layer, keeping
 * this module fully unit-testable without any browser or Capacitor shim.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type LifecycleStatus = 'active' | 'backgrounded'

export type LifecycleState =
  | { readonly status: 'active' }
  | { readonly status: 'backgrounded'; readonly backgroundedAt: number }

export interface LifecycleManagerDeps {
  /** Returns current monotonic time in ms (injectable for testing — use Date.now or performance.now in prod). */
  now: () => number
  /** Called when app backgrounds — stop sending inputs to the server. */
  onPauseInput: () => void
  /** Called when app foregrounds within the reconnect window — resume sending. */
  onResumeInput: () => void
  /** Called when app foregrounds within the reconnect window — trigger SDK reconnect. */
  requestReconnect: () => void
  /** Called when app foregrounds after the reconnect window expired — navigate back to menu. */
  leaveToMenu: () => void
  /**
   * Duration in ms within which a reconnection can succeed after backgrounding.
   * Should match the server's allowReconnection window (default 60_000 ms = 60s).
   */
  reconnectWindowMs?: number
}

export interface LifecycleManager {
  /** App went to background (appStateChange isActive=false). */
  onAppBackground(): void
  /** App came to foreground (appStateChange isActive=true). */
  onAppForeground(): void
  /** Returns a snapshot of the current state (immutable copy). */
  getState(): LifecycleState
  /** Cleanup — removes any internal listeners (no-op for pure machine, useful for subclasses/wrappers). */
  destroy(): void
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create a lifecycle manager (pure state machine with injectable deps).
 *
 * Usage:
 *   const mgr = createLifecycleManager({
 *     now: Date.now,
 *     onPauseInput: () => netClient.pauseSending(),
 *     onResumeInput: () => netClient.resumeSending(),
 *     requestReconnect: () => { /* SDK auto-retries via onDrop — no explicit call needed *\/ },
 *     leaveToMenu: () => scene.scene.start('TitleScene'),
 *     reconnectWindowMs: 60_000,
 *   })
 */
export function createLifecycleManager(deps: LifecycleManagerDeps): LifecycleManager {
  const windowMs = deps.reconnectWindowMs ?? 60_000

  // Immutable state stored internally; only exposed via snapshot copies.
  let state: LifecycleState = { status: 'active' }

  function getState(): LifecycleState {
    // Return a shallow copy so external code cannot mutate internal state.
    return { ...state } as LifecycleState
  }

  function onAppBackground(): void {
    // Idempotent: if already backgrounded, do nothing.
    if (state.status === 'backgrounded') return

    const backgroundedAt = deps.now()
    // Immutable transition: create a new state object.
    state = { status: 'backgrounded', backgroundedAt }
    deps.onPauseInput()
  }

  function onAppForeground(): void {
    // Idempotent: if already active, do nothing.
    if (state.status === 'active') return

    const backgroundedAt = (state as { status: 'backgrounded'; backgroundedAt: number }).backgroundedAt
    const elapsed = deps.now() - backgroundedAt

    // Immutable transition back to active.
    state = { status: 'active' }

    if (elapsed <= windowMs) {
      // Within window: resume and let SDK reconnect token do its work.
      deps.onResumeInput()
      deps.requestReconnect()
    } else {
      // Window expired: room slot was removed by the server — exit gracefully.
      deps.leaveToMenu()
    }
  }

  function destroy(): void {
    // Pure machine: nothing to clean up.
    // Subclasses / wrappers that register Capacitor listeners override this.
  }

  return { onAppBackground, onAppForeground, getState, destroy }
}
