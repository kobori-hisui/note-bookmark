import { addBookmark } from '@/utils/bookmarks';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;top:140px;left:16px;z-index:2147483647;';
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
        .hint { font-size: 11px; color: #999; margin-top: 4px; min-height: 14px; }
        .ok { color: #4ade80; }
      </style>
      <div class="box">
        <textarea placeholder="Escribe una nota… (Enter guarda)"></textarea>
        <div class="hint">Shift+Enter = salto de línea</div>
      </div>
    `;

    const textarea = shadow.querySelector('textarea')!;
    const hint = shadow.querySelector('.hint')!;

    // Evita que atajos de la página roben las teclas
    for (const ev of ['keydown', 'keyup', 'keypress'] as const) {
      textarea.addEventListener(ev, (e) => e.stopPropagation());
    }

    textarea.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      const note = textarea.value.trim();
      if (!note) return;

      await addBookmark(note, location.href);
      textarea.value = '';
      hint.textContent = 'Guardado ✓';
      hint.classList.add('ok');
      setTimeout(() => {
        hint.textContent = 'Shift+Enter = salto de línea';
        hint.classList.remove('ok');
      }, 1500);
    });

    document.body.appendChild(host);
  },
});
