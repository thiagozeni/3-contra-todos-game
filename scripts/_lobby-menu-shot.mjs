import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/loop-shots', { recursive: true })
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await chromium.launch()
const page=await (await b.newContext({viewport:{width:1920,height:1080}})).newPage()
const errs=[]; page.on('pageerror',e=>errs.push(e.message))
const url=process.argv[2]||'http://localhost:3100/'
await page.goto(url)
await page.waitForFunction(()=>!!window.__game,null,{timeout:30000})
await page.evaluate(()=>{const o=document.getElementById('loader-overlay');if(o){o.style.display='none'}})
await page.evaluate(()=>{const g=window.__game;g.scene.getScenes(true).forEach(s=>{if(s.scene.key!=='BootScene')g.scene.stop(s.scene.key)});g.scene.start('LobbyScene')})
await sleep(1500)
await page.screenshot({path:'/tmp/loop-shots/lobby-menu.png'})
console.log(errs.length?'ERR: '+errs.join(' | '):'no errors')
await b.close()
