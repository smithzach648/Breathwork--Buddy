/* Short temp profile avoids Windows CacheStorage path limits. Never touches the user's app data. */
const { chromium } = require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const live=process.argv.includes('--live');
const base='/Breathwork--Buddy/',url=live?`https://smithzach648.github.io${base}`:`http://127.0.0.1:4185${base}`,root=path.resolve('dist'),output=path.resolve('qa');
const evidence={url,desktopChromeOnly:true}; fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(root,pathname.slice(base.length)||'index.html');if(!pathname.startsWith(base)||!file.startsWith(root+path.sep)||!fs.existsSync(file)){return res.writeHead(404).end();}const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.mp3':'audio/mpeg','.wav':'audio/wav'};res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));});
(async()=>{
    if(!live)await new Promise(resolve=>server.listen(4185,'127.0.0.1',resolve)); let context,cdp,installed=false;
    try {
        context=await chromium.launchPersistentContext(fs.mkdtempSync(path.join(require('node:os').tmpdir(),'bb4b-install-')),{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,viewport:{width:390,height:844}});
        console.log('Isolated installed-PWA browser launched');
        const page=context.pages()[0]||await context.newPage(); await page.goto(url); await page.getByRole('button',{name:'My Routines',exact:true}).waitFor();
        await page.evaluate(async()=>Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker not ready after 45 seconds')),45000))])); await page.reload();
        await page.getByRole('button',{name:'My Routines',exact:true}).click();await page.getByRole('button',{name:'Create routine'}).click();await page.getByLabel('Routine name').fill('Installed Modular');await page.getByLabel('Block 1 practice').selectOption('hormesis-round');
        await page.getByRole('button',{name:'Add block',exact:true}).click();await page.getByLabel('Block 2 practice').selectOption('settling');await page.getByRole('button',{name:'Add block',exact:true}).click();await page.getByLabel('Block 3 practice').selectOption('meditation');await page.getByLabel('Block 3 sound environment').selectOption('custom');await page.getByLabel('Block binaural layer').selectOption('layered');await page.getByRole('button',{name:'Save routine',exact:true}).click();await page.getByRole('button',{name:'Start Installed Modular',exact:true}).waitFor();
        console.log('Modular routine saved; installing test PWA');
        cdp=await context.browser().newBrowserCDPSession(); const send=cdp.send.bind(cdp);cdp.send=(method,params)=>Promise.race([send(method,params),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error(`CDP timeout: ${method}`)),20000);timer.unref();})]);
        await cdp.send('PWA.install',{manifestId:url,installUrlOrBundleUrl:url}); installed=true; await cdp.send('PWA.changeAppUserSettings',{manifestId:url,displayMode:'standalone'});
        evidence.osAppState=await cdp.send('PWA.getOsAppState',{manifestId:url}); await context.setOffline(true);
        const original=await context.newCDPSession(page), info=await original.send('Target.getTargetInfo');await original.detach();await cdp.send('PWA.launch',{manifestId:url});
        const targets=await cdp.send('Target.getTargets');const app=targets.targetInfos.find(t=>t.type==='page'&&t.url.startsWith(url)&&t.targetId!==info.targetInfo.targetId);assert.ok(app,'Installed app target');
        const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:app.targetId,flatten:false});let counter=0;
        async function command(method,params={}) {
            const id=++counter;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cdp.off('Target.receivedMessageFromTarget',receive);reject(new Error(`Timeout ${method}`));},15000);
                function receive(event){if(event.sessionId!==sessionId)return;const message=JSON.parse(event.message);if(message.id!==id)return;clearTimeout(timer);cdp.off('Target.receivedMessageFromTarget',receive);message.error?reject(new Error(message.error.message)):resolve(message.result);}
                cdp.on('Target.receivedMessageFromTarget',receive);cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);
            });
        }
        const evaluate=async expression=>{const value=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(value.exceptionDetails)throw new Error(JSON.stringify(value.exceptionDetails));return value.result.value;};
        await command('Page.enable');await command('Network.enable');await command('Network.setCacheDisabled',{cacheDisabled:true});await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
        await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.prepareCount=0;const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...args){super(...args);const create=this.createBufferSource.bind(this);this.createBufferSource=()=>{const source=create(),start=source.start.bind(source);source.start=(...args)=>{if(Math.abs(source.buffer?.duration-3.474285714)<.01)window.prepareCount++;return start(...args);};return source;};}};`});await command('Page.reload');
        const waitExpression=expression=>`new Promise((resolve,reject)=>{const limit=Date.now()+12000;const timer=setInterval(()=>{const value=(${expression});if(value){clearInterval(timer);resolve(value);}else if(Date.now()>limit){clearInterval(timer);reject(new Error('Timed out waiting for installed UI'));}},50);})`;
        evidence.shell=await evaluate(waitExpression(`document.querySelector('h1') && {heading:document.querySelector('h1').textContent,standalone:matchMedia('(display-mode: standalone)').matches,online:navigator.onLine}`));assert.equal(evidence.shell.standalone,true);assert.equal(evidence.shell.online,false);
        await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='My Routines').click()`); await evaluate(waitExpression(`document.querySelector('button[aria-label="Start Installed Modular"]') && true`));
        await evaluate(`document.querySelector('button[aria-label="Start Installed Modular"]').click()`); await evaluate(waitExpression(`window.prepareCount===1 && !!document.querySelector('.stage-title')`));
        await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop practice').click()`);await evaluate(waitExpression(`document.querySelector('h1')?.textContent==='Cancelled'`));
        evidence.saved=await evaluate(`new Promise((resolve,reject)=>{const request=indexedDB.open('breathwork-buddy-v2');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction(['routines','history']);const routine=tx.objectStore('routines').getAll(),history=tx.objectStore('history').getAll();tx.oncomplete=()=>{resolve({version:db.version,routines:routine.result,history:history.result,prepareCount:window.prepareCount});db.close();};};})`);
        assert.equal(evidence.saved.prepareCount,1);assert.equal(evidence.saved.history.length,1);assert.deepEqual(evidence.saved.routines[0].stages.map(b=>b.kind),['hormesis-round','settling','meditation']);assert.equal(evidence.saved.routines[0].foundation.texture,'brown');assert.equal(evidence.saved.routines[0].stages[2].sound.closing,'bowl');assert.equal(evidence.saved.routines[0].stages[2].sound.mode,'layered');evidence.bowlOffline=await evaluate(`fetch('audio/signals/Singing%20Bowl%20Signal.wav').then(async response=>({ok:response.ok,size:(await response.arrayBuffer()).byteLength}))`);assert.equal(evidence.bowlOffline.size,3966522);evidence.installedOfflineStartStop=true;console.log('Installed standalone Chrome PWA offline modular routine PASS');
    } catch(error) { evidence.error=String(error); throw error; } finally {
        if(installed&&cdp){await cdp.send('PWA.uninstall',{manifestId:url});evidence.testInstallationRemoved=true;}
        if(context)await context.close();server.close();fs.writeFileSync(path.join(output,'modular-installed.json'),JSON.stringify(evidence,null,2));
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
