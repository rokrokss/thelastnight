/** Thin WebGL2 helpers: programs with cached uniform locations, and render targets. */

export interface Prog {
  p: WebGLProgram;
  u: Record<string, WebGLUniformLocation | null>;
}

export function makeProg(gl: WebGL2RenderingContext, vs: string, fs: string, name: string): Prog {
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  const stages: [number, string][] = [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ];
  for (const [type, src] of stages) {
    const s = gl.createShader(type);
    if (!s) throw new Error('createShader failed');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      throw new Error(`shader "${name}" (${kind}): ${gl.getShaderInfoLog(s)}`);
    }
    gl.attachShader(p, s);
    gl.deleteShader(s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`program "${name}": ${gl.getProgramInfoLog(p)}`);
  }
  const u: Record<string, WebGLUniformLocation | null> = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    if (!info) continue;
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture[];
  w: number;
  h: number;
  rb?: WebGLRenderbuffer | null;
}

export function makeTarget(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  attachments: 1 | 2 | 3,
  hdr: boolean,
  /** Also attach a depth buffer (for real geometry). */
  depth = false,
): Target {
  w = Math.max(2, Math.floor(w));
  h = Math.max(2, Math.floor(h));
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('createFramebuffer failed');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const tex: WebGLTexture[] = [];
  for (let i = 0; i < attachments; i++) {
    const t = gl.createTexture();
    if (!t) throw new Error('createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, hdr ? gl.RGBA16F : gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    tex.push(t);
  }
  gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  let rb: WebGLRenderbuffer | null = null;
  if (depth) {
    rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`framebuffer incomplete (0x${status.toString(16)}, hdr=${hdr})`);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, w, h, rb };
}

export function freeTarget(gl: WebGL2RenderingContext, t: Target | null | undefined): void {
  if (!t) return;
  gl.deleteFramebuffer(t.fbo);
  for (const x of t.tex) gl.deleteTexture(x);
  if (t.rb) gl.deleteRenderbuffer(t.rb);
}

/** Texture that receives a 2D canvas every frame. */
export function makeCanvasTexture(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error('createTexture failed');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
