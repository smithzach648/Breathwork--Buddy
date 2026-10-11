import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const path = relative => fileURLToPath(new URL(relative, import.meta.url));
export default defineConfig({
  root: path('./'),
  base: '/',
  publicDir: false,
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4187,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 4187,
    strictPort: true
  },
  build: {
    outDir: path('../qa/acoustic-lab'),
    emptyOutDir: true
  },
  worker: {
    format: 'es'
  }
});
