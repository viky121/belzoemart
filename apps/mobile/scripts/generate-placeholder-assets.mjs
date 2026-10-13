// Rasterises apps/web/public/belzo-logo.svg into the PLACEHOLDER launcher icon, adaptive-icon
// foreground and splash icon (design §3.3). These are placeholders: the owner must supply the
// official master logo. Run with `pnpm --filter @belzo/mobile assets:placeholder`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = resolve(here, '..');
const svgPath = resolve(mobileRoot, '../web/public/belzo-logo.svg');
const outDir = resolve(mobileRoot, 'assets/placeholder');

const svg = readFileSync(svgPath, 'utf8');
const VIEWBOX = 520; // the source viewBox is 0 0 520 520

/** Wrap the logo in a square canvas, scaling it to `scale` of the canvas and centring it. */
function framed(canvas, scale, background) {
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const size = canvas * scale;
  const offset = (canvas - size) / 2;
  const k = size / VIEWBOX;
  const bg = background ? `<rect width="${canvas}" height="${canvas}" fill="${background}"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">` +
    `${bg}<g transform="translate(${offset} ${offset}) scale(${k})">${inner}</g></svg>`
  );
}

function render(source, width) {
  const resvg = new Resvg(source, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
  });
  return resvg.render().asPng();
}

const outputs = [
  // Launcher icon: full logo on white, small margin.
  ['icon-PLACEHOLDER.png', framed(1024, 0.9, '#ffffff'), 1024],
  // Adaptive foreground: logo at 66% (safe zone) on a transparent canvas; background is #ffffff.
  ['adaptive-foreground-PLACEHOLDER.png', framed(1024, 0.66, null), 1024],
  // Splash icon: transparent, rendered on the #ffffff splash background.
  ['splash-icon-PLACEHOLDER.png', framed(512, 1, null), 512],
];

mkdirSync(outDir, { recursive: true });
for (const [name, source, width] of outputs) {
  const png = render(source, width);
  writeFileSync(resolve(outDir, name), png);
  console.log(`assets:placeholder wrote ${name} (${width}x${width}, ${png.length} bytes)`);
}
