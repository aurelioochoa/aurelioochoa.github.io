// G8: the page reaches no host but its own, ever.
//
// This is the gate that makes the README's claim enforceable. The claim was true when every
// asset was a font and an image in this repo; it stopped being true the moment ThreeUI
// scenes arrived, because most of them are complete HTML documents that load Tailwind, GSAP,
// three.js, Iconify and even a Supabase-hosted image from public CDNs at render time. A
// grep cannot catch that: the URLs live inside iframe documents, some built at runtime.
//
// So this walks the whole page with a request interceptor attached and fails on the first
// request that leaves localhost. Iframes included, which is the entire point.
import puppeteer from '../cv/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { serve } from './serve.mjs';

const PORT = 8133;
const base = `http://localhost:${PORT}`;
const server = await serve(PORT);
const browser = await puppeteer.launch({ args: ['--use-angle=gl', '--no-sandbox'] });
const offsite = new Map();
const broken = new Set();
let actCount = 0;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  page.on('request', (req) => {
    const url = req.url();
    // data: and blob: are the page's own bytes; about:blank is an iframe before it is given
    // anything to load.
    if (url.startsWith(base) || /^(data:|blob:|about:)/.test(url)) return;
    const host = new URL(url).host;
    const seen = offsite.get(host) ?? { count: 0, sample: url };
    offsite.set(host, { count: seen.count + 1, sample: seen.sample });
  });

  // A local asset that 404s inside an iframe degrades silently: the scene falls back, the
  // page still looks plausible, and nothing fails. Since this walk already watches every
  // request, it may as well watch whether they arrive.
  page.on('response', (res) => {
    if (res.status() >= 400) broken.add(`${res.status()} ${res.url().replace(base, '')}`);
  });
  page.on('requestfailed', (req) => {
    // A favicon the page never declared is the browser asking, not the page breaking.
    if (req.url().endsWith('/favicon.ico')) return;
    broken.add(`failed ${req.url().replace(base, '')} (${req.failure()?.errorText})`);
  });

  await page.goto(base, { waitUntil: 'networkidle0' });
  await page.waitForSelector('html[data-ready="true"]');

  // Every act, because a scene only loads when its act is reached.
  const acts = await page.evaluate(() =>
    [...document.querySelectorAll('.act')].map((a) => +a.dataset.act));
  actCount = acts.length;
  for (const act of acts) {
    await page.evaluate((a) => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, document.querySelector(`[data-act="${a}"]`).offsetTop + 20);
    }, act);
    // Long enough for a scene to mount, build, and make whatever requests it wants to.
    await new Promise((r) => setTimeout(r, 1600));
  }

  await page.close();
} finally {
  await browser.close();
  server.close();
}

if (broken.size) {
  console.error(`REQUESTS THAT DID NOT ARRIVE:\n  ${[...broken].join('\n  ')}`);
}
if (offsite.size) {
  const lines = [...offsite]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([host, { count, sample }]) => `${host} (${count}x)\n      ${sample.slice(0, 120)}`);
  console.error(`OFF-SITE REQUESTS:\n  ${lines.join('\n  ')}`);
  process.exit(1);
}
if (broken.size) process.exit(1);
console.log(`  ${actCount} acts walked, every request local and every one answered`);
console.log('NO_NETWORK_OK');
