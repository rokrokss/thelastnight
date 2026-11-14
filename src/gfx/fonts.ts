import g11 from 'galmuri/dist/Galmuri11.woff2?url';
import g11b from 'galmuri/dist/Galmuri11-Bold.woff2?url';
import g14 from 'galmuri/dist/Galmuri14.woff2?url';
import g7 from 'galmuri/dist/Galmuri7.woff2?url';
import g9 from 'galmuri/dist/Galmuri9.woff2?url';

/**
 * Galmuri (SIL OFL 1.1) is the game's only typeface: it draws the in-world
 * Hangul signage and the UI. It must be ready before any art is generated.
 */
export async function loadFonts(): Promise<void> {
  const defs: [string, string, FontFaceDescriptors][] = [
    ['Galmuri7', g7, {}],
    ['Galmuri9', g9, {}],
    ['Galmuri11', g11, { weight: '400' }],
    ['Galmuri11', g11b, { weight: '700' }],
    ['Galmuri14', g14, {}],
  ];
  await Promise.all(
    defs.map(async ([family, url, desc]) => {
      const face = new FontFace(family, `url(${url})`, desc);
      await face.load();
      document.fonts.add(face);
    }),
  );
}
