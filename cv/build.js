import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { render } from './render.js';

const cvDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(cvDir, '..', 'assets', 'pdf');

const template = await readFile(path.join(cvDir, 'template.html'), 'utf8');
const dataFiles = (await readdir(path.join(cvDir, 'data')))
  .filter((f) => f.endsWith('.json'))
  .sort();
await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch();
try {
  for (const file of dataFiles) {
    const data = JSON.parse(await readFile(path.join(cvDir, 'data', file), 'utf8'));
    const html = render(template, data);
    const htmlPath = path.join(cvDir, `.build-${path.basename(file, '.json')}.html`);
    await writeFile(htmlPath, html);
    const page = await browser.newPage();
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: path.join(outDir, data.meta.outputFile),
      format: 'A4',
      printBackground: true,
    });
    await page.close();
    console.log(`built ${data.meta.outputFile}`);
  }
} finally {
  await browser.close();
}
