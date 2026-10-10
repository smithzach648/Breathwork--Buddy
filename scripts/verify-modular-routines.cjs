/* Optional native Chrome QA. Requires Playwright via NODE_PATH; no app dependency. */
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const base = '/Breathwork--Buddy/', port = 4184, url = `http://127.0.0.1:${port}${base}`;
const output = path.resolve('qa'); fs.mkdirSync(output, { recursive: true });
let root = path.resolve('dist');
const evidence = { date: new Date().toISOString(), production: {}, layouts: [], native: {}, errors: [], externalRequests: [] };
const server = http.createServer((req, res) => {
    const request = decodeURIComponent(req.url.split('?')[0]);
    if (!request.startsWith(base)) return res.writeHead(404).end();
    const file = path.resolve(root, request.slice(base.length) || 'index.html');
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json', '.mp3':'audio/mpeg', '.wav':'audio/wav' };
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.setHeader('Cache-Control', 'no-store'); res.end(fs.readFileSync(file));
});
const options = { executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, viewport: { width:390, height:844 } };
function watch(page) {
    page.on('pageerror', e => evidence.errors.push(e.message));
    page.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(new URL(url).origin)) evidence.externalRequests.push(r.url()); });
}
async function buildExample(page, name) {
    await page.getByRole('button', {name:'My Routines', exact:true}).click();
    await page.getByRole('button', {name:'Create routine'}).click(); await page.getByLabel('Routine name').fill(name);
    await page.getByLabel('Block 1 practice').selectOption('custom-pattern');
    await page.getByRole('button', {name:'Duplicate block 1', exact:true}).click();
    await page.getByLabel('Block 2 hold after inhale seconds (0 = No hold)').fill('7'); await page.getByLabel('Block 2 exhale seconds').fill('8'); await page.getByLabel('Block 2 cycles').fill('2');
    for (const [index, kind] of [[3,'hormesis-round'],[4,'settling'],[5,'meditation']]) {
        await page.getByRole('button', {name:'Add block', exact:true}).click(); await page.getByLabel(`Block ${index} practice`).selectOption(kind);
    }
    await page.getByLabel('Block 5 meditation minutes').fill('30');
}
async function storeState(page) {
    return page.evaluate(async () => {
        const db = await new Promise((resolve,reject) => { const request = indexedDB.open('breathwork-buddy-v2'); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
        const rows = async name => new Promise((resolve,reject) => { const request=db.transaction(name).objectStore(name).getAll(); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
        const routines=await rows('routines'), history=await rows('history'), preferences=await rows('preferences'), media=await rows('media');
        const result = { version:db.version, routines, history, preferences, media:await Promise.all(media.map(async m=>({id:m.id,size:m.blob.size,name:m.displayName}))) }; db.close(); return result;
    });
}
(async () => {
    await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve)); let context;
    try {
        const profile=path.join(output,`modular-profile-${Date.now()}`);
        context=await chromium.launchPersistentContext(profile,options); let page=context.pages()[0] || await context.newPage(); watch(page);
        await page.goto(url); await page.getByRole('button',{name:'My Routines',exact:true}).waitFor(); await page.evaluate(async()=>navigator.serviceWorker.ready); await page.reload();
        await page.getByRole('button',{name:'Meditation',exact:true}).click(); await page.getByLabel('Binaural layer').selectOption('layered');
        await page.getByLabel('Environment',{exact:true}).selectOption('mix'); await page.getByText('Choose or import audio',{exact:true}).click();
        const wav=Buffer.alloc(44+44100*2); wav.write('RIFF',0); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(44100,24); wav.writeUInt32LE(88200,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(wav.length-44,40);
        for(let i=0;i<44100;i++)wav.writeInt16LE(Math.round(1000*Math.sin(2*Math.PI*220*i/44100)),44+i*2);
        await page.getByLabel('Import audio from device').setInputFiles({name:'QA local audio.wav',mimeType:'audio/wav',buffer:wav}); await page.getByRole('button',{name:'Select QA local audio',exact:true}).waitFor();
        await page.getByRole('button',{name:'Home',exact:true}).click(); await buildExample(page,'Deep Exploration');
        for (const width of [320,360,390,430]) for (const font of [16,24,32]) {
            await page.setViewportSize({width,height:844}); await page.evaluate(font=>document.documentElement.style.fontSize=font+'px',font);
            const metrics=await page.evaluate(()=>({ width:innerWidth, scroll:document.documentElement.scrollWidth, targets:[...document.querySelectorAll('.routine-editor button,.routine-editor input,.routine-editor select')].map(b=>{const r=b.getBoundingClientRect();return {name:b.textContent||b.id,left:r.left,right:r.right,height:r.height,width:r.width};}) }));
            assert.ok(metrics.scroll<=width,JSON.stringify(metrics)); for(const b of metrics.targets) {assert.ok(b.left>=0 && b.right<=width+.1,JSON.stringify(b)); assert.ok(b.height>=48);}
            evidence.layouts.push({width,font,...metrics}); if(font===32) await page.screenshot({path:path.join(output,`editor-${width}.png`),fullPage:true});
        }
        await page.evaluate(()=>document.documentElement.style.fontSize='16px'); await page.setViewportSize(options.viewport); await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
        await page.getByRole('button',{name:'Move block 4 up',exact:true}).click(); await page.getByRole('button',{name:'Move block 3 down',exact:true}).click();
        await page.getByRole('button',{name:'Save routine',exact:true}).click(); await page.getByRole('button',{name:'Start Deep Exploration',exact:true}).waitFor();
        const before=await storeState(page); assert.equal(before.version,30); assert.deepEqual(before.routines[0].stages.map(b=>b.kind),['custom-pattern','custom-pattern','hormesis-round','settling','meditation']);
        assert.equal(before.routines[0].stages[1].holdInSeconds,7); assert.equal(before.routines[0].stages[3].durationSeconds,120); assert.equal(before.routines[0].stages[4].durationSeconds,1800);
        await page.getByRole('button',{name:'Start Deep Exploration',exact:true}).click(); await page.locator('.stage-title').waitFor(); await page.waitForTimeout(13500);
        assert.match(await page.locator('.active-practice').innerText(),/Cycle 1 of 5/); await page.getByRole('button',{name:'Stop practice',exact:true}).click(); await page.getByRole('heading',{name:'Cancelled',exact:true}).waitFor();
        let state=await storeState(page); assert.equal(state.history.length,1); assert.equal(state.history[0].blocks[0].customPattern.completedCycles,0); evidence.production.referenceSavedAndStarted=true;
        await context.setOffline(true); await context.close(); context=await chromium.launchPersistentContext(profile,options); await context.setOffline(true); page=context.pages()[0] || await context.newPage(); watch(page);
        await page.goto(url); await page.getByRole('button',{name:'My Routines',exact:true}).click(); await page.getByRole('button',{name:'Start Deep Exploration',exact:true}).waitFor();
        state=await storeState(page); assert.deepEqual(state.routines,before.routines); assert.deepEqual(state.preferences,before.preferences); assert.deepEqual(state.media,before.media); assert.equal(state.media[0].size,wav.length); assert.equal(state.history.length,1); evidence.production.importedBlobPreserved=true;
        await page.getByRole('button',{name:'Start Deep Exploration',exact:true}).click(); await page.locator('.stage-title').waitFor(); await page.getByRole('button',{name:'Stop practice',exact:true}).click(); await page.getByRole('heading',{name:'Cancelled',exact:true}).waitFor();
        await page.getByRole('button',{name:'Done / Home',exact:true}).click(); await page.getByRole('button',{name:'History',exact:true}).click(); await page.locator('.history-list>li').first().waitFor(); assert.equal(await page.locator('.history-list>li').count(),2);
        evidence.production.offlineProcessRestart=true; evidence.production.oneResultPerStart=true; await context.close(); context=undefined;

        root=path.resolve('qa/routine-harness'); context=await chromium.launchPersistentContext(path.join(output,`native-profile-${Date.now()}`),options); page=context.pages()[0] || await context.newPage(); watch(page); await page.goto(url);
        await page.getByRole('button',{name:'Meditation',exact:true}).click(); await page.getByLabel('Binaural layer').selectOption('layered'); await page.getByRole('button',{name:'Home',exact:true}).click();
        await buildExample(page,'Native Exploration'); await page.getByRole('button',{name:'Save routine',exact:true}).click(); await page.getByRole('button',{name:'Start Native Exploration',exact:true}).click(); await page.locator('.stage-title').waitFor();
        await page.waitForFunction(()=>window.routineQA.runtime.audio.debugState().decoded.length>=21);
        const step=async ms=>{await page.evaluate(ms=>window.routineQA.advance(ms),ms); await page.waitForTimeout(60);};
        await step(13000); await step(70000); await step(3000); await step(38000); await step(3000);
        assert.match(await page.locator('.active-practice').innerText(),/Breath 1 of 20/);
        await step(82000); await page.getByRole('button',{name:'Release retention',exact:true}).waitFor(); await page.getByRole('button',{name:'Release retention',exact:true}).click();
        await step(4000); assert.equal(await page.evaluate(()=>window.routineQA.runtime.engine.getState().stage.phase),'recovery-hold');
        await step(15000); await step(6000); await step(3000); await step(3000); assert.equal(await page.evaluate(()=>window.routineQA.runtime.engine.getState().stage.phase),'natural-settling');
        const settlingCues=await page.evaluate(()=>window.routineQA.runtime.audio.debugState().tracks); assert.equal(settlingCues.length,0);
        await step(120000); await step(3000); assert.equal(await page.evaluate(()=>window.routineQA.runtime.engine.getState().stage.phase),'meditation');
        await page.waitForFunction(()=>window.routineQA.binaural.diagnostics().activeOscillators===6 && window.routineQA.noise.diagnostics().activeNodes>0);
        evidence.native.meditationLayers=await page.evaluate(()=>({noise:window.routineQA.noise.diagnostics(),tones:window.routineQA.binaural.diagnostics()}));
        await step(10000); await page.getByRole('button',{name:'End Early',exact:true}).click(); await page.waitForTimeout(200);
        const native=await page.evaluate(async()=>({result:window.routineQA.runtime.engine.getState().result,history:await window.routineQA.database.history.toArray(),events:window.routineQA.events,audio:window.routineQA.runtime.audio.debugState(),noise:window.routineQA.noise.diagnostics(),tones:window.routineQA.binaural.diagnostics()}));
        assert.deepEqual(native.result.blocks.map(b=>b.outcome),['completed','completed','completed','completed','cancelled']); assert.equal(native.result.retentions.length,1); assert.equal(native.result.retentions[0].durationSeconds,0); assert.equal(native.result.blocks[2].hormesisRound.recoveryCompleted,true);
        assert.equal(native.result.blocks[0].customPattern.completedCycles,5); assert.equal(native.result.blocks[1].customPattern.completedCycles,2); assert.equal(native.history.length,1); assert.equal(native.audio.tracks.length,0); assert.equal(native.noise.activeNodes,0); assert.equal(native.tones.activeOscillators,0);
        assert.equal(native.events.filter(e=>e.id==='voice.prepare').length,1); assert.equal(native.events.filter(e=>/^voice\.(round|finalRound)/.test(e.id||'')).length,0);
        evidence.native.safetySmoke=native; assert.deepEqual(evidence.errors,[]); assert.deepEqual(evidence.externalRequests,[]); console.log('Native routine, mobile editor, production/offline restart checks PASS');
    } finally { if(context)await context.close(); server.close(); fs.writeFileSync(path.join(output,'modular-browser.json'),JSON.stringify(evidence,null,2)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
