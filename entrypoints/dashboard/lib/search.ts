import type { Bookmark } from '@/utils/bookmarks';
import { hostOf, timeOf } from './format';

export type SortKey = 'newest' | 'oldest' | 'site';
export type RangeKey = 'all' | '7d' | '30d' | '90d';

export interface Filters {
  query: string;
  /** Clave de carpeta (ver FolderInfo.key), LOOSE o null = todas. */
  folder: string | null;
  onlyImages: boolean;
  range: RangeKey;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = { query: '', folder: null, onlyImages: false, range: 'all', sort: 'newest' };

const DAYS: Record<RangeKey, number> = { all: 0, '7d': 7, '30d': 30, '90d': 90 };

export function activeFilterCount(f: Filters): number {
  return (f.query.trim() ? 1 : 0) + (f.folder ? 1 : 0) + (f.onlyImages ? 1 : 0) + (f.range !== 'all' ? 1 : 0);
}

/**
 * Filtra y ordena. `folderIds` ya viene resuelto (null = sin filtro de carpeta).
 * Para agregar un filtro nuevo: campo en Filters + una línea aquí + un control en NotesToolbar.
 */
export function applyFilters(
  items: Bookmark[],
  f: Filters,
  folderIds: Set<string> | null,
  folderOf: Map<string, string>,
): Bookmark[] {
  const terms = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const since = f.range === 'all' ? 0 : Date.now() - DAYS[f.range] * 86_400_000;

  const out = items.filter((b) => {
    if (folderIds && !folderIds.has(b.id)) return false;
    if (since && timeOf(b) < since) return false;
    if (f.onlyImages && !(b.image || b.images?.length)) return false;
    if (terms.length) {
      const hay = [b.note, b.quote, b.title, b.url, b.folder, folderOf.get(b.id)].filter(Boolean).join('\n').toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  if (f.sort === 'oldest') out.sort((a, b) => timeOf(a) - timeOf(b));
  else if (f.sort === 'site') out.sort((a, b) => hostOf(a.url).localeCompare(hostOf(b.url)) || timeOf(b) - timeOf(a));
  else out.sort((a, b) => timeOf(b) - timeOf(a));
  return out;
}
