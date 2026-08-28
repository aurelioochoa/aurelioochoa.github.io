// Language detection and application.
//
// Every translatable node carries data-i18n="dotted.key". A node that translates an
// attribute instead of its text carries data-i18n-attr="content" alongside it. That means
// coverage is mechanically checkable: the set of keys in the markup must equal the set of
// leaf keys in every language file, which is what tools/gate-i18n-complete.mjs asserts.

export const SUPPORTED = ['en', 'es', 'de'];

export function detectLanguage() {
  let stored = null;
  try {
    stored = localStorage.getItem('lang');
  } catch {
    // Private mode or blocked storage: fall through to the navigator.
  }
  if (SUPPORTED.includes(stored)) return stored;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : 'en';
}

function lookup(dict, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

export async function applyLanguage(lang) {
  const res = await fetch(`assets/languages/${lang}.json`);
  if (!res.ok) throw new Error(`Failed to load language file: ${lang}`);
  const t = await res.json();

  document.documentElement.lang = lang;

  for (const el of document.querySelectorAll('[data-i18n]')) {
    const value = lookup(t, el.dataset.i18n);
    if (typeof value !== 'string') continue;      // gate G3 is what stops this being silent
    const attr = el.dataset.i18nAttr;
    if (attr) el.setAttribute(attr, value);
    else el.textContent = value;
  }

  // The CV link points at a different PDF per language.
  const file = t.meta?.cvFile;
  if (file) {
    for (const el of document.querySelectorAll('[data-cv-link]')) {
      el.href = `assets/pdf/${encodeURIComponent(file)}`;
    }
  }
  return t;
}

export function buildToggle(current) {
  const nav = document.querySelector('.langs');
  if (!nav) return;
  nav.replaceChildren();
  for (const lang of SUPPORTED) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = lang.toUpperCase();
    btn.setAttribute('aria-current', String(lang === current));
    btn.addEventListener('click', () => {
      if (lang === current) return;
      try {
        localStorage.setItem('lang', lang);
      } catch {
        // Non-persistent switch is still better than no switch.
      }
      location.reload();
    });
    nav.appendChild(btn);
  }
}
