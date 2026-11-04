import { addBookmark } from '@/utils/bookmarks';
import { openEditor } from './editor';
import { cropImage, selectRegion } from './selector';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const host = document.createElement('div');
    host.style.cssText =
      'position:fixed;top:140px;left:16px;z-index:2147483647;display:none;';
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        .box { width: 260px; font-family: system-ui, sans-serif; }
        textarea {
          width: 100%; box-sizing: border-box; height: 64px; resize: vertical;
          padding: 8px; border-radius: 8px; border: 1px solid #e11d1d;
          background: #1c1c1c; color: #eee; font-size: 13px; outline: none;
        }
        textarea:focus { border-color: #ff5a5a; }
        .row { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; gap: 6px; }
        .hint { font-size: 11px; color: #999; min-height: 14px; }
        .ok { color: #4ade80; }
        .err { color: #f87171; }
        .cam { background: #2a2a2a; color: #eee; border: 1px solid #444; border-radius: 6px;
               padding: 3px 8px; font-size: 11px; cursor: pointer; white-space: nowrap; }
        .cam:hover { border-color: #e11d1d; }
      </style>
      <div class="box">
        <textarea placeholder="Escribe una nota… (Enter guarda)"></textarea>
        <div class="row">
          <span class="hint">Enter guarda · Esc cierra</span>
          <button class="cam">📷 Región</button>
        </div>
      </div>
    `;

    const textarea = shadow.querySelector('textarea')!;
    const hint = shadow.querySelector('.hint')!;
    const camBtn = shadow.querySelector('.cam')!;
    const defaultHint = hint.textContent;

    const show = () => {
      host.style.display = 'block';
      textarea.focus();
    };
    const hide = () => {
      host.style.display = 'none';
    };
    const toggle = () => (host.style.display === 'none' ? show() : hide());

    const flash = (text: string, cls: 'ok' | 'err', then?: () => void) => {
      hint.textContent = text;
      hint.className = `hint ${cls}`;
      setTimeout(() => {
        hint.textContent = defaultHint;
        hint.className = 'hint';
        then?.();
      }, 900);
    };

    // Alt+C llega desde el background
    browser.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'toggle-note') toggle();
    });

    // Evita que atajos de la página roben las teclas
    for (const ev of ['keydown', 'keyup', 'keypress'] as const) {
      textarea.addEventListener(ev, (e) => e.stopPropagation());
    }

    textarea.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        hide();
        return;
      }
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      const note = textarea.value.trim();
      if (!note) return;

      await addBookmark(note, location.href); // image = null
      textarea.value = '';
      flash('Guardado ✓', 'ok', hide);
    });

    // 📷 Región -> seleccionar zona -> recorte -> editor con anotaciones -> guarda con imagen
    camBtn.addEventListener('click', async () => {
      const pendingNote = textarea.value;
      hide(); // que el cuadro no salga en la captura

      const region = await selectRegion();
      if (!region) {
        show(); // canceló; la nota sigue en el textarea
        return;
      }
      await new Promise((r) => setTimeout(r, 150)); // deja repintar sin overlay

      let dataUrl: string | undefined;
      try {
        const res = await browser.runtime.sendMessage({ type: 'capture' });
        dataUrl = res?.dataUrl;
      } catch {
        // se maneja abajo
      }
      if (!dataUrl) {
        show();
        flash('No se pudo capturar', 'err');
        return;
      }

      const cropped = await cropImage(dataUrl, region);
      const result = await openEditor(cropped, pendingNote);
      if (!result) {
        show();
        return;
      }
      await addBookmark(result.note, location.href, result.image);
      textarea.value = '';
    });

    document.body.appendChild(host);
  },
});
