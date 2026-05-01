import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readPngSize(pngBuffer) {
  if (pngBuffer.length < 24) throw new Error('Invalid PNG: too small');
  if (
    pngBuffer[0] !== 0x89 ||
    pngBuffer[1] !== 0x50 ||
    pngBuffer[2] !== 0x4e ||
    pngBuffer[3] !== 0x47 ||
    pngBuffer[4] !== 0x0d ||
    pngBuffer[5] !== 0x0a ||
    pngBuffer[6] !== 0x1a ||
    pngBuffer[7] !== 0x0a
  ) {
    throw new Error('Invalid PNG signature');
  }
  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  return { width, height };
}

function collectIconSizes(manifest) {
  const sizes = new Set();

  const addFromIconMap = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [sizeKey, filePath] of Object.entries(value)) {
      if (typeof filePath !== 'string' || !filePath.endsWith('.png')) continue;
      const size = Number(sizeKey);
      if (Number.isInteger(size) && size > 0) sizes.add(size);
    }
  };

  addFromIconMap(manifest.icons);
  addFromIconMap(manifest.action?.default_icon);

  for (const item of manifest.web_accessible_resources ?? []) {
    if (!item || !Array.isArray(item.resources)) continue;
    for (const resource of item.resources) {
      if (typeof resource !== 'string') continue;
      const match = resource.match(/icon-(\d+)\.png$/);
      if (match) sizes.add(Number(match[1]));
    }
  }

  return Array.from(sizes).sort((a, b) => a - b);
}

async function readExistingFile(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function isBufferEqual(a, b) {
  if (!a || a.length !== b.length) return false;
  return a.equals(b);
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const assetsDir = path.join(projectRoot, 'public', 'assets');
  const svgPath = path.join(assetsDir, 'icon.svg');
  const manifestPath = path.join(projectRoot, 'manifest.json');
  const svg = await readFile(svgPath, 'utf8');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

  const sizes = collectIconSizes(manifest);
  if (sizes.length === 0) {
    throw new Error('No PNG icon sizes found in manifest.json');
  }

  const written = [];
  const unchanged = [];

  for (const size of sizes) {
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: size },
      background: 'rgba(0,0,0,0)',
    });
    const pngBuffer = Buffer.from(resvg.render().asPng());
    const { width, height } = readPngSize(pngBuffer);
    if (width !== size || height !== size) {
      throw new Error(`Unexpected PNG size for ${size}: got ${width}x${height}`);
    }

    const outPath = path.join(assetsDir, `icon-${size}.png`);
    const existing = await readExistingFile(outPath);
    if (isBufferEqual(existing, pngBuffer)) {
      unchanged.push(size);
      continue;
    }

    await writeFile(outPath, pngBuffer);
    written.push(size);
  }

  process.stdout.write(`Icon sizes: ${sizes.join(', ')}\n`);
  process.stdout.write(`Written: ${written.length > 0 ? written.map((s) => `icon-${s}.png`).join(', ') : 'none'}\n`);
  process.stdout.write(`Unchanged: ${unchanged.length > 0 ? unchanged.map((s) => `icon-${s}.png`).join(', ') : 'none'}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
