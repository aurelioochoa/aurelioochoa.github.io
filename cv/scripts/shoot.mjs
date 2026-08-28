import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { render } from '../render.js';

const cvDir = path.join(import.meta.dirname, '..');
const labDir = path.join(cvDir, 'lab');
await mkdir(labDir, { recursive: true });

const template = await readFile(path.join(cvDir, 'template.html'), 'utf8');
const files = (await readdir(path.join(cvDir, 'data'))).filter((f) => f.endsWith('.json')).sort();
const browser = await puppeteer.launch();
try {
  for (const file of files) {
    const lang = path.basename(file, '.json');
    const data = JSON.parse(await readFile(path.join(cvDir, 'data', file), 'utf8'));
    const htmlPath = path.join(cvDir, `.build-${lang}.html`);
    await writeFile(htmlPath, render(template, data));
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    const box = await page.$eval('.page', (el) => {
      const mmPerPx = 210 / el.getBoundingClientRect().width;
      return { heightMm: el.getBoundingClientRect().height * mmPerPx };
    });
    const over = box.heightMm - 297;
    console.log(`${lang}: content ${box.heightMm.toFixed(1)}mm of 297mm  (${over > 0.05 ? 'OVER by ' + over.toFixed(2) + 'mm' : 'fits'})`);
    await page.screenshot({ path: path.join(labDir, `render-${lang}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}
