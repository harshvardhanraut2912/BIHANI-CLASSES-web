// Server-only helper: lists gallery images straight from the /public folder.
//
//   public/images/gallery/posters/image1.png, image2.png ...      -> banner carousel
//   public/images/gallery/albums/<album-folder>/image1.png ...    -> one album per folder
//
// Just drop files named image1, image2, image3 ... (png, jpg, jpeg, webp, avif, gif)
// into a folder and they appear on /gallery. Numbers don't have to be continuous.
// This runs at build time (and on every request in `npm run dev`), so after adding
// new images redeploy / rebuild the site.
import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'public', 'images', 'gallery');
const URL_ROOT = '/images/gallery';
const IMAGE_RE = /^image(\d+)\.(png|jpe?g|webp|avif|gif)$/i;

/* Optional pretty names, colours and descriptions for album folders.
   Any NEW folder inside albums/ is picked up automatically even if it is not listed here. */
const ALBUM_META = {
  'mht-cet-2026': { label: 'MHT-CET 2026', accent: '#e0242c', blurb: 'Results, toppers and celebrations from our MHT-CET 2026 batch.' },
  classroom: { label: 'Classroom', accent: '#12a0ee', blurb: 'Inside our lectures, doubt-solving sessions and test days.' },
  awards: { label: 'Awards', accent: '#f2b01d', blurb: 'Recognitions and honours earned by our students and classes.' },
  achievements: { label: 'Achievements', accent: '#2fae8a', blurb: 'Milestones, ranks and proud moments from Bihani Chemistry Classes.' },
};
const FALLBACK_ACCENTS = ['#6a49b8', '#ef5a24', '#1d9fb0', '#4a5cc4', '#bfd930'];

function readHeader(file, bytes) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(bytes);
    const n = fs.readSync(fd, buf, 0, bytes, 0);
    return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

/* Reads width/height from the file header so the page can reserve space (no layout jump). */
function sizeOf(file) {
  try {
    const ext = path.extname(file).toLowerCase();
    if (ext === '.png') {
      const b = readHeader(file, 32);
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      const b = readHeader(file, 512 * 1024);
      let i = 2;
      while (i < b.length - 9) {
        if (b[i] !== 0xff) { i += 1; continue; }
        const m = b[i + 1];
        if (m === 0xff) { i += 1; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
        }
        i += 2 + b.readUInt16BE(i + 2);
      }
      return null;
    }
    if (ext === '.webp') {
      const b = readHeader(file, 40);
      const type = b.toString('ascii', 12, 16);
      if (type === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (type === 'VP8L') {
        return { w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
      }
      if (type === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    }
  } catch (e) { /* unreadable header: the browser will size it instead */ }
  return null;
}

function listImages(dir, urlBase) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return []; }
  return names
    .map((name) => ({ name, m: name.match(IMAGE_RE) }))
    .filter((x) => x.m)
    .sort((a, b) => Number(a.m[1]) - Number(b.m[1]))
    .map(({ name }) => {
      const size = sizeOf(path.join(dir, name));
      return { src: `${urlBase}/${name}`, w: size?.w || null, h: size?.h || null };
    });
}

const prettify = (slug) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function getPosters() {
  return listImages(path.join(ROOT, 'posters'), `${URL_ROOT}/posters`);
}

export function getAlbums() {
  const dir = path.join(ROOT, 'albums');
  let folders = [];
  try { folders = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch (e) { return []; }
  const known = Object.keys(ALBUM_META);
  const ordered = [...known.filter((k) => folders.includes(k)), ...folders.filter((k) => !known.includes(k)).sort()];
  return ordered.map((slug, idx) => {
    const meta = ALBUM_META[slug] || {};
    return {
      slug,
      label: meta.label || prettify(slug),
      accent: meta.accent || FALLBACK_ACCENTS[idx % FALLBACK_ACCENTS.length],
      blurb: meta.blurb || '',
      images: listImages(path.join(dir, slug), `${URL_ROOT}/albums/${slug}`),
    };
  });
}
