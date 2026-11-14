/** Colour helpers. Colours are '#rrggbb' strings throughout the art code. */

export type RGB = [number, number, number];

const cache = new Map<string, RGB>();

export function rgb(hex: string): RGB {
  let v = cache.get(hex);
  if (!v) {
    const h = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
    const n = parseInt(h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    cache.set(hex, v);
  }
  return v;
}

const h2 = (n: number): string => {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return (v < 16 ? '0' : '') + v.toString(16);
};

export const toHex = (r: number, g: number, b: number): string => '#' + h2(r) + h2(g) + h2(b);

export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** Multiply brightness. k > 1 brightens (clamped). */
export function shade(c: string, k: number): string {
  const A = rgb(c);
  return toHex(A[0] * k, A[1] * k, A[2] * k);
}

/** 0..1 float triple for shader uniforms, with an intensity multiplier. */
export function vec3(c: string, k = 1): [number, number, number] {
  const A = rgb(c);
  return [(A[0] / 255) * k, (A[1] / 255) * k, (A[2] / 255) * k];
}
