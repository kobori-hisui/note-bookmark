import { bookmarksItem } from '@/utils/bookmarks';
import { notesForPage } from '@/utils/folders';
import { blobToJpegDataUrl } from '@/utils/image';

const MENU_ID = 'save-selection';
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Descarga una imagen desde el background (con host_permissions no choca con CORS) y la reduce a JPEG. */
async function fetchImage(url: string): Promise<string> {
  if (!/^https?:/i.test(url)) throw new Error('URL no válida');
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('imagen demasiado grande');
  return blobToJpegDataUrl(blob);
}

export default defineBackground(() => {
  /** Manda un mensaje al content script de la pestaña. Ignora pestañas sin script. */
  async function sendToTab(tabId: number, message: { type: string; quote?: string; srcUrl?: string }) {
    try {
      await browser.tabs.sendMessage(tabId, message);
    } catch {
      // pestaña sin content script (chrome://, tienda, o abierta antes de instalar)
    }
  }

  // Alt+C -> nota rápida | Alt+S -> ver las notas que ya hay en esta página
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-note' && command !== 'show-notes') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    await sendToTab(tab.id, { type: command });
  });

  // Clic derecho sobre texto seleccionado o sobre una imagen -> abre el cuadro de nota con esa cita / imagen
  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: MENU_ID,
      title: 'Guardar como nota',
      contexts: ['selection', 'image'],
    });
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || tab?.id == null) return;
    sendToTab(tab.id, {
      type: 'quote-note',
      quote: info.selectionText ?? '',
      srcUrl: info.mediaType === 'image' ? info.srcUrl : undefined,
    });
  });

  // Contador en el ícono: cuántas notas tiene la página de la pestaña
  async function updateBadge(tabId: number, url?: string) {
    try {
      const n = url ? notesForPage(await bookmarksItem.getValue(), url).length : 0;
      await browser.action.setBadgeText({ tabId, text: n > 99 ? '99+' : n ? String(n) : '' });
      if (n) await browser.action.setBadgeBackgroundColor({ tabId, color: '#e11d1d' });
    } catch {
      // la pestaña se cerró mientras tanto
    }
  }
  async function refreshActiveTabs() {
    const tabs = await browser.tabs.query({ active: true });
    for (const t of tabs) if (t.id != null) await updateBadge(t.id, t.url);
  }

  browser.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await browser.tabs.get(tabId);
      await updateBadge(tabId, tab.url);
    } catch {
      // pestaña cerrada
    }
  });
  browser.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (info.url || info.status === 'complete') updateBadge(tabId, tab.url);
  });
  bookmarksItem.watch(() => {
    refreshActiveTabs();
  });
  refreshActiveTabs();

  // Botón de captura -> screenshot de la pestaña visible
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'fetch-image') {
      fetchImage(String(msg.url))
        .then((dataUrl) => sendResponse({ dataUrl }))
        .catch((err) => sendResponse({ error: String(err) }));
      return true; // respuesta async
    }
    if (msg?.type !== 'capture') return;
    browser.tabs
      .captureVisibleTab(sender.tab!.windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true; // respuesta async
  });
});