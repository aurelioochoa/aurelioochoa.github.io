// G7: walk every act at desktop and phone widths, capture a contact sheet, and assert the
// page holds up: no horizontal overflow, no act left unreadable, no act over the cutlist cap.
import puppeteer from '../cv/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serve } from './serve.mjs';

const PORT = 8127;
const base = `http://localhost:${PORT}`;
const outDir = path.join(import.meta.dirname, '..', 'lab', 'site');
await mkdir(outDir, { recursive: true });

const server = await serve(PORT);
const browser = await puppeteer.launch({ args: ['--use-angle=gl', '--no-sandbox'] });
const failures = [];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForSelector('html[data-ready="true"]');

    // Settle every entrance so a capture cannot catch one mid-flight and read as a defect.
    await page.evaluate(() => {
      document.querySelectorAll('.act').forEach((a) => a.classList.add('is-in'));
      document.querySelectorAll('.name__line .w').forEach((w) => {
        w.style.animation = 'none'; w.style.transform = 'none';
      });
    });
    await new Promise((r) => setTimeout(r, 400));

    const report = await page.evaluate(() => {
      const acts = [...document.querySelectorAll('.act')].map((a) => {
        const r = a.getBoundingClientRect();
        // Is anything in this act actually readable, or is it an empty band of scroll?
        const text = a.innerText.trim().length;
        const hasMedia = !!a.querySelector('img');
        return {
          act: +a.dataset.act, ground: a.dataset.ground, peak: a.dataset.peak !== undefined,
          vh: Math.round((r.height / innerHeight) * 100) / 100,
          top: Math.round(r.top + scrollY), height: Math.round(r.height),
          chars: text, hasMedia,
        };
      });
      return {
        acts,
        viewports: Math.round((document.body.scrollHeight / innerHeight) * 100) / 100,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    console.log(`  ${vp.name} (${vp.width}px): ${report.viewports} viewports, ` +
                `overflowX ${report.overflowX}px, max act ${Math.max(...report.acts.map(a => a.vh))}vh`);

    if (report.overflowX > 1) {
      failures.push(`${vp.name}: horizontal overflow of ${report.overflowX}px`);
    }
    if (report.viewports < 8 || report.viewports > 14) {
      failures.push(`${vp.name}: page is ${report.viewports} viewports, budget is 8 to 14`);
    }
    for (const a of report.acts) {
      if (a.vh > 1.4) failures.push(`${vp.name}: act ${a.act} is ${a.vh}vh, cutlist cap is 1.4`);
      // The three title cards are authored silence: one word, no image, by design.
      const isCard = a.ground === 'card' || a.ground === 'card-light';
      if (!isCard && a.chars < 20 && !a.hasMedia) {
        failures.push(`${vp.name}: act ${a.act} has no readable content (dead scroll)`);
      }
      if (isCard && a.chars === 0) failures.push(`${vp.name}: title card ${a.act} is empty`);
    }

    // The peak must be the longest act by a visible margin. Which act that is comes from
    // the markup's own `data-peak`, not a number written here: acts get inserted, and a
    // gate that hardcodes the index silently starts measuring the wrong section.
    const peak = report.acts.find((a) => a.peak);
    if (!peak) {
      failures.push(`${vp.name}: no act carries data-peak`);
    } else {
      const others = report.acts.filter((a) => !a.peak);
      const longestOther = Math.max(...others.map((a) => a.vh));
      if (peak.vh <= longestOther) {
        failures.push(`${vp.name}: the peak (${peak.vh}vh) is not the longest act (${longestOther}vh)`);
      } else {
        console.log(`    peak act ${peak.act}: ${peak.vh}vh vs next longest ${longestOther}vh`);
      }
    }

    // Contact sheet: one frame per act, plus the seams between worlds.
    const frames = [];
    for (const a of report.acts) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, a.top - 8));
      await new Promise((r) => setTimeout(r, 260));
      const buf = await page.screenshot({ type: 'jpeg', quality: 72 });
      frames.push(buf);
    }
    for (const [i, buf] of frames.entries()) {
      await writeFile(path.join(outDir, `${vp.name}-act${String(i + 1).padStart(2, '0')}.jpg`), buf);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('SHOOT FAILURES:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('SHOOT_OK');
