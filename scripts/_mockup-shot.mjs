// Render a local HTML mockup to PNG (design calibration). Read-only utility.
// Run: node scripts/_mockup-shot.mjs <html-abs-path> <png-abs-path>
import { chromium } from 'playwright'

const [html, out] = process.argv.slice(2)
if (!html || !out) { console.error('usage: _mockup-shot.mjs <html> <out.png>'); process.exit(1) }

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
await p.goto('file://' + html)
await p.waitForTimeout(1200) // let webfonts load
await p.screenshot({ path: out })
await b.close()
console.log('wrote', out)
