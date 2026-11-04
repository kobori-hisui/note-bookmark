import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Note Bookmarks',
    description: 'Guarda notas por sitio con fecha y URL',
    permissions: ['storage'],
  },
});
