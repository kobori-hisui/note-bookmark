import { bookmarksItem } from '@/utils/bookmarks';
import { notesForPage } from '@/utils/folders';

const MENU_ID = 'save-selection';

export default defineBackground(() => {
  /** Manda un mensaje al content script de la pestaña. Ignora pestañas sin script. */
  async function sendToTab(tabId: number, message: { type: string; quote?: string }) {
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

  // Clic derecho sobre texto seleccionado -> abre el cuadro de nota con esa cita
  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: MENU_ID,
      title: 'Guardar selección como nota',
      contexts: ['selection'],
    });
  });
  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || tab?.id == null) return;
    sendToTab(tab.id, { type: 'quote-note', quote: info.selectionText ?? '' });
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
    if (msg?.type !== 'capture') return;
    browser.tabs
      .captureVisibleTab(sender.tab!.windowId, { format: 'png' })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true; // respuesta async
  });
});