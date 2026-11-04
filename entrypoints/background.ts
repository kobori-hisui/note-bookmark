export default defineBackground(() => {
  // Alt+C -> avisa al content script de la pestaña activa
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-note') return;
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;
    try {
      await browser.tabs.sendMessage(tab.id, { type: 'toggle-note' });
    } catch {
      // pestaña sin content script (chrome://, tienda, o abierta antes de instalar)
    }
  });

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
