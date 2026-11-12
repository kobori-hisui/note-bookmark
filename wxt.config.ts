import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Note Bookmarks',
    description: 'Guarda notas por sitio con fecha, URL e imagen anotada',
    // host_permissions: necesario para captureVisibleTab desde el botón
    // unlimitedStorage: las capturas en dataURL pesan
    // contextMenus: "Guardar selección como nota" (clic derecho)
    permissions: ['storage', 'unlimitedStorage', 'contextMenus'],
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-note': {
        suggested_key: { default: 'Alt+C' },
        description: 'Mostrar/ocultar campo de nota',
      },
      'show-notes': {
        suggested_key: { default: 'Alt+S' },
        description: 'Ver las notas guardadas de esta página',
      },
    },
  },
});