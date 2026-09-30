import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const base = '/Breathwork--Buddy/';
const html = await readFile('dist/index.html', 'utf8');
const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
const worker = await readFile('dist/sw.js', 'utf8');

assert.equal(manifest.id, base);
assert.equal(manifest.start_url, base);
assert.equal(manifest.scope, base);
assert.equal(manifest.display, 'standalone');
assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'));

for (const icon of manifest.icons) {
  const url = new URL(icon.src, `https://example.invalid${base}manifest.webmanifest`);
  assert.ok(url.pathname.startsWith(base));
  await access(`dist/${url.pathname.slice(base.length)}`);
}

const shellPaths = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
for (const path of shellPaths) {
  assert.ok(path.startsWith(base), `Shell URL must use project base: ${path}`);
  await access(`dist/${path.slice(base.length)}`);
}
assert.ok(worker.includes(`${base}index.html`), 'Offline navigation fallback must use project path');
assert.ok(worker.includes('precacheAndRoute'), 'Shell must be service-worker precached');
assert.ok(!worker.includes('.mp3'), 'Do not precache missing audio');
console.log('Project-path shell, manifest, icons, and offline fallback checks passed.');
