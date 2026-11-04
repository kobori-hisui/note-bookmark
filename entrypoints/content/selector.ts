export interface Region {
  x: number; // px CSS, relativo al viewport
  y: number;
  w: number;
  h: number;
}

/** Overlay para arrastrar un rectángulo. Devuelve null si cancela (Esc) o es muy pequeño. */
export function selectRegion(): Promise<Region | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .ov { position: fixed; inset: 0; cursor: crosshair; background: rgba(0,0,0,.3); user-select: none; touch-action: none; }
        .sel { position: fixed; display: none; border: 2px solid #e11d1d; pointer-events: none;
               box-shadow: 0 0 0 100vmax rgba(0,0,0,.45); }
        .tip { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); background: #222; color: #eee;
               font: 12px system-ui, sans-serif; padding: 6px 10px; border-radius: 6px; pointer-events: none; }
      </style>
      <div class="ov"></div>
      <div class="sel"></div>
      <div class="tip">Arrastra para seleccionar la región · Esc cancela</div>
    `;
    const ov = shadow.querySelector('.ov') as HTMLDivElement;
    const sel = shadow.querySelector('.sel') as HTMLDivElement;

    let sx = 0;
    let sy = 0;
    let dragging = false;

    const rectFrom = (x: number, y: number): Region => ({
      x: Math.min(sx, x),
      y: Math.min(sy, y),
      w: Math.abs(x - sx),
      h: Math.abs(y - sy),
    });

    const cleanup = (result: Region | null) => {
      window.removeEventListener('keydown', onKey, true);
      host.remove();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup(null);
      }
    };
    window.addEventListener('keydown', onKey, true);

    ov.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ov.setPointerCapture(e.pointerId);
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      ov.style.background = 'transparent'; // ahora el "oscurecido" lo da la sombra de .sel
      sel.style.display = 'block';
      Object.assign(sel.style, { left: `${sx}px`, top: `${sy}px`, width: '0px', height: '0px' });
    });

    ov.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = rectFrom(e.clientX, e.clientY);
      Object.assign(sel.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    });

    ov.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      const r = rectFrom(e.clientX, e.clientY);
      cleanup(r.w < 5 || r.h < 5 ? null : r);
    });

    document.body.appendChild(host);
  });
}

/** Recorta la captura (dataURL del viewport) a la región elegida. */
export async function cropImage(dataUrl: string, r: Region): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const k = img.naturalWidth / window.innerWidth; // relación px de captura / px CSS
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(r.w * k));
  c.height = Math.max(1, Math.round(r.h * k));
  c.getContext('2d')!.drawImage(img, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
