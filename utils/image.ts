/** Convierte cualquier imagen (Blob) a un dataURL JPEG reducido (máx. `maxW` px de ancho).
 *  Funciona en service worker y en content script (no usa el DOM). */
export async function blobToJpegDataUrl(blob: Blob, maxW = 1600): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, maxW / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; // PNG/WebP con transparencia -> fondo blanco (JPEG no tiene alfa)
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return blobToDataUrl(out);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('No se pudo leer la imagen'));
    r.readAsDataURL(blob);
  });
}
