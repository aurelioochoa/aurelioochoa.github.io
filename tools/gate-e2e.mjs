// G4: the language switcher still works end to end.
import puppeteer from '../cv/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const PORT = 8124;
const base = `http://localhost:${PORT}`;
const server = await serve(PORT);
const browser = await puppeteer.launch({
  args: ['--use-angle=gl', '--no-sandbox'],
});
const failures = [];

// Each case runs in its own incognito context. Without this, the language stored by the
// toggle case leaks into the next one and its assertions pass or fail for the wrong reason.
const contexts = [];
async function freshPage() {
  const ctx = await browser.createBrowserContext();
  contexts.push(ctx);
  return ctx.newPage();
}

try {
  // 1. A Spanish browser auto-detects Spanish.
  {
    const page = await freshPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', { get: () => 'es-EC' });
    });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForSelector('html[data-ready="true"]');
    const lang = await page.$eval('html', (el) => el.lang);
    const three = await page.$eval('.three__item--turn', (el) => el.textContent.trim());
    const cv = await page.$eval('.chrome__cv', (el) => el.getAttribute('href'));
    if (lang !== 'es') failures.push(`auto-detect: html lang is "${lang}", expected "es"`);
    if (three !== 'Cocinero.') failures.push(`auto-detect: third word is "${three}"`);
    if (!/Curriculum/.test(cv)) failures.push(`auto-detect: CV link is "${cv}"`);
    console.log(`  es auto-detect: lang=${lang}, word="${three}", cv=${cv.split('/').pop()}`);
    await page.close();
  }

  // 2. Toggling to German persists across a reload.
  {
    const page = await freshPage();
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForSelector('html[data-ready="true"]');
    await page.evaluate(() => {
      [...document.querySelectorAll('.langs button')].find((b) => b.textContent === 'DE').click();
    });
    await page.waitForSelector('html[lang="de"][data-ready="true"]');
    const head = await page.$eval('.close__head', (el) => el.textContent.trim());
    const cv = await page.$eval('.chrome__cv', (el) => el.getAttribute('href'));
    if (!/Lass uns/.test(head)) failures.push(`toggle: close head is "${head}"`);
    if (!/Lebenslauf/.test(cv)) failures.push(`toggle: CV link is "${cv}"`);

    // Reload with no navigator hint: the stored choice must win.
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForSelector('html[data-ready="true"]');
    const after = await page.$eval('html', (el) => el.lang);
    if (after !== 'de') failures.push(`persistence: lang after reload is "${after}"`);
    const current = await page.$eval('.langs button[aria-current="true"]', (el) => el.textContent);
    if (current !== 'DE') failures.push(`persistence: active toggle is "${current}"`);
    console.log(`  de toggle + reload: lang=${after}, active=${current}, cv=${cv.split('/').pop()}`);
    await page.close();
  }

  // 3. Every CV link in the page follows the language, not just the one in the chrome.
  {
    const page = await freshPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', { get: () => 'es-EC' });
    });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForSelector('html[data-ready="true"]');
    const hrefs = await page.$$eval('[data-cv-link]', (els) => els.map((e) => e.getAttribute('href')));
    if (hrefs.length < 2) failures.push(`only ${hrefs.length} CV link(s) found`);
    for (const h of hrefs) {
      if (!/Curriculum/.test(h)) failures.push(`a CV link did not follow the language: ${h}`);
    }
    console.log(`  ${hrefs.length} CV links, all language-aware`);
    await page.close();
  }
  // 4. A stored choice beats the navigator hint (the rule case 3 must not be confused by).
  {
    const page = await freshPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', { get: () => 'es-EC' });
      localStorage.setItem('lang', 'de');
    });
    await page.goto(base, { waitUntil: 'networkidle0' });
    await page.waitForSelector('html[data-ready="true"]');
    const lang = await page.$eval('html', (el) => el.lang);
    if (lang !== 'de') failures.push(`stored choice lost to navigator: got "${lang}"`);
    console.log(`  stored "de" + es-EC navigator: lang=${lang}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error('E2E FAILURES:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('E2E_OK');
