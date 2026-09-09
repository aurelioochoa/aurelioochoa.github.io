// Elemental effects follow real content edges. No duplicated text, iframe or WebGL context.
// Layout is measured only on resize/content changes, never in the animation loop.
export function wireSectionEffects() {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const hosts = [...document.querySelectorAll('[data-section-effect]')];
  for (const host of hosts) {
    const kind = host.dataset.sectionEffect;
    const canvas = document.createElement('canvas');
    canvas.className = `section-effect section-effect--${kind}`;
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    host.append(canvas);
    const rows = [...host.querySelectorAll('.stack__row')];
    let width = 0, height = 0, edges = [], active = -1, visible = false;
    let frame = 0, last = 0, clock = 0, touchTimer = 0;
    const pad = kind === 'lightning' ? 18 : 0;

    const measure = () => {
      width = host.clientWidth;
      height = kind === 'lightning' ? host.clientHeight + pad * 2 : canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      edges = rows.map(row => row.offsetTop + pad + row.clientTop / 2);
      if (rows.length) edges.push(host.clientHeight + pad - 1);
      if (motion.matches) ctx.clearRect(0, 0, width, height);
    };

    const bolt = (y, index, t) => {
      const hot = active === index || active + 1 === index && active >= 0;
      const amplitude = hot ? 6 : 2.8;
      const points = [];
      const count = Math.max(12, Math.ceil(width / 12));
      for (let i = 0; i <= count; i++) {
        const envelope = Math.sin(i / count * Math.PI);
        const jitter = Math.sin(i * 2.73 + t * 9 + index * 4) * Math.cos(i * 1.37 - t * 6);
        points.push([i / count * width, y + jitter * amplitude * envelope]);
      }
      const path = () => {
        ctx.beginPath();
        points.forEach(([x, yy], i) => i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy));
      };
      ctx.lineJoin = 'round';
      ctx.shadowColor = '#68aaff';
      ctx.shadowBlur = hot ? 15 : 7;
      ctx.strokeStyle = hot ? 'rgba(92,161,255,0.6)' : 'rgba(68,128,230,0.3)';
      ctx.lineWidth = hot ? 4 : 2.5;
      path(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hot ? '#e1f6ff' : 'rgba(142,199,255,0.66)';
      ctx.lineWidth = hot ? 1.2 : 0.7;
      path(); ctx.stroke();
      // A travelling charge and short forks attach to the actual separator.
      const travel = (t * (hot ? 0.24 : 0.10) + index * 0.27) % 1;
      const p = points[Math.floor(travel * count)];
      ctx.strokeStyle = hot ? 'rgba(186,226,255,0.8)' : 'rgba(105,172,255,0.35)';
      ctx.beginPath(); ctx.moveTo(p[0],p[1]);
      ctx.lineTo(p[0]+8,p[1]-5); ctx.lineTo(p[0]+13,p[1]-3); ctx.lineTo(p[0]+22,p[1]-11);
      ctx.stroke();
    };

    const fire = t => {
      const base = height - 2;
      const heat = ctx.createLinearGradient(0, height, 0, 0);
      heat.addColorStop(0, 'rgba(255,88,12,0.32)');
      heat.addColorStop(0.5, 'rgba(218,49,8,0.06)');
      heat.addColorStop(1, 'rgba(218,49,8,0)');
      ctx.fillStyle = heat; ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(1.4px)';
      const count = Math.max(8, Math.ceil(width / 19));
      for (let i = 0; i < count; i++) {
        const phase = i * 2.39996;
        const x = (i + 0.5 + Math.sin(phase) * 0.35) * width / count;
        const sway = Math.sin(t * 2.4 + phase) * 9;
        const envelope = 0.55 + 0.45 * Math.sin((i + 0.5) / count * Math.PI);
        const h = height * (0.30 + 0.34 * (0.5 + 0.5 * Math.sin(t * 2.8 + phase))) * envelope;
        const w = width / count * (0.7 + 0.45 * Math.sin(phase + t));
        const gradient = ctx.createLinearGradient(x,base,x,base-h);
        gradient.addColorStop(0,'rgba(255,170,48,0.45)');
        gradient.addColorStop(0.25,'rgba(255,101,18,0.32)');
        gradient.addColorStop(0.7,'rgba(240,48,8,0.22)');
        gradient.addColorStop(1,'rgba(218,40,5,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.moveTo(x-w,base);
        ctx.bezierCurveTo(x-w*0.65,base-h*0.4,x+sway-w*0.6,base-h*0.65,x+sway,base-h);
        ctx.bezierCurveTo(x+sway-w*0.2,base-h*0.45,x+w,base-h*0.35,x+w,base);
        ctx.closePath(); ctx.fill();
      }
      ctx.filter = 'none';
      // Sparse rising embers, bounded to this edge rather than scattered over the copy.
      for (let i=0; i<12; i++) {
        const life = (t * 0.19 + i * 0.618) % 1;
        const x = ((i * 0.38197) % 1) * width + Math.sin(t+i)*6;
        ctx.fillStyle = `rgba(255,174,66,${(1-life)*0.6})`;
        ctx.fillRect(x,base-life*height,1.3,2.2);
      }
      ctx.globalCompositeOperation = 'source-over';
    };

    const tick = now => {
      frame = requestAnimationFrame(tick);
      if (now-last < 32) return; // cap these decorative canvases at 30 fps
      clock += Math.min((now-last)/1000, 0.05); last = now;
      ctx.clearRect(0,0,width,height);
      if (kind === 'lightning') edges.forEach((y,i) => bolt(y,i,clock));
      else fire(clock);
    };
    const sync = () => {
      cancelAnimationFrame(frame); frame = 0;
      if (visible && !document.hidden && !motion.matches) {
        last = performance.now(); frame = requestAnimationFrame(tick);
      } else ctx.clearRect(0,0,width,height);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(host);
    rows.forEach(row => resize.observe(row));
    const observer = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting; sync();
    });
    observer.observe(host);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', () => { measure(); sync(); });
    if (rows.length) {
      const select = target => {
        active = rows.indexOf(target.closest('.stack__row'));
        rows.forEach((row,i) => row.classList.toggle('is-charged', i === active));
      };
      host.addEventListener('pointerover', event => select(event.target));
      host.addEventListener('pointerleave', event => {
        if (event.pointerType === 'mouse') select(host);
      });
      host.addEventListener('pointerdown', event => {
        select(event.target);
        clearTimeout(touchTimer);
        if (event.pointerType !== 'mouse') touchTimer = setTimeout(() => select(host), 1200);
      });
    }
    measure();
  }
}
