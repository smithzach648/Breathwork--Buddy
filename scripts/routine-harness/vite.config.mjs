import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const local = p => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({ root: local('./'), base: '/Breathwork--Buddy/', publicDir: local('../../public'), plugins: [react()], resolve: { alias: { 'virtual:pwa-register/react': local('./sw-stub.ts') } }, build: { outDir: local('../../qa/routine-harness'), emptyOutDir: true } });
