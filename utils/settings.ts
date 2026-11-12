import { storage } from '#imports';

/**
 * url     -> la nota guarda solo la dirección de la imagen (casi no ocupa espacio; necesita internet y que el sitio no la borre)
 * offline -> la imagen se descarga y se guarda dentro de la extensión (pesa ~150-400 KB cada una)
 */
export type ImageMode = 'url' | 'offline';

export interface Settings {
  imageMode: ImageMode;
}

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: { imageMode: 'url' },
});
