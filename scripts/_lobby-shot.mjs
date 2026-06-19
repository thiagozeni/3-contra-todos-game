import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/loop-shots', { recursive: true })
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const b=await chromium.launch()
const page=await (await b.newContext({viewport:{width:1920,height:1080}})).newPage()
const errs=[]; page.on('pageerror',e=>errs.push(e.message))
await page.goto('http://localhost:3000/')
await page.waitForFunction(()=>!!window.__game,null,{timeout:30000})
await page.waitForFunction(()=>{const g=window.__game;return g.textures.exists('wand-perfil')},null,{timeout:30000})
await page.evaluate(()=>{const o=document.getElementById('loader-overlay');if(o){o.style.display='none'}})
await page.evaluate(()=>{const g=window.__game;g.scene.getScenes(true).forEach(s=>{if(s.scene.key!=='BootScene')g.scene.stop(s.scene.key)});g.scene.start('LobbyScene')})
await sleep(1200)
await page.evaluate(()=>{
  const g=window.__game; const sc=g.scene.getScene('LobbyScene')
  sc.showLobbyUI('OHBZ', true)
  sc.selector.render({ players:[
    {sessionId:'a',slotIndex:0,selectedChar:'werdum',confirmed:true,connected:true,name:'P1'},
    {sessionId:'b',slotIndex:1,selectedChar:'dida',confirmed:false,connected:true,name:'P2'},
  ], mySessionId:'a' })
})
await sleep(600)
await page.screenshot({path:'/tmp/loop-shots/lobby-hosting.png'})
console.log(errs.length?'ERR: '+errs.join(' | '):'no errors')
await b.close()
