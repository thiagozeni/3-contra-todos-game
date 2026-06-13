// Screenshot a static DS preview HTML (full page). Read-only.
// Run: node scripts/_ds-shot.mjs <html-name> [out-name]
import { chromium } from 'playwright'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MOCK = join(__dirname, '..', 'docs', 'fatia-v', 'mockups')
const inFile = process.argv[2] || 'ds-foundation.html'
const out = process.argv[3] || inFile.replace(/\.html$/, '.png')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await chromium.launch()
const page = await (await b.newContext({ viewport: { width: 1240, height: 900 }, deviceScaleFactor: 2 })).newPage()
await page.goto(pathToFileURL(join(MOCK, inFile)).href)
await page.evaluate(async () => { if (document.fonts) await document.fonts.ready })
await sleep(1200)
await page.screenshot({ path: join(MOCK, out), fullPage: true })
console.log('wrote docs/fatia-v/mockups/' + out)
await b.close()
