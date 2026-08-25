/**
 * Repack the deck model: 4096² PNG textures -> downscaled WebP (EXT_texture_webp).
 *
 * Reads the untouched 33 MB master at the repo root — which is gitignored, so a
 * fresh clone ships the packed result rather than regenerating it.
 * Geometry is left untouched (16k tris, <1 MB — not worth compressing).
 *
 *   node tools/glbpack.mjs 2048 public/models/deck.glb
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SIZE = Number(process.argv[2] || 2048);
const OUT = process.argv[3] || 'public/models/deck.glb';
const SRC = process.env.GLB_SRC || 'sci_fi_tv_with_camera_alternative_90s.glb';

// Normal maps carry geometry in their colour channels — lossy artifacts there
// read as shading errors, so they get a much higher quality floor.
const QUALITY = { normal: 94, baseColor: 82, emissive: 82, occlusion: 80, default: 82 };

const buf = readFileSync(SRC);
let off = 12, g = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  if (type === 0x4E4F534A) g = JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8'));
  else bin = buf.slice(off + 8, off + 8 + len);
  off += 8 + len;
}

// Map image index -> material slot, so each gets the right quality.
const slot = {};
for (const m of g.materials) {
  const tag = (o, label) => { if (o && o.index !== undefined) slot[g.textures[o.index].source] = label; };
  tag(m.pbrMetallicRoughness?.baseColorTexture, 'baseColor');
  tag(m.pbrMetallicRoughness?.metallicRoughnessTexture, 'metallicRoughness');
  tag(m.normalTexture, 'normal');
  tag(m.occlusionTexture, 'occlusion');
  tag(m.emissiveTexture, 'emissive');
}

const view = (i) => {
  const bv = g.bufferViews[i], o = bv.byteOffset || 0;
  return bin.slice(o, o + bv.byteLength);
};

// Re-encode every image; remember which bufferView each one occupies.
const replacement = new Map();
for (let i = 0; i < g.images.length; i++) {
  const im = g.images[i];
  const kind = slot[i] || 'default';
  const q = QUALITY[kind] ?? QUALITY.default;
  const src = view(im.bufferView);
  const out = await sharp(src)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .webp({ quality: q, effort: 6 })
    .toBuffer();
  replacement.set(im.bufferView, out);
  console.log(
    `  [${i}] ${kind.padEnd(18)} q${q}  ${(src.length / 1048576).toFixed(2).padStart(6)} MB -> ` +
    `${(out.length / 1024).toFixed(0).padStart(5)} KB  (${(src.length / out.length).toFixed(0)}x)`
  );
  im.mimeType = 'image/webp';
}

// Rebuild the BIN chunk, substituting new image bytes and re-offsetting everything.
const chunks = [];
let cursor = 0;
g.bufferViews.forEach((bv, i) => {
  const data = replacement.get(i) ?? view(i);
  const pad = (4 - (cursor % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); cursor += pad; }
  bv.byteOffset = cursor;
  bv.byteLength = data.length;
  chunks.push(data);
  cursor += data.length;
});
const newBin = Buffer.concat(chunks);
g.buffers[0].byteLength = newBin.length;

// Point every texture at its WebP image through the extension.
g.extensionsUsed = [...new Set([...(g.extensionsUsed || []), 'EXT_texture_webp'])];
g.extensionsRequired = [...new Set([...(g.extensionsRequired || []), 'EXT_texture_webp'])];
for (const t of g.textures) {
  t.extensions = { ...(t.extensions || {}), EXT_texture_webp: { source: t.source } };
  delete t.source;
}

// Reassemble: header + JSON chunk (space-padded) + BIN chunk (zero-padded).
const jsonBuf = Buffer.from(JSON.stringify(g), 'utf8');
const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
const binPad = Buffer.alloc((4 - (newBin.length % 4)) % 4, 0);
const jsonChunk = Buffer.concat([jsonBuf, jsonPad]);
const binChunk = Buffer.concat([newBin, binPad]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546C67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonChunk.length, 0); jh.writeUInt32LE(0x4E4F534A, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binChunk.length, 0); bh.writeUInt32LE(0x004E4942, 4);
writeFileSync(OUT, Buffer.concat([header, jh, jsonChunk, bh, binChunk]));
console.log(`  => ${OUT}  ${(buf.length / 1048576).toFixed(2)} MB -> ${((12 + 8 + jsonChunk.length + 8 + binChunk.length) / 1048576).toFixed(2)} MB`);
