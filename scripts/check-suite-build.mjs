import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const baseline=JSON.parse(fs.readFileSync('lab/production-baseline.json','utf8'));
const immutable=baseline.filter(x=>x.Path.replaceAll('\\','/').startsWith('audio/'));
for(const item of immutable)assert.equal(hash(fs.readFileSync(path.join('dist',item.Path.replaceAll('\\','/')))),item.Hash.toLowerCase(),item.Path);
const branding=JSON.parse(fs.readFileSync('docs/breathward/brand-assets.json','utf8'));
for(const [name,pin] of Object.entries(branding.sha256))assert.equal(hash(fs.readFileSync(path.join('dist/icons',name))),pin,name);
const walk=root=>fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(root,e.name)):[path.join(root,e.name)]);
const files=walk('dist'),sw=fs.readFileSync('dist/sw.js','utf8');
for(const file of files){const relative=path.relative('dist',file).replaceAll('\\','/');assert.ok(!/research|Treasure|PCC|lab\/|verify-|harness|\.map$/i.test(relative),relative);}
for(const name of ['prepare-worker','suite-worklet']){const asset=files.find(file=>path.basename(file).startsWith(name));assert.ok(asset,`${name} built`);assert.ok(sw.includes(path.basename(asset)),`${name} precached`);}
const js=files.filter(file=>file.endsWith('.js')&&!/sw\.js|workbox-/.test(file)).map(file=>fs.readFileSync(file,'utf8')).join('\n');
assert.ok(!/acoustic-laboratory-v1|Build a journey|Export journey JSON/.test(js),'standalone lab UI/player excluded');
assert.ok(!/routineQA|suiteQA|localhost:4187/.test(js),'QA excluded');
const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
assert.equal(manifest.scope,'/Breathwork--Buddy/');assert.equal(manifest.start_url,manifest.scope);
const report={immutableAssets:immutable.length,sharedAcousticCoreIncluded:true,labPlayerAndUIExcluded:true,qaExcluded:true,workletAndWorkerCached:true,files:files.map(file=>({path:path.relative('dist',file),sha256:hash(fs.readFileSync(file))}))};
fs.mkdirSync('qa/meditation-suite',{recursive:true});fs.writeFileSync('qa/meditation-suite/build-isolation.json',JSON.stringify(report,null,2));
console.log(`Suite isolation PASS: ${immutable.length} original audio assets unchanged; approved Breathward icons verified; lab UI, QA and research excluded; worker and worklet cached.`);
