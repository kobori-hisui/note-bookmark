import { useEffect, useState } from 'react';
import { settingsItem, updateSettings, type Settings } from '@/utils/settings';

/** Ajustes de la extensión (modo de imágenes, carpeta activa), en vivo. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let alive = true;
    settingsItem.getValue().then((s) => alive && setSettings(s));
    const unwatch = settingsItem.watch((s) => alive && setSettings(s));
    return () => {
      alive = false;
      unwatch();
    };
  }, []);
  return { settings, update: updateSettings };
}
