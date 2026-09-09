// Regression: a canvas existing is insufficient; fire must contain visible animated
// flame pixels even when WebGL cannot initialise. Exercise the real page lifecycle.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import puppeteer from '../cv/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { serve } from './serve.mjs';
const server = await serve(8139);
let browser;
try {
  browser = await puppeteer.launch({args:['--no-sandbox','--use-angle=gl']});
  const page = await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.evaluateOnNewDocument(()=>{
    const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(type,...args){
      return /webgl/.test(type) ? null : original.call(this,type,...args);
    };
  });
  await page.setViewport({width:1440,height:900});
  await page.goto('http://localhost:8139',{waitUntil:'networkidle0'});
  await page.waitForSelector('html[data-ready="true"]');
  await mkdir(new URL('../lab/effects/',import.meta.url),{recursive:true});
  const pause=()=>new Promise(r=>setTimeout(r,650));
  const visit=async act=>{
    await page.$eval(`[data-act="${act}"]`,el=>el.scrollIntoView({behavior:'instant',block:'center'}));
    await pause();
  };
  const flame=()=>page.$eval('.plate .section-effect',c=>{
    const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let lit=0,hash=0;
    for(let i=0;i<pixels.length;i+=4){
      // Exclude the dim orange fallback glow. Require opaque luminous flame.
      if(pixels[i]>190 && pixels[i+1]>90 && pixels[i+3]>140) lit++;
      hash=(hash+pixels[i+1]*(i%97))%1000000007;
    }
    return {coverage:lit/(c.width*c.height),hash};
  });
  await visit(13);
  const first=await flame();assert(first.coverage>.05,`Flame invisible: ${JSON.stringify(first)}`);
  await pause();assert.notEqual((await flame()).hash,first.hash,'Fire does not animate');
  await page.screenshot({path:new URL('../lab/effects/kitchen.png',import.meta.url).pathname});
  await visit(5);await page.hover('.stack__row:nth-child(2)');await pause();
  assert(await page.$('.stack__row:nth-child(2).is-charged'));
  const arcs=await page.$eval('.section-effect--lightning',c=>{
    const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;
    for(let i=0;i<p.length;i+=4)if(p[i+2]>180&&p[i+3]>120)n++;
    return n;
  });assert(arcs>300,`Lightning too faint: ${arcs}`);
  await page.screenshot({path:new URL('../lab/effects/stack.png',import.meta.url).pathname});
  await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await visit(5);await page.tap('.stack__row:nth-child(2)');
  assert(await page.$('.stack__row:nth-child(2).is-charged'),'Touch highlight missing');
  await visit(13);assert((await flame()).coverage>.05,'Mobile flame invisible');
  await page.screenshot({path:new URL('../lab/effects/mobile.png',import.meta.url).pathname});
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await pause();
  assert(await page.$$eval('.section-effect',cs=>cs.every(c=>getComputedStyle(c).display==='none')));
  await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'no-preference'}]);await pause();
  assert((await flame()).coverage>.05,'Flame did not restore');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log(`SECTION_EFFECTS_OK flame coverage ${(first.coverage*100).toFixed(1)}%, bright arc pixels ${arcs}`);
} finally {await browser?.close();server.close();}
