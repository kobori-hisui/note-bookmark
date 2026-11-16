import type { Bookmark } from '@/utils/bookmarks';
import type { FolderInfo } from '../store/bookmarks';
import { hostOf, imageCount } from './format';
import { storageStats } from './images';

export interface Stats {
  total: number;
  withImage: number;
  images: number;
  sites: number;
  folders: number;
  bytes: number;
  perDay: { day: string; n: number }[];
  topSites: { name: string; n: number }[];
  topFolders: { name: string; n: number }[];
}

const dayKey = (d: Date) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local

export function computeStats(items: Bookmark[], folders: FolderInfo[], days = 30): Stats {
  const bySite = new Map<string, number>();
  const byDay = new Map<string, number>();
  let withImage = 0;
  let images = 0;

  for (const b of items) {
    const h = hostOf(b.url);
    bySite.set(h, (bySite.get(h) ?? 0) + 1);
    const t = new Date(b.date);
    if (!isNaN(t.getTime())) byDay.set(dayKey(t), (byDay.get(dayKey(t)) ?? 0) + 1);
    const n = imageCount(b);
    if (n) withImage++;
    images += n;
  }

  const perDay: Stats['perDay'] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(d);
    perDay.push({ day: k, n: byDay.get(k) ?? 0 });
  }

  const top = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, n]) => ({ name, n }));

  return {
    total: items.length,
    withImage,
    images,
    sites: bySite.size,
    folders: folders.length,
    bytes: storageStats(items).bytes,
    perDay,
    topSites: top(bySite),
    topFolders: folders
      .filter((f) => f.ownCount > 0) // solo notas propias: así un padre no repite lo de sus hijas
      .sort((a, b) => b.ownCount - a.ownCount)
      .slice(0, 10)
      .map((f) => ({ name: f.label, n: f.ownCount })),
  };
}
