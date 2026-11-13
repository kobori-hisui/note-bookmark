import { useCallback, useState } from 'react';

/** useState que recuerda su valor en localStorage (preferencias de la interfaz, p. ej. tabla/cuadrícula). */
export function usePersistentState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        // almacenamiento bloqueado: se queda solo en memoria
      }
    },
    [key],
  );
  return [value, set];
}
