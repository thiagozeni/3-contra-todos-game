import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/loop-shots', { recursive: true })
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await chromium.launch()
const p=await (await b.newContext({viewport:{width:1920,height:1080}})).newPage()
await p.goto('http://localhost:3000/')
await p.waitForFunction(()=>!!window.__game,null,{timeout:30000})
await p.waitForFunction(()=>{const g=window.__game;return g.textures.exists('thor-perfil')},null,{timeout:30000})
await p.evaluate(()=>{const o=document.getElementById('loader-overlay');if(o)o.style.display='none'})
await p.evaluate(()=>{const g=window.__game;g.scene.getScenes(true).forEach(s=>{if(s.scene.key!=='BootScene')g.scene.stop(s.scene.key)});g.scene.start('SelectScene')})
await sleep(1200)
await p.evaluate(()=>{const sc=window.__game.scene.getScene('SelectScene'); sc.selectChar(2)}) // THOR
await sleep(500)
await p.screenshot({path:'/tmp/loop-shots/select-thor.png'})
console.log('done')
await b.close()
