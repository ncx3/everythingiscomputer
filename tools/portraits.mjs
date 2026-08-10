/**
 * Portraits ship as archive photographs, not press shots.
 *
 * Source images are 0.6–16 MB at up to 4000px square, which is unshippable.
 * This crops each to a square, resizes to 640px, and writes WebP. The green
 * duotone is applied at render time on the canvas, not baked in here, so the
 * palette stays tunable without reprocessing.
 *
 *   node tools/portraits.mjs
 */

import sharp from 'sharp';
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SRC = 'content/personnel';
const OUT = 'public/portraits';
const SIZE = 640;

const SLUGS = {
  'federico zurani': 'federico-zurani',
  'laura cugusi': 'laura-cugusi',
  'machine yearning': 'machine-yearning',
};

await mkdir(OUT, { recursive: true });

const dirs = (await readdir(SRC, { withFileTypes: true })).filter((d) => d.isDirectory());

for (const dir of dirs) {
  const slug = SLUGS[dir.name.toLowerCase()];
  if (!slug) {
    console.warn(`skipped: no slug mapped for "${dir.name}"`);
    continue;
  }

  const files = (await readdir(path.join(SRC, dir.name))).filter((f) =>
    /\.(png|jpe?g|webp)$/i.test(f) && !f.includes('Zone.Identifier')
  );
  if (!files.length) {
    console.warn(`skipped: no image in "${dir.name}"`);
    continue;
  }

  // If a folder ever holds more than one, take the largest — that's the master.
  let src = path.join(SRC, dir.name, files[0]);
  if (files.length > 1) {
    const sized = await Promise.all(
      files.map(async (f) => {
        const p = path.join(SRC, dir.name, f);
        return { p, size: (await stat(p)).size };
      })
    );
    src = sized.sort((a, b) => b.size - a.size)[0].p;
  }

  const dest = path.join(OUT, `${slug}.webp`);
  const before = (await stat(src)).size;

  const meta = await sharp(src).metadata();
  await sharp(src)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'attention' })
    .webp({ quality: 82 })
    .toFile(dest);

  const after = (await stat(dest)).size;
  console.log(
    `${slug.padEnd(18)} ${meta.width}x${meta.height} ${(before / 1024 / 1024).toFixed(2)} MB` +
      `  ->  ${SIZE}x${SIZE} ${(after / 1024).toFixed(0)} KB` +
      `  (${(before / after).toFixed(0)}x smaller)`
  );
}
