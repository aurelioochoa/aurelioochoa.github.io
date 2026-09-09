// CPU-rendered turbulent fire: the effect remains available when the drone/scenes
// exhaust a browser's WebGL contexts, or a graphics driver rejects a shader.
// A small, smoothly upscaled heat texture bounds the work independently of screen DPR.
export function createFireEdge() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  const grid = new Float32Array(256 * 256);
  let seed = 728471;
  for (let i=0; i<grid.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    grid[i] = (seed >>> 0) / 4294967296;
  }
  const noise = (x,y) => {
    const ix=Math.floor(x), iy=Math.floor(y);
    let fx=x-ix, fy=y-iy; fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy);
    const a=grid[((iy&255)<<8)+(ix&255)], b=grid[((iy&255)<<8)+((ix+1)&255)];
    const c=grid[(((iy+1)&255)<<8)+(ix&255)], d=grid[(((iy+1)&255)<<8)+((ix+1)&255)];
    return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
  };
  const fbm = (x,y) => noise(x,y)*.57 + noise(x*2.03+17.1,y*2.03+9.2)*.28 + noise(x*4.12+51.8,y*4.12+27.9)*.15;
  const smooth = (a,b,x) => {const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v);};
  let pixels;
  return {
    draw(ctx,width,height,t) {
      if (!width || !height) return;
      const w=Math.min(300,Math.max(160,Math.round(width*.45))),h=88;
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;pixels=context.createImageData(w,h);}
      const data=pixels.data, aspect=width/height;
      for(let py=0;py<h;py++) {
        const y=1-py/(h-1);
        for(let px=0;px<w;px++) {
          const u=px/(w-1), x=u*aspect;
          const warp=fbm(x*2.7,y*2-t*.65);
          const flowX=x*4.8+(warp-.5)*y*3.2, flowY=y*3.4-t*1.5;
          const fuel=.55+.45*noise(x*2.4,t*.25);
          const field=(fbm(flowX,flowY)*.8+fbm(flowX*2.1+8.3,flowY*2.1-t*.7)*.25)*fuel-y*.72+.12;
          const temp=Math.max(0,Math.min(1,field*2.3));
          const sides=smooth(0,.035,u)*smooth(0,.035,1-u);
          const alpha=smooth(.07,.23,field)*(1-smooth(.65,.98,y))*(.45+.5*temp)*sides;
          const halo=Math.exp(-y*7)*.1*sides;
          const orange=smooth(.15,.55,temp), gold=smooth(.55,.88,temp), white=smooth(.86,1,temp);
          let r=.75+.25*orange, g=.065+.315*orange, b=.004+.011*orange;
          r+=(1-r)*gold;g+=(.86-g)*gold;b+=(.38-b)*gold;
          g+=(.98-g)*white;b+=(.83-b)*white;
          const mix=alpha/(alpha+halo+.001), i=(py*w+px)*4;
          data[i]=(1+(r-1)*mix)*255;
          data[i+1]=(.21+(g-.21)*mix)*255;
          data[i+2]=(.015+(b-.015)*mix)*255;
          data[i+3]=Math.min(.96,alpha+halo)*255;
        }
      }
      context.putImageData(pixels,0,0);
      ctx.imageSmoothingEnabled=true;
      ctx.drawImage(canvas,0,0,width,height);
    },
    dispose(){canvas.width=1;canvas.height=1;pixels=null;},
  };
}
