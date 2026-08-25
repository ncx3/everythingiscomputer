import { readFileSync } from 'node:fs';
import sharp from 'sharp';
const parse = (p) => {
  const buf = readFileSync(p); let off = 12, g = null, bin = null;
  while (off < buf.length) { const len = buf.readUInt32LE(off), t = buf.readUInt32LE(off+4);
    if (t === 0x4E4F534A) g = JSON.parse(buf.slice(off+8, off+8+len).toString('utf8'));
    else bin = buf.slice(off+8, off+8+len); off += 8+len; }
  return { buf, g, bin };
};
const A = parse(process.env.GLB_SRC || 'sci_fi_tv_with_camera_alternative_90s.glb');
const B = parse(process.argv[2]);
const bytes = (m, i) => { const bv = m.g.bufferViews[i], o = bv.byteOffset||0; return m.bin.slice(o, o+bv.byteLength); };
let fail = 0;
const ok = (c, msg) => { console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${msg}`); if (!c) fail++; };

// 1. geometry must survive untouched
let geoChecked = 0, geoSame = true;
for (const acc of A.g.accessors) {
  if (acc.bufferView === undefined) continue;
  if (!bytes(A, acc.bufferView).equals(bytes(B, acc.bufferView))) geoSame = false;
  geoChecked++;
}
ok(geoSame, `all ${geoChecked} accessors byte-identical to original`);

// 2. structural integrity
ok(B.g.buffers[0].byteLength === B.bin.length || B.g.buffers[0].byteLength === B.bin.length - ((4-(B.g.buffers[0].byteLength%4))%4),
   `buffer byteLength ${B.g.buffers[0].byteLength} consistent with BIN ${B.bin.length}`);
ok(B.g.bufferViews.every(bv => (bv.byteOffset||0) + bv.byteLength <= B.bin.length), 'all bufferViews within BIN');
ok(B.g.meshes.length === A.g.meshes.length && B.g.materials.length === A.g.materials.length,
   `meshes ${B.g.meshes.length} and materials ${B.g.materials.length} preserved`);

// 3. webp wiring
ok(B.g.extensionsRequired?.includes('EXT_texture_webp'), 'EXT_texture_webp in extensionsRequired');
ok(B.g.textures.every(t => t.extensions?.EXT_texture_webp?.source !== undefined), 'every texture routed through the extension');
ok(B.g.textures.every(t => t.source === undefined), 'no stale PNG source left on textures');

// 4. images actually decode
for (let i = 0; i < B.g.images.length; i++) {
  const im = B.g.images[i];
  const md = await sharp(bytes(B, im.bufferView)).metadata();
  ok(md.format === 'webp', `image[${i}] decodes: ${md.format} ${md.width}x${md.height}, mimeType ${im.mimeType}`);
}
console.log(fail ? `\n  ${fail} CHECK(S) FAILED` : '\n  all checks passed');
process.exit(fail ? 1 : 0);
