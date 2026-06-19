import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/loop-shots', { recursive: true })
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await chromium.launch()
const p=await (await b.newContext({viewport:{width:1920,height:1080}})).newPage()
await p.goto('https://werdumfight.com/v2/')
await p.waitForFunction(()=>!!window.__game,null,{timeout:40000})
await p.evaluate(()=>{const o=document.getElementById('loader-overlay');if(o)o.style.display='none'})
await p.evaluate(()=>{const g=window.__game;g.scene.getScenes(true).forEach(s=>{if(s.scene.key!=='BootScene')g.scene.stop(s.scene.key)});g.scene.start('TitleScene')})
await sleep(2000)
await p.screenshot({path:'/tmp/loop-shots/home-live.png'})
// localiza o item CO-OP e croppa o ícone
console.log('done')
await b.close()
