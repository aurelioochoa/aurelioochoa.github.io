import { createFireEdge } from './fire-edge.js';

// Elemental effects follow real content edges. No duplicated text or iframe. The flame context exists only while visible.
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
    let frame = 0, last = 0, clock = 0, touchTimer = 0, flame = null;
    const reflection = host.classList.contains('kitchen-heat--copy');
    const charges = new Map();
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

    // Seeded midpoint displacement gives each discharge a persistent branching shape.
    // It fades before the next shape arrives, rather than morphing like a sine wave.
    const random = seed => {
      let state = seed | 0;
      return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
    };
    const branch = (a,b,spread,rng,depth=0) => {
      if (depth===6) return [a,b];
      const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2+(rng()-.5)*spread];
      return [...branch(a,mid,spread*.68,rng,depth+1).slice(0,-1),...branch(mid,b,spread*.68,rng,depth+1)];
    };
    const bolt = (y,index,t) => {
      const hot = active===index || (active>=0 && active+1===index);
      const cycle = Math.floor((t+index*.47)/1.65);
      const age = (t+index*.47)%1.65;
      const strength = hot ? .32 + .65 * Math.exp(-age*3.7) : .035 + .40 * Math.exp(-age*3.7);
      let charge=charges.get(index);
      if(!charge || charge.cycle!==cycle || charge.width!==width || charge.hot!==hot) {
        const rng=random((cycle+1)*7919+(index+1)*104729);
        const span=width*(hot?.92:.45), x=rng()*(width-span);
        const points=branch([x,y],[x+span,y],hot?24:15,rng);
        const forks=[];
        for(let i=0;i<4;i++) {
          const start=points[8+Math.floor(rng()*45)];
          const end=[Math.min(width,start[0]+18+rng()*42),y+(rng()>.5?1:-1)*(8+rng()*8)];
          forks.push(branch(start,end,9,rng));
        }
        charge={cycle,width,hot,points,forks}; charges.set(index,charge);
      }
      // Residual charge lives in the divider; the bright discharge occupies only a span.
      ctx.strokeStyle='rgba(102,155,207,0.23)'; ctx.lineWidth=.7;
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();
      const stroke=(points,lineWidth,color,alpha) => {
        ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=lineWidth;
        ctx.beginPath();points.forEach(([x,yy],i)=>i?ctx.lineTo(x,yy):ctx.moveTo(x,yy));ctx.stroke();
      };
      ctx.lineJoin='round';ctx.lineCap='round';
      stroke(charge.points,9,'#427ccd',strength*.09);
      stroke(charge.points,4,'#63a5ef',strength*.28);
      stroke(charge.points,1.7,'#94d5ff',strength*.8);
      stroke(charge.points,.65,'#f1fcff',strength);
      charge.forks.forEach(points=>stroke(points,.55,'#acdfff',strength*.65));
      ctx.globalAlpha=1;
      // Contact light fades onto the row, tying the discharge to the table surface.
      const p=charge.points[32];
      const glow=ctx.createRadialGradient(p[0],y,0,p[0],y,45);
      glow.addColorStop(0,`rgba(82,145,236,${strength*.13})`);glow.addColorStop(1,'rgba(82,145,236,0)');
      ctx.fillStyle=glow;ctx.fillRect(p[0]-45,y-18,90,36);
    };

    const fire = t => {
      if(flame && !reflection) flame.draw(ctx,width,height,t);
      else {
        // Reflected firelight warms the text block's edge without a second row of flames.
        const heat=ctx.createLinearGradient(0,height,0,0);
        const pulse=.15+Math.sin(t*2.1)*.025+Math.sin(t*3.7)*.015;
        heat.addColorStop(0,`rgba(255,111,30,${pulse})`);
        heat.addColorStop(.35,'rgba(205,59,12,0.045)');heat.addColorStop(1,'rgba(205,59,12,0)');
        ctx.fillStyle=heat;ctx.fillRect(0,0,width,height);
      }
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
        if (kind === 'fire' && !reflection && !flame) {
          try { flame = createFireEdge(); } catch { flame = null; }
        }
        last = performance.now(); frame = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0,0,width,height);
        flame?.dispose(); flame = null;
      }
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
