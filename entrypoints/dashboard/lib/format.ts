import type { Bookmark } from '@/utils/bookmarks';

export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
};

export const fmtDate = (ms: number) =>
  ms && isFinite(ms) ? new Date(ms).toLocaleDateString('es-PE', { dateStyle: 'medium' }) : '—';

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const mb = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;

/** Primera imagen disponible de la nota (captura de región o imagen guardada). */
export const thumbOf = (b: Bookmark) => b.image ?? b.images?.[0] ?? null;

export const titleOf = (b: Bookmark) => b.title?.trim() || hostOf(b.url);

export const imageCount = (b: Bookmark) => (b.image ? 1 : 0) + (b.images?.length ?? 0);

export const timeOf = (b: Bookmark) => Date.parse(b.date) || 0;
