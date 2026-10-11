import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const base = 'c84229255145a52a0d3646ed8c150cf37681b8ab';
const baseline = JSON.parse(fs.readFileSync('lab/production-baseline.json', 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const walk = root => fs.readdirSync(root, {
  withFileTypes: true
}).flatMap(e => e.isDirectory() ? walk(path.join(root, e.name)) : [path.join(root, e.name)]);
const expected = new Set(baseline.map(x => x.Path.replaceAll('\\', '/')));
for (const item of baseline) {
  const file = path.join('dist', item.Path.replaceAll('\\', '/'));
  if (!fs.existsSync(file) || hash(fs.readFileSync(file)) !== item.Hash.toLowerCase()) throw new Error(`Production fingerprint changed: ${item.Path}`);
}
const additional = walk('dist').map(x => path.relative('dist', x).replaceAll('\\', '/')).filter(x => !expected.has(x));
if (additional.some(x => !/^sw\.js$|^workbox-[a-z0-9]+\.js$/.test(x))) throw new Error(`Unexpected production assets: ${additional.join(', ')}`);
const trackedChanges = execFileSync('git', ['diff', '--name-only', base, '--', '.'], {
  encoding: 'utf8'
}).trim().split(/\r?\n/).filter(Boolean);
if (trackedChanges.some(file => !file.startsWith('lab/'))) throw new Error(`Change outside isolated lab: ${trackedChanges.join(', ')}`);
const serviceWorker = fs.readFileSync('dist/sw.js', 'utf8');
if (/acoustic-laborat|lab\/|4c\.1/.test(serviceWorker)) throw new Error('Lab appeared in the production service worker');
const manifest = JSON.parse(fs.readFileSync('dist/manifest.webmanifest', 'utf8'));
if (manifest.scope !== '/Breathwork--Buddy/' || manifest.start_url !== '/Breathwork--Buddy/') throw new Error('PWA path changed');
const report = {
  base,
  baselineFiles: baseline.length,
  matching: true,
  additionalGeneratedPwaFiles: additional,
  productionSourceUnchanged: true,
  labExcluded: true,
  serviceWorkerHash: hash(fs.readFileSync('dist/sw.js')),
  files: walk('dist').map(file => ({
    path: path.relative('dist', file).replaceAll('\\', '/'),
    sha256: hash(fs.readFileSync(file))
  }))
};
if (process.argv.includes('--live')) {
  report.live = [];
  report.livePlatformDifferences = [];
  report.notPublished = report.files.filter(file => file.path.split('/').some(part => part.startsWith('.'))).map(file => file.path);
  for (const file of report.files.filter(file => !report.notPublished.includes(file.path))) {
    const response = await fetch(`https://smithzach648.github.io/Breathwork--Buddy/${file.path.split('/').map(encodeURIComponent).join('/')}`);
    if (!response.ok) throw new Error(`Live asset unavailable ${file.path}`);
    const bytes = Buffer.from(await response.arrayBuffer()),
      sha256 = hash(bytes);
    if (sha256 !== file.sha256) {
      const local = fs.readFileSync(path.join('dist', file.path));
      if (file.path === 'index.html' && local.toString('utf8').replaceAll('\r\n', '\n') === bytes.toString('utf8').replaceAll('\r\n', '\n')) report.livePlatformDifferences.push({
        path: file.path,
        reason: 'Windows CRLF vs CI LF only',
        localHash: file.sha256,
        liveHash: sha256
      });else if (file.path === 'sw.js') {
        const normalize = text => {
          text = text.replaceAll('\r\n', '\n');
          const split = text.indexOf('define(["./workbox'),
            loader = text.slice(0, split),
            rest = text.slice(split),
            names = /exports:(\w+),require:(\w+)/.exec(loader);
          if (split < 0 || !names) throw new Error('Unknown service-worker loader');
          const normalizedLoader = loader.replace(/\b[a-z]+\b/g, token => token === names[1] ? 'EXPORT_BINDING' : token === names[2] ? 'REQUIRE_BINDING' : token);
          const normalizedRest = rest.replace(/precacheAndRoute\((\[[\s\S]*?\]),\{\}\)/, (_match, entries) => {
            const parsed = [...entries.matchAll(/\{url:"([^"]+)",revision:(null|"[a-f0-9]+")\}/g)].map(m => ({
              url: m[1],
              revision: m[1] === 'index.html' ? 'HTML_PLATFORM_HASH' : m[2]
            })).sort((a, b) => a.url.localeCompare(b.url));
            if (parsed.length !== 30) throw new Error('Unexpected precache entry count');
            return 'precacheAndRoute(' + JSON.stringify(parsed) + ',{})';
          });
          return normalizedLoader + normalizedRest;
        };
        if (normalize(local.toString()) !== normalize(bytes.toString())) throw new Error(`Live service worker differs beyond HTML revision`);
        report.livePlatformDifferences.push({
          path: file.path,
          reason: 'HTML revision CRLF/LF, platform glob order and loader binding names. All 30 entries/revisions except HTML and normalized worker code match.',
          localHash: file.sha256,
          liveHash: sha256
        });
      } else throw new Error(`Live asset differs ${file.path}`);
    }
    report.live.push({
      path: file.path,
      sha256
    });
  }
  report.liveAllAssetsEquivalent = true;
  report.liveByteIdentical = report.livePlatformDifferences.length === 0;
}
fs.mkdirSync('qa/acoustic-laboratory', {
  recursive: true
});
fs.writeFileSync('qa/acoustic-laboratory/isolation-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Isolation PASS: ${baseline.length} baseline artifacts byte-identical; generated PWA checked; production source unchanged${report.liveAllAssetsEquivalent ? `; published assets checked (${report.livePlatformDifferences.length} documented platform differences)` : ''}.`);
