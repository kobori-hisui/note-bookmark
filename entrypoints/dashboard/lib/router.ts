import { useEffect, useState } from 'react';

/** Router mínimo por hash (#/notes). Suficiente para una página de extensión; sin dependencias. */
const read = () => location.hash.replace(/^#/, '') || '/notes';

export function useRoute(): string {
  const [path, setPath] = useState(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return path;
}

export const navigate = (path: string) => {
  location.hash = path;
};
