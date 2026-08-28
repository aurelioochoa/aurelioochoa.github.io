// Does the entrance actually complete on its own, with nothing forced?
// gate-shoot settles the animations before capturing, so this is the check that the
// unforced path really ends with the copy visible.
import puppeteer from '../cv/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { serve } from './serve.mjs';

const PORT = 8129;
const server = await serve(PORT);
const browser = await puppeteer.launch({ args: ['--use-angle=gl', '--no-sandbox'] });
const failures = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('html[data-ready="true"]');
  await new Promise((r) => setTimeout(r, 1800));   // longer than delay + duration

  const first = await page.evaluate(() => {
    const vis = (s) => getComputedStyle(document.querySelector(s)).opacity;
    return { name: vis('.name'), where: vis('.name__where') };
  });
  console.log(`  above the fold, unforced: .name=${first.name} .name__where=${first.where}`);
  if (Number(first.name) < 0.99) failures.push(`.name never reached full opacity (${first.name})`);
  if (Number(first.where) < 0.99) failures.push(`.name__where stuck at ${first.where}`);

  // And an act further down, reached by actually scrolling to it.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, document.querySelector('[data-act="6"]').offsetTop + 10);
  });
  await new Promise((r) => setTimeout(r, 1500));
  const deep = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-act="6"] .shipped__item')];
    return items.map((el) => getComputedStyle(el.closest('.act')).opacity)[0]
      + '/' + getComputedStyle(document.querySelector('[data-act="6"] .shipped')).opacity;
  });
  console.log(`  act 6 after scrolling to it: ${deep}`);
  if (Number(deep.split('/')[1]) < 0.99) failures.push(`act 6 content stuck at ${deep}`);
  await page.close();
} finally {
  await browser.close();
  server.close();
}
if (failures.length) { console.error('REVEAL FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
console.log('REVEAL_OK');
