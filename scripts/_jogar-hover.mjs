import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/loop-shots', { recursive: true })
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await chromium.launch()
const page=await (await b.newContext({viewport:{width:1280,height:720}})).newPage()
await page.goto('http://localhost:3000/')
await sleep(2500)
// Força o estado "pronto" (JOGAR visível) sem esperar o boot completo.
await page.evaluate(()=>{
  const prog=document.getElementById('loader-progress'); if(prog)prog.style.display='none'
  const play=document.getElementById('loader-play'); if(play)play.style.display='flex'
})
await sleep(400)
await page.screenshot({path:'/tmp/loop-shots/jogar-idle.png'})
const el=await page.$('#loader-play-text')
const box=await el.boundingBox()
await page.mouse.move(box.x+box.width/2, box.y+box.height/2)
await sleep(400)
await page.screenshot({path:'/tmp/loop-shots/jogar-hover.png'})
console.log('done')
await b.close()
