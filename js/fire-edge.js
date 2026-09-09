// Transparent, edge-fed combustion. Noise is advected upward and warped at several
// scales so tongues stretch, separate and dissolve instead of repeating drawn shapes.
export function createFireEdge() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw Error(message);
    }
    return shader;
  };
  const vertex = compile(gl.VERTEX_SHADER, `attribute vec2 p; varying vec2 uv;
    void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`);
  const fragment = compile(gl.FRAGMENT_SHADER, `precision mediump float;
    varying vec2 uv; uniform float time; uniform float aspect;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
    float fbm(vec2 p){float n=0.,a=.5;
      for(int i=0;i<4;i++){n+=a*noise(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return n;}
    void main(){
      float y=uv.y; vec2 p=vec2(uv.x*aspect,y);
      float warp=fbm(vec2(p.x*2.7,y*2.-time*.65));
      vec2 flow=vec2(p.x*4.8+(warp-.5)*y*3.2,y*3.4-time*1.5);
      float coarse=fbm(flow);
      float fine=fbm(flow*2.1+vec2(8.3,-time*.7));
      float fuel=.45+.55*noise(vec2(p.x*2.4,time*.25));
      float field=(coarse*.8+fine*.25)*fuel-y*.72+.12;
      float flame=smoothstep(.08,.24,field);
      flame*=1.-smoothstep(.60,.98,y);
      float temperature=clamp(field*2.5,0.,1.);
      vec3 color=mix(vec3(.75,.065,.004),vec3(1.,.38,.015),smoothstep(.15,.55,temperature));
      color=mix(color,vec3(1.,.86,.38),smoothstep(.55,.88,temperature));
      color=mix(color,vec3(1.,.98,.83),smoothstep(.86,1.,temperature));
      float sides=smoothstep(0.,.045,uv.x)*smoothstep(0.,.045,1.-uv.x);
      float alpha=flame*(.3+.65*temperature)*sides;
      float halo=exp(-y*6.)*.16*sides;
      color=mix(vec3(1.,.21,.015),color,alpha/(alpha+halo+.001));
      gl_FragColor=vec4(color,clamp(alpha+halo,0.,.95));
    }`);
  const program = gl.createProgram();
  gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const pos=gl.getAttribLocation(program,'p'); gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
  const time=gl.getUniformLocation(program,'time'), aspect=gl.getUniformLocation(program,'aspect');
  return {
    draw(ctx,width,height,t) {
      const w=Math.min(1000,Math.round(width*1.3)),h=Math.round(height*1.3);
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
      gl.uniform1f(time,t); gl.uniform1f(aspect,width/height);
      gl.drawArrays(gl.TRIANGLES,0,6);
      ctx.drawImage(canvas,0,0,width,height);
    },
    dispose(){gl.deleteBuffer(buffer);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();},
  };
}
