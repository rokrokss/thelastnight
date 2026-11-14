/**
 * GLSL for the presentation pipeline.
 *
 * The world is drawn as low-resolution pixel art into four depth groups
 * (far / mid / play / fg). These shaders light, blur, reflect and grade those
 * groups at output resolution, so glows and focus falloff stay smooth while
 * the pixels themselves stay crisp.
 *
 * Conventions: "scene px" are low-res pixels relative to the view's top-left
 * (y down, before zoom). Canvas textures are uploaded flipped, so v = 1 is the
 * top row; all canvas textures hold premultiplied alpha.
 */

const HEAD = `#version 300 es
precision highp float;
`;

/** Fullscreen triangle from gl_VertexID; vUv has (0,0) at the bottom-left. */
export const VS_FULL = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** Screen-space quad (triangle strip) for one light. */
export const VS_LIGHT = `#version 300 es
uniform vec4 uRect;
out vec2 vNdc;
void main(){
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec2 p = mix(uRect.xy, uRect.zw, c);
  vNdc = p;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const NOISE = `
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return s;
}
`;

/**
 * Pixel-art sampling that stays sharp but anti-aliases texel edges by exactly
 * one output pixel, so sub-pixel camera motion and zooms do not shimmer.
 */
const SHARP = `
uniform vec2 uTexSize;
uniform float uPxScale;
vec4 sharpTex(sampler2D t, vec2 uv){
  vec2 tp = uv * uTexSize;
  vec2 i = floor(tp);
  vec2 f = tp - i;
  vec2 s = clamp(f * uPxScale, 0.0, 0.5) + clamp((f - 1.0) * uPxScale + 0.5, 0.0, 0.5);
  return texture(t, (i + s) / uTexSize);
}
`;

/** One point / cone light, accumulated additively. Shadows march the occluder mask. */
export const FS_LIGHT =
  HEAD +
  `
uniform sampler2D uMask;
uniform vec2 uView;
uniform vec2 uTexSize;
uniform float uPad;
uniform float uZoom;
uniform vec2 uRot;
uniform vec2 uOffPlay;
uniform vec2 uLpos;
uniform float uRadius;
uniform vec3 uColor;
uniform vec2 uLdir;
uniform vec2 uCone;
uniform float uShadow;
uniform float uFalloff;
in vec2 vNdc;
out vec4 o;
void main(){
  vec2 vp = vec2(vNdc.x * 0.5 + 0.5, 0.5 - vNdc.y * 0.5) * uView;
  vec2 c = (vp - uView * 0.5) / uZoom;
  vec2 p = vec2(c.x * uRot.x - c.y * uRot.y, c.x * uRot.y + c.y * uRot.x) + uView * 0.5;
  vec2 d = p - uLpos;
  float dist = length(d);
  float a = clamp(1.0 - dist / uRadius, 0.0, 1.0);
  a = pow(a, uFalloff);
  if (uCone.y > -0.999) {
    float cd = dot(d / max(dist, 0.001), uLdir);
    a *= smoothstep(uCone.y, uCone.x, cd);
  }
  if (a < 0.002) { o = vec4(0.0); return; }
  float sh = 1.0;
  if (uShadow > 0.5) {
    const int N = 22;
    vec2 stepv = (uLpos - p) / float(N);
    float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    vec2 q = p + stepv * j;
    float occ = 0.0;
    for (int i = 0; i < N; i++) {
      vec2 muv = (q + uOffPlay + uPad) / uTexSize;
      muv.y = 1.0 - muv.y;
      float m = texture(uMask, muv).b;
      // Skip the first few pixels so lit faces of occluders catch a rim of light.
      float w = smoothstep(1.5, 5.0, distance(q, p)) * smoothstep(1.0, 4.0, distance(q, uLpos));
      occ += m * w;
      q += stepv;
    }
    sh = clamp(1.0 - occ * 0.6, 0.0, 1.0);
    sh *= sh;
  }
  o = vec4(uColor * a * sh, 1.0);
}`;

/** Resolve one depth group (colour + glow canvases) into screen space. */
export const FS_GROUP =
  HEAD +
  SHARP +
  `
uniform sampler2D uC;
uniform sampler2D uG;
uniform vec2 uView;
uniform float uPad;
uniform float uZoom;
uniform vec2 uRot;
uniform vec2 uOff;
uniform vec2 uVan;
in vec2 vUv;
layout(location = 0) out vec4 oC;
layout(location = 1) out vec4 oG;
void main(){
  vec2 vp = vec2(vUv.x, 1.0 - vUv.y) * uView;
  vec2 c = vp - uView * 0.5;
  // Undo the roll about the frame centre, then the group's magnification about the vanishing point.
  vec2 q = vec2(c.x * uRot.x - c.y * uRot.y, c.x * uRot.y + c.y * uRot.x);
  vec2 p = (q - uVan) / uZoom + uVan + uView * 0.5 + uOff + uPad;
  vec2 uv = vec2(p.x / uTexSize.x, 1.0 - p.y / uTexSize.y);
  oC = sharpTex(uC, uv);
  oG = sharpTex(uG, uv);
}`;

/** Separable 9-tap gaussian over a colour + glow pair (depth of field). */
export const FS_BLUR2 =
  HEAD +
  `
uniform sampler2D uA;
uniform sampler2D uB;
uniform vec2 uDir;
in vec2 vUv;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
void main(){
  float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec4 a = texture(uA, vUv) * w[0];
  vec4 b = texture(uB, vUv) * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = uDir * float(i);
    a += (texture(uA, vUv + off) + texture(uA, vUv - off)) * w[i];
    b += (texture(uB, vUv + off) + texture(uB, vUv - off)) * w[i];
  }
  oA = a;
  oB = b;
}`;

/** Single-texture gaussian with an optional threshold (anamorphic streak). */
export const FS_BLUR1 =
  HEAD +
  `
uniform sampler2D uA;
uniform vec2 uDir;
uniform float uThreshold;
in vec2 vUv;
out vec4 o;
vec3 pick(vec2 uv){ return max(texture(uA, uv).rgb - uThreshold, 0.0); }
void main(){
  float w[5] = float[5](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  vec3 a = pick(vUv) * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 off = uDir * float(i);
    a += (pick(vUv + off) + pick(vUv - off)) * w[i];
  }
  o = vec4(a, 1.0);
}`;

/**
 * Main composite: far → mid → fog sheet → lit play layer → wet-floor
 * reflection → light in-scatter (visible beams) → ground fog → foreground.
 * Writes colour and a separate glow buffer that feeds bloom.
 */
const WORLDTAP = `
uniform float uWorldBlur;
uniform vec2 uTexel;
/**
 * The world's geometry, softened by how far out of focus each point is: a
 * small ring of taps whose radius is that point's circle of confusion.
 */
void worldTap(sampler2D tc, sampler2D tg, sampler2D ta, vec2 uv, bool soft, out vec4 c, out vec4 g, out vec4 a){
  a = texture(ta, uv);
  c = texture(tc, uv);
  g = texture(tg, uv);
  float r = a.r * uWorldBlur;
  if (!soft || r < 0.6) return;
  const int N = 10;
  float rot = hash21(uv * 913.0) * 6.2831;
  float wsum = 1.0;
  for (int i = 0; i < N; i++) {
    float t = (float(i) + 0.5) / float(N);
    float ang = rot + float(i) * 2.39996;
    vec2 off = vec2(cos(ang), sin(ang)) * sqrt(t) * r * uTexel;
    c += texture(tc, uv + off);
    g += texture(tg, uv + off);
    wsum += 1.0;
  }
  c /= wsum;
  g /= wsum;
}

`;

/**
 * Whatever stands between the play plane and the lens, laid over the
 * foreground layers with its own focus blur.
 */
export const FS_NEAR =
  HEAD +
  NOISE +
  WORLDTAP +
  `
uniform sampler2D uC;
uniform sampler2D uG;
uniform sampler2D uA;
in vec2 vUv;
layout(location = 0) out vec4 oC;
layout(location = 1) out vec4 oG;
void main(){
  vec4 c, g, a;
  worldTap(uC, uG, uA, vUv, true, c, g, a);
  oC = c;
  oG = g;
}`;

export const FS_MAIN =
  HEAD +
  NOISE +
  WORLDTAP +
  SHARP +
  `
uniform sampler2D uFarC;
uniform sampler2D uFarG;
uniform sampler2D uMidC;
uniform sampler2D uMidG;
uniform sampler2D uPlayC;
uniform sampler2D uPlayG;
uniform sampler2D uMask;
uniform sampler2D uFgC;
uniform sampler2D uFgG;
uniform sampler2D uLight;
uniform sampler2D uPlayRC;
uniform sampler2D uPlayRG;
uniform sampler2D uWorldC;
uniform sampler2D uWorldG;
uniform sampler2D uWorldA;
uniform float uWorldOn;
uniform float uFloorRow;
uniform float uHorizonRow;
uniform float uPlayPre;
uniform float uFgFade;
uniform vec2 uView;
uniform float uPad;
uniform float uZoom;
uniform vec2 uRot;
uniform float uTime;
uniform vec2 uOffPlay;
uniform vec3 uAmbFar;
uniform vec3 uAmbMid;
uniform vec3 uAmbPlay;
uniform vec3 uAmbFg;
uniform vec3 uFogColor;
uniform float uFogMid;
uniform vec3 uGroundFog;
uniform float uScatter;
uniform float uReflect;
uniform float uRipple;
in vec2 vUv;
layout(location = 0) out vec4 oC;
layout(location = 1) out vec4 oG;

vec2 screenToScene(vec2 uv){
  vec2 vp = vec2(uv.x, 1.0 - uv.y) * uView;
  vec2 c = (vp - uView * 0.5) / uZoom;
  return vec2(c.x * uRot.x - c.y * uRot.y, c.x * uRot.y + c.y * uRot.x) + uView * 0.5;
}
vec2 sceneToScreen(vec2 sp){
  vec2 c = sp - uView * 0.5;
  vec2 vp = vec2(c.x * uRot.x + c.y * uRot.y, -c.x * uRot.y + c.y * uRot.x) * uZoom + uView * 0.5;
  return vec2(vp.x / uView.x, 1.0 - vp.y / uView.y);
}
vec2 sceneToTex(vec2 sp){
  vec2 p = sp + uOffPlay + uPad;
  return vec2(p.x / uTexSize.x, 1.0 - p.y / uTexSize.y);
}

void compose(vec2 uv, bool soft, bool play, out vec3 col, out vec3 glow){
  vec4 f = texture(uFarC, uv);
  vec3 fg = texture(uFarG, uv).rgb;
  col = f.rgb * uAmbFar + fg;
  glow = fg;
  // The world's depth geometry arrives lit and fogged. What lies beyond the
  // middle distance goes under the mid layers; the rest goes over them.
  vec4 wc = vec4(0.0);
  vec4 wg = vec4(0.0);
  float wfar = 0.0;
  if (uWorldOn > 0.5) {
    vec4 wa;
    worldTap(uWorldC, uWorldG, uWorldA, uv, soft, wc, wg, wa);
    wfar = step(0.5, wa.b);
    col = mix(col, col * (1.0 - wc.a) + wc.rgb, wfar);
    glow = mix(glow, glow * (1.0 - wg.a) + wg.rgb, wfar);
  }
  vec4 m = texture(uMidC, uv);
  vec4 mg = texture(uMidG, uv);
  col = col * (1.0 - m.a) + m.rgb * uAmbMid + mg.rgb;
  glow = glow * (1.0 - mg.a) + mg.rgb;
  vec2 sp = screenToScene(uv);
  float fn = fbm(sp * vec2(0.006, 0.013) + vec2(uTime * 0.012, 0.0));
  float fa = clamp(uFogMid * (0.5 + 1.0 * fn), 0.0, 1.0);
  col = mix(col, uFogColor, fa);
  glow *= 1.0 - 0.45 * fa;
  // Open water lies behind the action: what it mirrors is the far side, not the quay and the people in front of it.
  if (!play) return;
  col = mix(col * (1.0 - wc.a) + wc.rgb, col, wfar);
  glow = mix(glow * (1.0 - wg.a) + wg.rgb, glow, wfar);
  vec4 p;
  vec4 pg;
  if (uPlayPre > 0.5) {
    // Out of focus: the play layer arrives already resolved and blurred.
    p = texture(uPlayRC, uv);
    pg = texture(uPlayRG, uv);
  } else {
    vec2 tuv = sceneToTex(sp);
    p = sharpTex(uPlayC, tuv);
    pg = sharpTex(uPlayG, tuv);
  }
  vec3 L = texture(uLight, uv).rgb;
  col = col * (1.0 - p.a) + p.rgb * (uAmbPlay + L) + pg.rgb;
  glow = glow * (1.0 - pg.a) + pg.rgb;
}

void main(){
  vec3 col, glow;
  compose(vUv, true, true, col, glow);
  vec2 sp = screenToScene(vUv);
  vec3 L = texture(uLight, vUv).rgb;

  // Wet-floor reflection. The mask stores, per pixel, how many rows it sits
  // below its mirror line (R) and how reflective it is (G).
  vec2 tuv = sceneToTex(sp);
  vec2 tpx = vec2(tuv.x, 1.0 - tuv.y) * uTexSize;
  ivec2 tc = ivec2(int(floor(tpx.x)), int(uTexSize.y) - 1 - int(floor(tpx.y)));
  tc = clamp(tc, ivec2(0), ivec2(uTexSize) - 1);
  vec4 mk = texelFetch(uMask, tc, 0);
  if (mk.g > 0.004 && uReflect > 0.0) {
    float row = mk.r * 255.0 - 1.0;
    float lineY = floor(tpx.y) - row;
    float d = tpx.y - lineY;
    float wob = vnoise(vec2(tpx.x * 0.11 + uTime * 0.5, d * 0.8 - uTime * 1.6)) - 0.5;
    float rp = wob * uRipple * (1.0 + d * 0.09);
    vec3 racc = vec3(0.0);
    vec3 gacc = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float k = float(i) - 1.0;
      vec2 mp = vec2(tpx.x + rp, lineY - d - k * (1.0 + d * 0.18));
      vec2 muv = sceneToScreen(mp - uOffPlay - uPad);
      vec3 c2, g2;
      compose(clamp(muv, vec2(0.0), vec2(1.0)), false, true, c2, g2);
      racc += c2;
      gacc += g2;
    }
    float fres = mk.g * uReflect * mix(1.0, 0.35, smoothstep(0.0, 46.0, d));
    col += racc * (fres / 3.0);
    glow += gacc * (fres / 3.0) * 0.6;
  }

  // The same for the world's floors, which have no mask: in front of the play
  // plane they mirror it about its ground line; beyond it, the far distance
  // about the horizon.
  if (uWorldOn > 0.5 && uReflect > 0.0) {
    vec4 wa = texture(uWorldA, vUv);
    vec4 here = sharpTex(uPlayC, sceneToTex(sp));
    // What stands in the middle distance stands in front of the far floor it covers.
    float over = 1.0 - texture(uMidC, vUv).a * step(0.5, wa.b);
    float wet = wa.g * (1.0 - here.a) * over;
    if (wet > 0.004) {
      bool water = wa.g > 0.95;
      float near = step(uFloorRow, sp.y);
      float axis = mix(uHorizonRow, uFloorRow, near);
      float d = abs(sp.y - axis);
      // Water smears a light into a long streak rather than shaking it sideways.
      float wob = vnoise(vec2(sp.x * 0.11 + uTime * 0.5, d * 0.8 - uTime * 1.6)) - 0.5;
      float rp = wob * uRipple * (water ? 0.55 + d * 0.012 : 1.0 + d * 0.06);
      float smear = water ? 0.3 : 0.14;
      vec3 racc = vec3(0.0);
      vec3 gacc = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        float k = float(i) - 1.0;
        vec2 mp = vec2(sp.x + rp, axis - (sp.y - axis) - k * (1.0 + d * smear));
        vec3 c2, g2;
        compose(clamp(sceneToScreen(mp), vec2(0.0), vec2(1.0)), false, !water, c2, g2);
        racc += c2;
        gacc += g2;
      }
      float fall = water ? mix(0.92, 0.62, smoothstep(20.0, 140.0, d)) : mix(1.0, 0.3, smoothstep(0.0, 70.0, d)) * mix(0.55, 1.0, near);
      float fres = wet * uReflect * fall;
      col += racc * (fres / 3.0);
      glow += gacc * (fres / 3.0) * 0.6;
    }
  }

  // Light scattering in the air: makes beams and halos visible in fog and rain.
  float sn = fbm(sp * vec2(0.014, 0.034) + vec2(uTime * 0.04, uTime * 0.013));
  col += L * uScatter * (0.3 + 1.15 * sn);

  // Low fog hugging the ground, picking up nearby light.
  float gfn = fbm(sp * vec2(0.011, 0.045) + vec2(-uTime * 0.025, 0.0));
  float gfa = uGroundFog.x * smoothstep(uGroundFog.y, uGroundFog.z, sp.y) * (0.35 + 1.1 * gfn);
  col = mix(col, uFogColor * 0.75 + L * 0.45, clamp(gfa, 0.0, 0.92));

  // Foreground thins out as a push-in carries the lens past it.
  vec4 g = texture(uFgC, vUv) * uFgFade;
  vec4 gg = texture(uFgG, vUv) * uFgFade;
  col = col * (1.0 - g.a) + g.rgb * (uAmbFg + L * 0.3) + gg.rgb;
  glow = glow * (1.0 - gg.a) + gg.rgb;

  oC = vec4(col, 1.0);
  oG = vec4(glow, 1.0);
}`;

/**
 * The world's depth geometry (floors, sides and tops of blocks, set-back
 * walls), projected through a perspective lens. The play plane sits at
 * depth 0 and is unaffected by any of this: the lens can shift its vanishing
 * point (to look down on the ground, or along a street) without the pixel art
 * in the play plane changing at all.
 */
export const VS_WORLD = `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aRect;
layout(location = 3) in vec4 aMat;
layout(location = 4) in vec3 aAvg;
uniform vec2 uEye;
uniform vec2 uVan;
uniform float uDz;
uniform float uFocal;
uniform vec2 uRot;
uniform vec2 uView;
out vec3 vPos;
out vec2 vUv;
out float vW;
flat out vec4 vRect;
flat out vec4 vMat;
flat out vec3 vAvg;
void main(){
  // w is distance from the lens in focal lengths: the play plane is at 1 / zoom.
  float w = (uDz + aPos.z) / uFocal;
  vec2 q = uVan * w + (aPos.xy - uEye);
  vec2 r = vec2(q.x * uRot.x + q.y * uRot.y, -q.x * uRot.y + q.y * uRot.x);
  const float near = 0.03;
  const float far = 90.0;
  float zc = (w * (far + near) - 2.0 * far * near) / (far - near);
  gl_Position = vec4(r.x / (uView.x * 0.5), -r.y / (uView.y * 0.5), zc, w);
  // A floor is the top of something solid: from below it, there is nothing to see.
  if (aMat.w >= 3.5 && uEye.y > aPos.y + 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vPos = aPos;
  vUv = aUv;
  vW = w;
  vRect = aRect;
  vMat = aMat;
  vAvg = aAvg;
}`;

export const WORLD_LIGHTS = 28;
export const WORLD_BLOBS = 16;

export const FS_WORLD =
  HEAD +
  NOISE +
  `
uniform sampler2D uAtlasC;
uniform sampler2D uAtlasG;
uniform vec2 uAtlasSize;
uniform vec3 uAmb;
uniform vec3 uFogColor;
uniform float uFogK;
uniform float uMidW;
uniform float uFocusInv;
uniform int uNL;
uniform vec4 uLpos[${28}];
uniform vec4 uLcol[${28}];
uniform vec4 uLcone[${28}];
uniform int uNB;
uniform vec4 uBlob[${16}];
in vec3 vPos;
in vec2 vUv;
in float vW;
flat in vec4 vRect;
flat in vec4 vMat;
flat in vec3 vAvg;
layout(location = 0) out vec4 oC;
layout(location = 1) out vec4 oG;
layout(location = 2) out vec4 oA;
void main(){
  float flags = vMat.w;
  bool isFloor = flags >= 3.5;
  flags -= isFloor ? 4.0 : 0.0;
  bool cut = flags >= 1.5;
  flags -= cut ? 2.0 : 0.0;
  bool tile = flags >= 0.5;

  // Pixel-art sampling: hard texels, softened by one output pixel at their edges.
  vec2 fw = max(fwidth(vUv), vec2(1e-5));
  vec2 t = tile ? mod(vUv, vRect.zw) : vUv;
  vec2 i = floor(t);
  vec2 f = t - i;
  vec2 sc = 1.0 / fw;
  vec2 st = clamp(f * sc, 0.0, 0.5) + clamp((f - 1.0) * sc + 0.5, 0.0, 0.5);
  vec2 tt = clamp(i + st, vec2(0.5), vRect.zw - 0.5);
  vec2 uv = (vRect.xy + tt) / uAtlasSize;
  uv.y = 1.0 - uv.y;
  vec4 c = texture(uAtlasC, uv);
  vec4 g = texture(uAtlasG, uv);
  if (cut && c.a < 0.5) discard;
  if (!cut) { c.rgb /= max(c.a, 0.001); c.a = 1.0; }
  // Too far away to resolve: settle to the texture's mean instead of shimmering.
  float foot = max(fw.x, fw.y);
  float flat_ = cut ? 0.0 : smoothstep(0.8, 2.2, foot);
  c.rgb = mix(c.rgb, vAvg * c.a, flat_);
  g.rgb *= 1.0 - flat_ * 0.6;

  // Open sky reaches what faces up; walls get what bounces.
  vec3 amb = uAmb * (isFloor ? 1.35 : 1.0);
  vec3 light = amb;
  for (int k = 0; k < uNL; k++) {
    vec3 d = vPos - uLpos[k].xyz;
    float dist = length(d);
    float a = pow(clamp(1.0 - dist / uLpos[k].w, 0.0, 1.0), uLcol[k].w);
    if (uLcone[k].w > -0.999) {
      float cd = dot(d / max(dist, 0.001), vec3(uLcone[k].xy, 0.0));
      a *= smoothstep(uLcone[k].w, uLcone[k].z, cd);
    }
    light += uLcol[k].rgb * a;
  }
  light = mix(amb, light, vMat.y);
  float shade = vMat.x;
  if (isFloor) {
    // Whoever stands on a floor leaves a soft patch of dark under them.
    for (int k = 0; k < uNB; k++) {
      vec4 b = uBlob[k];
      if (abs(vPos.y - b.y) > 3.0) continue;
      float e = length(vec2(vPos.x - b.x, (vPos.z - b.z) * 0.9)) / b.w;
      shade *= 1.0 - 0.5 * (1.0 - smoothstep(0.35, 1.0, e));
    }
  }
  vec3 col = c.rgb * light * shade + g.rgb;
  float fa = 1.0 - exp(-max(vPos.z, 0.0) * uFogK);
  // Water does not lie evenly: broad puddles, with merely damp ground between them.
  float wet = 0.0;
  if (isFloor && vMat.z > 1.5) {
    // Open water mirrors everywhere. (1.0 here is how the composite knows it from a wet floor.)
    wet = 1.0;
  } else if (isFloor && vMat.z > 0.0) {
    float pud = fbm(vPos.xz * vec2(0.021, 0.034));
    float pool = smoothstep(0.46, 0.6, pud);
    wet = min(0.9, vMat.z * mix(0.32, 1.0, pool) * (1.0 - fa));
    col *= mix(1.0, 0.72, pool);
  }
  col = mix(col, uFogColor * c.a, fa);
  oC = vec4(col, c.a);
  oG = vec4(g.rgb * (1.0 - 0.7 * fa), c.a);
  // How far out of focus: 0 at the focal distance, 1 at infinity (or right at the lens).
  float coc = clamp(abs(uFocusInv - 1.0 / vW) / max(uFocusInv, 0.35), 0.0, 1.0);
  oA = vec4(coc, wet, step(uMidW, vW), 1.0);
}`;

/** Dual-filter downsample (bloom). uTexel = 1 / source size. */
export const FS_DOWN =
  HEAD +
  `
uniform sampler2D uT;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 o;
void main(){
  vec4 s = texture(uT, vUv) * 4.0;
  s += texture(uT, vUv + uTexel * vec2(-1.0, -1.0));
  s += texture(uT, vUv + uTexel * vec2(1.0, -1.0));
  s += texture(uT, vUv + uTexel * vec2(-1.0, 1.0));
  s += texture(uT, vUv + uTexel * vec2(1.0, 1.0));
  o = s / 8.0;
}`;

/** Dual-filter upsample, blended additively into the next level up. */
export const FS_UP =
  HEAD +
  `
uniform sampler2D uT;
uniform vec2 uTexel;
uniform float uWeight;
in vec2 vUv;
out vec4 o;
void main(){
  vec4 s = texture(uT, vUv + uTexel * vec2(-2.0, 0.0));
  s += texture(uT, vUv + uTexel * vec2(2.0, 0.0));
  s += texture(uT, vUv + uTexel * vec2(0.0, -2.0));
  s += texture(uT, vUv + uTexel * vec2(0.0, 2.0));
  s += texture(uT, vUv + uTexel * vec2(-1.0, 1.0)) * 2.0;
  s += texture(uT, vUv + uTexel * vec2(1.0, 1.0)) * 2.0;
  s += texture(uT, vUv + uTexel * vec2(-1.0, -1.0)) * 2.0;
  s += texture(uT, vUv + uTexel * vec2(1.0, -1.0)) * 2.0;
  o = vec4(s.rgb / 12.0 * uWeight, 1.0);
}`;

/** Lens and film: bloom, streak, aberration, tone curve, grade, vignette, grain, bars, fades. */
export const FS_FINAL =
  HEAD +
  `
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform vec2 uOut;
uniform float uTime;
uniform float uBloomAmt;
uniform float uStreakAmt;
uniform float uAberr;
uniform float uVignette;
uniform float uGrain;
uniform float uLetterbox;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform vec4 uFade;
uniform float uFlash;
uniform float uWipe;
in vec2 vUv;
out vec4 o;
float hash21(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec3 shoulder(vec3 x){
  // Identity below the knee, smooth roll-off above it, so authored palette
  // values survive while bright lights bloom out instead of clipping.
  const float t = 0.72;
  vec3 hi = t + (1.0 - t) * tanh((x - t) / (1.0 - t));
  return mix(x, hi, step(t, x));
}
void main(){
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  vec2 ab = c * r2 * uAberr;
  vec3 col;
  col.r = texture(uScene, vUv + ab).r;
  col.g = texture(uScene, vUv).g;
  col.b = texture(uScene, vUv - ab).b;
  col += texture(uBloom, vUv).rgb * uBloomAmt;
  col += texture(uStreak, vUv).rgb * uStreakAmt * vec3(0.55, 0.78, 1.0);
  col *= uExposure;
  col = shoulder(max(col, 0.0));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;
  col += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l));
  col += uHighTint * smoothstep(0.45, 1.0, l);
  col *= 1.0 - uVignette * smoothstep(0.08, 0.62, r2);
  float g = hash21(vUv * uOut + fract(uTime * 7.31) * vec2(91.7, 37.3)) - 0.5;
  col += g * uGrain;
  col = mix(col, vec3(1.0), uFlash);
  col = mix(col, uFade.rgb, uFade.a);
  if (uWipe > 0.0) {
    // A soft dark shape crossing the lens: fully covers the frame at 0.5.
    float wc = mix(-0.95, 1.95, uWipe);
    float wx = vUv.x + (vUv.y - 0.5) * 0.18;
    col *= smoothstep(0.55, 0.75, abs(wx - wc));
  }
  float bar = step(vUv.y, uLetterbox) + step(1.0 - uLetterbox, vUv.y);
  col *= 1.0 - clamp(bar, 0.0, 1.0);
  o = vec4(max(col, 0.0), 1.0);
}`;
