import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeToKTX2 } from 'ktx2-encoder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'textures', 'ktx2');
const SIZE = 512;
const TAU = Math.PI * 2;
const KTX2_MAGIC = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Computes periodic tileable height value in [0, 1] for anatomical PBR surfaces.
 */
function sampleHeight(kind, x, y) {
  const u = x / SIZE;
  const v = y / SIZE;

  if (kind === 'bone') {
    // Cortical lamellar osteon grain + fine longitudinal micro-porosity
    const grain =
      0.34 * Math.sin(TAU * (u * 5 + 0.15 * Math.sin(TAU * v * 2))) +
      0.22 * Math.sin(TAU * (u * 13 - v * 2)) +
      0.16 * Math.cos(TAU * (v * 9 + u * 3));
    const pores =
      0.14 * Math.sin(TAU * (u * 23 + v * 17)) * Math.cos(TAU * (v * 19 - u * 11)) +
      0.1 * Math.sin(TAU * (u * 37 + v * 29));
    return 0.5 + 0.38 * grain + 0.25 * pores;
  }

  if (kind === 'organ') {
    // Soft visceral serosal lobules + delicate vascular micro-capillary relief
    const lobule =
      0.42 * Math.sin(TAU * u * 4) * Math.cos(TAU * v * 4) +
      0.26 * Math.sin(TAU * (u * 7 + v * 5)) * Math.cos(TAU * (v * 8 - u * 3));
    const sheenWave =
      0.18 * Math.sin(TAU * (u * 11 - v * 9)) +
      0.14 * Math.cos(TAU * (u * 17 + v * 15));
    return 0.5 + 0.36 * lobule + 0.22 * sheenWave;
  }

  // Muscle: long parallel myofibril fascicles + cross-sarcomere striping
  const fascicles =
    0.5 * Math.sin(TAU * (u * 16 + 0.18 * Math.sin(TAU * v * 2))) +
    0.26 * Math.sin(TAU * (u * 32 - 0.1 * Math.cos(TAU * v * 3)));
  const striations = 0.14 * Math.sin(TAU * (v * 24 + u * 2));
  return 0.5 + 0.38 * fascicles + 0.22 * striations;
}

function generateHeightField(kind) {
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      h[y * SIZE + x] = sampleHeight(kind, x, y);
    }
  }
  return h;
}

/**
 * Converts a periodic heightfield into a seamless tangent-space normal map RGBA8 buffer.
 */
function heightToNormalRgba(height, strength) {
  const out = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const ym = (y - 1 + SIZE) % SIZE;
    const yp = (y + 1) % SIZE;
    for (let x = 0; x < SIZE; x++) {
      const xm = (x - 1 + SIZE) % SIZE;
      const xp = (x + 1) % SIZE;

      // Sobel 3x3 periodic filter
      const tl = height[ym * SIZE + xm];
      const t = height[ym * SIZE + x];
      const tr = height[ym * SIZE + xp];
      const l = height[y * SIZE + xm];
      const r = height[y * SIZE + xp];
      const bl = height[yp * SIZE + xm];
      const b = height[yp * SIZE + x];
      const br = height[yp * SIZE + xp];

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;

      let nx = -dx;
      let ny = -dy;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * SIZE + x) * 4;
      out[idx] = clampByte((nx * 0.5 + 0.5) * 255);
      out[idx + 1] = clampByte((ny * 0.5 + 0.5) * 255);
      out[idx + 2] = clampByte((nz * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }
  return out;
}

/**
 * Generates a linear scalar roughness map RGBA8 buffer (Three.js reads G channel).
 */
function heightToRoughnessRgba(height, minVal, maxVal) {
  const out = new Uint8Array(SIZE * SIZE * 4);
  const span = maxVal - minVal;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const t = Math.max(0, Math.min(1, height[i]));
    const val = clampByte((minVal + t * span) * 255);
    const p = i * 4;
    out[p] = val;
    out[p + 1] = val;
    out[p + 2] = val;
    out[p + 3] = 255;
  }
  return out;
}

function assertKtx2Magic(bytes, name) {
  for (let i = 0; i < KTX2_MAGIC.length; i++) {
    if (bytes[i] !== KTX2_MAGIC[i]) {
      throw new Error(`Invalid KTX2 header magic on ${name}`);
    }
  }
}

async function encodeMap(fileName, rgba, isNormalMap) {
  const ktx2 = await encodeToKTX2(rgba, {
    isUASTC: true,
    isKTX2File: true,
    needSupercompression: true,
    enableRDO: true,
    rdoQualityLevel: 1.5,
    generateMipmap: true,
    isNormalMap,
    isPerceptual: false,
    isSetKTX2SRGBTransferFunc: false,
    imageDecoder: async (buf) => ({
      width: SIZE,
      height: SIZE,
      data: buf,
    }),
  });

  assertKtx2Magic(ktx2, fileName);
  const outPath = path.join(OUT_DIR, fileName);
  await writeFile(outPath, ktx2);
  console.log(
    `[KTX2] ${fileName.padEnd(22)} ${(rgba.length / 1024).toFixed(0).padStart(4)} KB RGBA -> ${(ktx2.length / 1024).toFixed(1).padStart(6)} KB (UASTC+Zstd+Mips)`
  );
  return {
    file: fileName,
    width: SIZE,
    height: SIZE,
    isNormalMap,
    encoding: 'UASTC+Zstd+Mipmaps',
    rawBytes: rgba.length,
    ktx2Bytes: ktx2.length,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const boneH = generateHeightField('bone');
  const organH = generateHeightField('organ');
  const muscleH = generateHeightField('muscle');

  const entries = {};
  entries['bone-normal.ktx2'] = await encodeMap(
    'bone-normal.ktx2',
    heightToNormalRgba(boneH, 1.35),
    true
  );
  entries['bone-roughness.ktx2'] = await encodeMap(
    'bone-roughness.ktx2',
    heightToRoughnessRgba(boneH, 0.34, 0.58),
    false
  );
  entries['organ-normal.ktx2'] = await encodeMap(
    'organ-normal.ktx2',
    heightToNormalRgba(organH, 1.15),
    true
  );
  entries['organ-roughness.ktx2'] = await encodeMap(
    'organ-roughness.ktx2',
    heightToRoughnessRgba(organH, 0.22, 0.46),
    false
  );
  entries['muscle-normal.ktx2'] = await encodeMap(
    'muscle-normal.ktx2',
    heightToNormalRgba(muscleH, 1.65),
    true
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    resolution: `${SIZE}x${SIZE}`,
    format: 'KTX2 Basis Universal UASTC',
    textures: entries,
  };

  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );

  const totalKtx2 = Object.values(entries).reduce((s, e) => s + e.ktx2Bytes, 0);
  console.log(
    `\nKTX2 PBR pipeline ready: ${Object.keys(entries).length} maps | Total ${(totalKtx2 / 1024).toFixed(1)} KB.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
