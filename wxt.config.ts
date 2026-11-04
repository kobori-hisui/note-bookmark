import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Note Bookmarks',
    description: 'Guarda notas por sitio con fecha, URL e imagen anotada',
    // host_permissions: necesario para captureVisibleTab desde el botón
    // unlimitedStorage: las capturas en dataURL pesan
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-note': {
        suggested_key: { default: 'Alt+C' },
        description: 'Mostrar/ocultar campo de nota',
      },
    },
  },
});
