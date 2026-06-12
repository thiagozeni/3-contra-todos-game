/**
 * domCodeInput — DOM <input> overlay positioned over the canvas, used for the
 * "ENTRAR COM CÓDIGO" flow in LobbyScene.
 *
 * Why DOM? Canvas elements never receive focus on mobile, so the virtual
 * keyboard (soft keyboard) never appears for canvas-driven text fields.
 * A real <input> element gets focused and the OS keyboard pops immediately.
 *
 * Positioning pattern: same as domVideoBackground.ts — reads the canvas's
 * getBoundingClientRect and converts game-space coordinates into absolute
 * screen-space pixels so the element tracks the scaled canvas on resize.
 *
 * Pure helpers (filterChar, buildFilter) are exported separately so they can
 * be unit-tested without a DOM environment.
 */

export type DomCodeInputOptions = {
  /** Called when the user has entered a valid 4-letter code (already uppercased). */
  onSubmit: (code: string) => void
  /** Called when the user presses Escape. */
  onEscape: () => void
  /**
   * Game-space coordinates of the input box centre (in the 1920×1080 logical
   * canvas). The overlay converts these to screen pixels on every resize.
   */
  gameX: number
  gameY: number
  /** Width and height of the input box in game-space units. */
  gameW: number
  gameH: number
}

export type DomCodeInput = {
  /** The underlying <input> element. */
  readonly element: HTMLInputElement
  /** Force-focus the input (triggers virtual keyboard). */
  focus(): void
  /** Read the current uppercased value. */
  getValue(): string
  /** Remove the element and all event listeners from the DOM. */
  destroy(): void
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Returns `char.toUpperCase()` if it is an ASCII letter, otherwise `null`.
 * This is the filter applied to every `input` event and the `filterChar` test helper.
 */
export function filterChar(char: string): string | null {
  if (/^[a-zA-Z]$/.test(char)) return char.toUpperCase()
  return null
}

/**
 * Produces a 4-letter uppercased code string from raw input, stripping any
 * non-letter characters and truncating to 4 characters.
 */
export function buildFilter(raw: string): string {
  return raw
    .split('')
    .map(filterChar)
    .filter((c): c is string => c !== null)
    .slice(0, 4)
    .join('')
}

/**
 * Returns true when `code` is exactly 4 uppercase ASCII letters.
 * Used to decide whether typing 4 chars should auto-submit.
 */
export function isValidCode(code: string): boolean {
  return /^[A-Z]{4}$/.test(code)
}

// ── DOM overlay factory ───────────────────────────────────────────────────────

/**
 * Create, mount, and return a DOM <input> overlay that:
 *  - Floats above the Phaser canvas at the given game-space position.
 *  - Appears with the virtual keyboard already open (focus() is called).
 *  - Auto-uppercases and filters to A–Z only.
 *  - Submits on 4 chars OR Enter/Go, cancels on Escape.
 *  - Repositions itself whenever the canvas is resized or reflowed.
 *  - Cleans up completely when destroy() is called.
 */
export function createDomCodeInput(options: DomCodeInputOptions): DomCodeInput {
  const { onSubmit, onEscape, gameX, gameY, gameW, gameH } = options

  const wrap = document.getElementById('game-wrap') ?? document.body
  const input = document.createElement('input')
  const disposers: Array<() => void> = []
  let submitted = false

  // ── Attributes ──────────────────────────────────────────────────────────────
  input.type = 'text'
  input.maxLength = 4
  input.setAttribute('autocapitalize', 'characters')
  input.setAttribute('autocomplete', 'one-time-code')
  input.setAttribute('inputmode', 'text')
  input.setAttribute('spellcheck', 'false')
  input.setAttribute('autocorrect', 'off')
  input.setAttribute('data-testid', 'code-input-overlay')
  // Prevent zoom on iOS (font-size < 16px triggers zoom)
  // We use 20px minimum safe font here; visual size is via transform

  // ── Styles ───────────────────────────────────────────────────────────────────
  Object.assign(input.style, {
    position:        'absolute',
    boxSizing:       'border-box',
    background:      'rgba(26, 26, 46, 0.95)',
    border:          '4px solid #f3c204',
    borderRadius:    '4px',
    color:           '#f3c204',
    fontFamily:      '"Press Start 2P", monospace',
    // 20 px is the minimum to suppress iOS auto-zoom; visual size handled via
    // the game-space → screen-space scale applied in syncPosition().
    fontSize:        '20px',
    textAlign:       'center',
    letterSpacing:   '0.25em',
    outline:         'none',
    padding:         '0 8px',
    zIndex:          '100',
    // Disable browser touch callout / magnifier on long-press
    webkitUserSelect: 'text',
    touchAction:     'manipulation',
    // Ensure no text-shadow / native styling interferes
    textShadow:      'none',
    // Start hidden; syncPosition reveals it via 'display: block'
    display:         'none',
  } as CSSStyleDeclaration & Record<string, string>)

  // ── Position sync ──────────────────────────────────────────────────────────
  const syncPosition = () => {
    const canvas = wrap.querySelector('canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return

    const wrapRect   = wrap.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()

    // Scale factor: how many screen pixels per game-space unit
    const scaleX = canvasRect.width  / 1920
    const scaleY = canvasRect.height / 1080

    // Game-space dimensions → screen pixels
    const w = gameW * scaleX
    const h = gameH * scaleY

    // Game-space centre → screen pixel offset within wrap
    const cx = (canvasRect.left - wrapRect.left) + gameX * scaleX
    const cy = (canvasRect.top  - wrapRect.top)  + gameY * scaleY

    // Scale the font to match the canvas zoom level so letters fill the box.
    // Base font in the canvas: 64px at 1920-wide. We compute the equivalent
    // screen font size and set it directly — no CSS transform needed, which
    // keeps the hit-rect accurate.
    const fontSize = Math.round(64 * scaleY)

    Object.assign(input.style, {
      left:     `${cx - w / 2}px`,
      top:      `${cy - h / 2}px`,
      width:    `${w}px`,
      height:   `${h}px`,
      fontSize: `${Math.max(fontSize, 16)}px`,
      display:  'block',
      lineHeight: `${h}px`,
    })
  }

  // ── Input filtering ────────────────────────────────────────────────────────
  const handleInput = () => {
    // Preserve caret position relative to end so we can restore after rewrite.
    const filtered = buildFilter(input.value)
    input.value = filtered
    // Move caret to end
    const len = filtered.length
    try { input.setSelectionRange(len, len) } catch { /* noop */ }

    if (isValidCode(filtered) && !submitted) {
      submitted = true
      onSubmit(filtered)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Go') {
      e.preventDefault()
      const code = buildFilter(input.value)
      if (isValidCode(code) && !submitted) {
        submitted = true
        onSubmit(code)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onEscape()
    }
  }

  // ── Event wiring ───────────────────────────────────────────────────────────
  const addInputListener = <K extends keyof HTMLElementEventMap>(
    event: K,
    handler: (e: HTMLElementEventMap[K]) => void,
  ) => {
    input.addEventListener(event, handler as EventListener)
    disposers.push(() => input.removeEventListener(event, handler as EventListener))
  }

  const addWindowListener = (event: string, handler: () => void) => {
    window.addEventListener(event, handler)
    disposers.push(() => window.removeEventListener(event, handler))
  }

  addInputListener('input',   handleInput)
  addInputListener('keydown', handleKeyDown)

  // Reposition on every canvas resize (same events as domVideoBackground.ts)
  addWindowListener('resize', syncPosition)
  window.visualViewport?.addEventListener('resize', syncPosition)
  disposers.push(() => window.visualViewport?.removeEventListener('resize', syncPosition))

  let ro: ResizeObserver | null = null
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(syncPosition)
    ro.observe(wrap)
    disposers.push(() => ro?.disconnect())
  }

  // ── Mount ──────────────────────────────────────────────────────────────────
  wrap.appendChild(input)
  syncPosition()
  // Focus immediately — this is what triggers the virtual keyboard on mobile
  // (must happen inside a user-gesture call stack; LobbyScene calls this from
  // a pointerdown handler so the requirement is met).
  requestAnimationFrame(() => {
    input.focus()
    // On iOS some versions require a tiny delay for the keyboard to appear.
    setTimeout(() => { try { input.focus() } catch { /* noop */ } }, 50)
  })

  return {
    element: input,
    focus() { try { input.focus() } catch { /* noop */ } },
    getValue() { return buildFilter(input.value) },
    destroy() {
      disposers.forEach(d => { try { d() } catch { /* noop */ } })
      try { input.blur() } catch { /* noop */ }
      input.remove()
    },
  }
}
