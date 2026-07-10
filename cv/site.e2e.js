// E2E check of the language switcher. Requires a static server:
//   python3 -m http.server 8123   (from the repo root)
// Run with: node site.e2e.js
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const base = 'http://localhost:8123';
const browser = await puppeteer.launch();

try {
  const page = await browser.newPage();

  // 1. Spanish browser auto-detects Spanish
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'language', { get: () => 'es-EC' });
  });
  await page.goto(base, { waitUntil: 'networkidle0' });
  assert.equal(
    await page.$eval('.hero h2', (el) => el.textContent),
    'Desarrollador Full-Stack',
    'auto-detected Spanish subtitle'
  );
  assert.match(
    await page.$eval('.cv-link', (el) => el.getAttribute('href')),
    /Curriculum/,
    'CV link follows Spanish'
  );

  // 2. Toggle to German reloads and persists
  await page.evaluate(() => {
    [...document.querySelectorAll('.lang-toggle button')]
      .find((b) => b.textContent === 'DE')
      .click();
  });
  await page.waitForFunction(
    () => document.querySelector('.hero h2')?.textContent === 'Full-Stack Entwickler'
  );
  assert.match(
    await page.$eval('.cv-link', (el) => el.getAttribute('href')),
    /Lebenslauf/,
    'CV link follows German'
  );
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(
    await page.$eval('.hero h2', (el) => el.textContent),
    'Full-Stack Entwickler',
    'German persists across reloads via localStorage'
  );

  // 3. Six experience templates present
  assert.equal(
    await page.$$eval('.timeline template', (els) => els.length),
    6,
    'six experience entries'
  );

  // 4. German fits on a phone: the long contact title must wrap, not
  //    spill out of its card and force horizontal page overflow
  const phone = await browser.newPage();
  await phone.evaluateOnNewDocument(() => localStorage.setItem('lang', 'de'));
  await phone.setViewport({ width: 400, height: 1200 });
  await phone.goto(base, { waitUntil: 'networkidle0' });
  const overflow = await phone.evaluate(() => ({
    page: document.body.scrollWidth - document.documentElement.clientWidth,
    title: (() => {
      const h1 = document.querySelector('.contact h1');
      return h1.scrollWidth - h1.clientWidth;
    })(),
  }));
  assert.ok(overflow.title <= 1, `contact title overflows its card by ${overflow.title}px in German at 400px`);
  assert.ok(overflow.page <= 1, `page overflows horizontally by ${overflow.page}px in German at 400px`);
  await phone.close();

  console.log('site i18n e2e: all assertions passed');
} finally {
  await browser.close();
}
