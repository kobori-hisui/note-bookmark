import { applyImagePatches, type Bookmark } from '@/utils/bookmarks';

export const isHttp = (s: string) => /^https?:\/\//i.test(s);

export interface StorageStats {
  notes: number;
  downloaded: number;
  links: number;
  bytes: number;
}

/** Cuánto ocupan las imágenes de las notas (base64 -> bytes aproximados). */
export function storageStats(items: Bookmark[]): StorageStats {
  let downloaded = 0;
  let links = 0;
  let bytes = 0;
  for (const b of items) {
    for (const s of b.images ?? []) {
      if (isHttp(s)) links++;
      else {
        downloaded++;
        bytes += s.length * 0.75;
      }
    }
    if (b.image) bytes += b.image.length * 0.75;
  }
  return { notes: items.length, downloaded, links, bytes };
}

/** Descarga (vía background, sin CORS) las imágenes que hoy son solo enlace. Guarda por tandas. */
export async function downloadAllImages(
  items: Bookmark[],
  onProgress: (done: number, total: number) => void,
): Promise<{ total: number; failed: number }> {
  const targets = items.filter((b) => b.images?.some(isHttp));
  const total = targets.reduce((n, b) => n + (b.images ?? []).filter(isHttp).length, 0);
  if (!total) return { total: 0, failed: 0 };

  let done = 0;
  let failed = 0;
  let patches: Record<string, string[]> = {};
  let batch = 0;

  for (const b of targets) {
    const out = [...(b.images ?? [])];
    for (let i = 0; i < out.length; i += 4) {
      await Promise.all(
        out.slice(i, i + 4).map(async (s, k) => {
          if (!isHttp(s)) return;
          const res = await browser.runtime.sendMessage({ type: 'fetch-image', url: s }).catch(() => null);
          if (typeof res?.dataUrl === 'string') out[i + k] = res.dataUrl;
          else failed++;
          done++;
          onProgress(done, total);
        }),
      );
    }
    patches[b.id] = out;
    if (++batch % 10 === 0) {
      await applyImagePatches(patches);
      patches = {};
    }
  }
  if (Object.keys(patches).length) await applyImagePatches(patches);
  return { total, failed };
}

/** Qué copias descargadas se pueden volver a "solo enlace" (solo si se conoce la URL original). */
export function planStrip(items: Bookmark[]): { patches: Record<string, string[]>; count: number } {
  const patches: Record<string, string[]> = {};
  let count = 0;
  for (const b of items) {
    if (!b.images?.length) continue;
    const out = b.images.map((s, i) => {
      const src = b.imageSrcs?.[i];
      if (!isHttp(s) && src && isHttp(src)) {
        count++;
        return src;
      }
      return s;
    });
    if (out.some((s, i) => s !== b.images![i])) patches[b.id] = out;
  }
  return { patches, count };
}

export const applyStrip = (patches: Record<string, string[]>) => applyImagePatches(patches);
