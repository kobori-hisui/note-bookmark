export default defineBackground(() => {
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
});
