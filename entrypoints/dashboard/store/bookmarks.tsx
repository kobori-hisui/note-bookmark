import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { bookmarksItem, type Bookmark } from '@/utils/bookmarks';
import { folderLabel, folderName, groupBookmarks } from '@/utils/folders';

/** Una carpeta (manual o automática) lista para pintar. */
export interface FolderInfo {
  key: string;
  label: string; // ruta completa ("notes-init/case-use") en las manuales
  name: string; // último nivel de la ruta ("case-use")
  custom: boolean; // true = elegida a mano
  parent: string | null; // clave de la carpeta padre
  depth: number; // 0 = primer nivel
  ids: Set<string>; // notas de la carpeta Y de todas sus hijas
  ownIds: Set<string>; // solo las guardadas directamente en esta carpeta
  count: number; // = ids.size
  ownCount: number;
  latest: number;
  pages: number; // páginas con varias notas dentro de la carpeta
}

interface Ctx {
  items: Bookmark[];
  ready: boolean;
  byId: Map<string, Bookmark>;
  /** Todas las carpetas, más recientes primero. */
  folders: FolderInfo[];
  /** Las mismas en orden de árbol (cada padre seguido de sus hijas), para listas con sangría. */
  tree: FolderInfo[];
  byKey: Map<string, FolderInfo>;
  looseIds: Set<string>;
  /** id de nota -> nombre de su carpeta (no aparece si va suelta) */
  folderOf: Map<string, string>;
  /** nombres de carpetas manuales, más recientes primero */
  manualNames: string[];
}

const BookmarksCtx = createContext<Ctx | null>(null);

/** Fuente única de las notas: lee el storage, se actualiza en vivo y calcula las carpetas una sola vez. */
export function BookmarksProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    bookmarksItem.getValue().then((v) => {
      if (!alive) return;
      setItems(v);
      setReady(true);
    });
    const unwatch = bookmarksItem.watch((v) => {
      if (alive) setItems(v ?? []);
    });
    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  const value = useMemo<Ctx>(() => {
    const { folders: groups, loose } = groupBookmarks(items);
    const folders: FolderInfo[] = groups.map((f) => ({
      key: f.key,
      label: f.label ?? folderLabel(f.key),
      name: f.custom && f.label ? folderName(f.label) : (f.label ?? folderLabel(f.key)),
      custom: !!f.custom,
      parent: f.parent,
      depth: f.depth,
      ids: new Set(f.items.map((b) => b.id)),
      ownIds: new Set(f.own.map((b) => b.id)),
      count: f.items.length,
      ownCount: f.own.length,
      latest: f.latest,
      pages: f.subfolders.length,
    }));
    const byKey = new Map(folders.map((f) => [f.key, f]));
    // orden de árbol: raíces por reciente; bajo cada una sus hijas (los grupos `groups` ya traen children ordenados)
    const groupByKey = new Map(groups.map((g) => [g.key, g]));
    const tree: FolderInfo[] = [];
    const walk = (key: string) => {
      const info = byKey.get(key);
      if (!info) return;
      tree.push(info);
      for (const c of groupByKey.get(key)?.children ?? []) walk(c.key);
    };
    for (const f of folders) if (!f.parent) walk(f.key);
    // cada nota se asocia a SU carpeta (la más específica), no a las que la contienen
    const folderOf = new Map<string, string>();
    for (const f of folders) for (const id of f.ownIds) folderOf.set(id, f.label);
    return {
      items,
      ready,
      byId: new Map(items.map((b) => [b.id, b])),
      folders,
      tree,
      byKey,
      looseIds: new Set(loose.map((b) => b.id)),
      folderOf,
      manualNames: folders.filter((f) => f.custom).map((f) => f.label),
    };
  }, [items, ready]);

  return <BookmarksCtx.Provider value={value}>{children}</BookmarksCtx.Provider>;
}

export function useBookmarks(): Ctx {
  const v = useContext(BookmarksCtx);
  if (!v) throw new Error('useBookmarks fuera de BookmarksProvider');
  return v;
}
