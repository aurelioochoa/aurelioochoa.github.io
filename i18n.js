const SUPPORTED = ['en', 'es', 'de'];

export function detectLanguage() {
  const stored = localStorage.getItem('lang');
  if (SUPPORTED.includes(stored)) return stored;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : 'en';
}

export async function applyLanguage(lang) {
  const res = await fetch(`assets/languages/${lang}.json`);
  if (!res.ok) throw new Error(`Failed to load language file: ${lang}`);
  const t = await res.json();

  document.documentElement.lang = lang;
  document.title = t.pageTitle;

  document.querySelector('.hero h1').textContent = t.heroSection.title;
  document.querySelector('.hero h2').textContent = t.heroSection.subtitle;

  document.querySelector('.social-media .bento-title').textContent = t.socialMediaSection.title;
  document.querySelector('.cv-link').href = `assets/pdf/${encodeURIComponent(t.socialMediaSection.cvFile)}`;

  document.querySelector('.timeline .bento-title').textContent = t.experienceSection.title;
  const timeline = document.querySelector('.timeline');
  timeline.querySelectorAll('template').forEach((tpl) => tpl.remove());
  t.experienceSection.experiences.forEach((exp, i) => {
    const tpl = document.createElement('template');
    tpl.setAttribute('data-order', String(i + 1));
    tpl.setAttribute('title', exp.title);
    tpl.setAttribute('data-subtitle', exp.subtitle);
    const duration = exp.duration ? ` · ${exp.duration}` : '';
    tpl.innerHTML = `${exp.dateRange}${duration} <br> ${exp.description}`;
    timeline.appendChild(tpl);
  });

  document.querySelector('.icon-shelf .bento-title').textContent = t.technologiesSection.title;
  const icons = document.querySelectorAll('.icon-shelf i[title]');
  t.technologiesSection.technologies.forEach((tech, i) => {
    const icon = icons[i];
    if (!icon) return;
    icon.setAttribute('title', tech.title);
    icon.querySelector('template').innerHTML = tech.description;
  });

  document.querySelector('.contact h1').innerHTML =
    `<i class="fa-solid fa-handshake"></i>${t.contactSection.title}`;
  document.querySelector('.contact input[name="Name"]').placeholder = t.contactSection.form.name;
  document.querySelector('.contact input[name="Email"]').placeholder = t.contactSection.form.email;
  document.querySelector('.contact textarea').placeholder = t.contactSection.form.message;
  document.querySelector('.contact button').textContent = t.contactSection.form.send;

  document.querySelector('footer > p').innerHTML =
    `${t.footerSection.website} <a href="https://aurelioochoa.xyz" target="_blank">aurelioochoa.xyz</a>`;
}

export function buildToggle(current) {
  const nav = document.createElement('nav');
  nav.className = 'lang-toggle';
  for (const lang of SUPPORTED) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = lang.toUpperCase();
    if (lang === current) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (lang === current) return;
      localStorage.setItem('lang', lang);
      location.reload();
    });
    nav.appendChild(btn);
  }
  document.body.appendChild(nav);
}
