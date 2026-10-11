/* Run with the separate lab server at localhost:4187. Uses disposable Chrome data only. */
const {
  chromium
} = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const output = path.resolve('qa/acoustic-laboratory');
fs.mkdirSync(output, {
  recursive: true
});
const report = {
  date: new Date().toISOString(),
  url: 'http://127.0.0.1:4187/',
  browser: 'Native desktop Chrome',
  physicalHeadphoneListening: false,
  layouts: [],
  previews: [],
  renders: [],
  parity: [],
  errors: []
};
const resume = process.argv.includes('--resume');
if (resume) {
  const previous = JSON.parse(fs.readFileSync(path.join(output, 'native-report.json'), 'utf8'));
  assert.equal(previous.renders.length, 5);
  assert.equal(previous.parity.length, 5);
  Object.assign(report, {
    renders: previous.renders,
    previews: previous.previews,
    parity: previous.parity,
    resumedAfterVerifiedPresets: true,
    previousFixtureFailure: previous.error
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });
  const context = await browser.newContext({
    viewport: {
      width: 1300,
      height: 950
    },
    acceptDownloads: true
  });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.goto(report.url);
    await page.waitForFunction(() => window.labQA);
    assert.equal(await page.evaluate(() => indexedDB.databases().then(x => x.length)), 0);
    assert.equal(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(x => x.length)), 0);
    for (let index = resume ? 5 : 0; index < 5; index++) {
      await page.locator('.world').nth(index).click();
      await page.getByRole('button', {
        name: 'Start stereo preview',
        exact: true
      }).click();
      await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 1, {}, {
        timeout: 30000
      });
      await wait(800);
      const playing = await page.evaluate(() => window.labQA.player.diagnostics());
      assert.ok(playing.measuredLiveRms > 1e-6);
      assert.equal(playing.activeGraphs, 1);
      report.previews.push({
        preset: index,
        ...playing
      });
      const parity = await page.evaluate(async () => {
        const q = window.labQA,
          {
            render,
            warm,
            measure
          } = await import('/dsp.ts');
        const captured = await q.player.capture(1),
          wave = warm(captured.sampleRate, q.recipe.sampleSeed),
          o = {
            ...q.options,
            sampleRate: captured.sampleRate,
            startSeconds: q.options.startSeconds + captured.firstFrame / captured.sampleRate,
            durationSeconds: captured.left.length / captured.sampleRate,
            fade: false
          };
        const expected = render(q.recipe, o, wave);
        let maxError = 0;
        for (let c = 0; c < 2; c++) {
          const actual = c ? captured.right : captured.left;
          for (let i = 0; i < actual.length; i++) maxError = Math.max(maxError, Math.abs(actual[i] - expected[c][i]));
        }
        return {
          recipe: q.recipe.id,
          route: 'Live device-time AudioWorklet capture vs shared offline samples',
          maxError,
          firstFrame: captured.firstFrame,
          frames: captured.left.length,
          metrics: measure([captured.left, captured.right], captured.sampleRate)
        };
      });
      assert.ok(parity.maxError < 1e-7, JSON.stringify(parity));
      report.parity.push(parity);
      await page.getByRole('button', {
        name: 'Stop audio / cancel',
        exact: true
      }).click();
      await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 0);
      // Real UI WAV download and report, then decode the downloaded PCM in native Chrome.
      const downloads = [];
      const listener = d => downloads.push(d);
      page.on('download', listener);
      await page.getByRole('button', {
        name: 'Export stereo WAV',
        exact: true
      }).click();
      await page.waitForFunction(() => window.labQA.metrics, {}, {
        timeout: 45000
      });
      while (downloads.length < 2) await wait(50);
      page.off('download', listener);
      const files = [];
      for (const download of downloads) {
        const file = path.join(output, download.suggestedFilename());
        await download.saveAs(file);
        files.push(file);
      }
      const wav = files.find(x => x.endsWith('.wav')),
        bytes = fs.readFileSync(wav);
      assert.equal(bytes.readUInt16LE(22), 2);
      assert.equal(bytes.readUInt16LE(34), 16);
      assert.equal(bytes.length, 44 + 48000 * 30 * 4);
      const decoded = await page.evaluate(async b => {
        const ctx = new AudioContext({
            sampleRate: 48000
          }),
          audio = await ctx.decodeAudioData(Uint8Array.from(atob(b), c => c.charCodeAt(0)).buffer);
        const info = {
          channels: audio.numberOfChannels,
          rate: audio.sampleRate,
          seconds: audio.duration,
          peak: Math.max(...audio.getChannelData(0).subarray(0, 10000).map(Math.abs))
        };
        await ctx.close();
        return info;
      }, bytes.toString('base64'));
      assert.equal(decoded.channels, 2);
      assert.equal(decoded.seconds, 30);
      assert.ok(decoded.peak > 0);
      const metrics = await page.evaluate(() => ({
        ...window.labQA.metrics,
        wav: undefined
      }));
      assert.equal(metrics.metrics.invalidSamples, 0);
      assert.ok(Math.max(...metrics.metrics.peak) < .1);
      report.renders.push({
        preset: index,
        recipe: await page.evaluate(() => window.labQA.recipe),
        files: files.map(x => path.relative(process.cwd(), x)),
        decoded,
        ...metrics
      });
      console.log(`Preset ${index + 1}: native preview, live parity and actual stereo WAV PASS`);
      if (index === 1) await page.screenshot({
        path: path.join(output, 'threshold-desktop.png'),
        fullPage: true
      });
    }
    // Parameter edit, immutable built-in, fractional difference, enable/solo, add/remove, save/restore.
    await page.locator('.world').nth(3).click();
    const difference = page.getByLabel('Pair 1 difference Hz', {
      exact: true
    });
    await difference.fill('3.75');
    await difference.press('Tab');
    assert.equal(await page.evaluate(() => window.labQA.recipe.carrierPairs[0].deltaHz), 3.75);
    await page.getByRole('button', {
      name: 'Add carrier pair',
      exact: true
    }).click();
    assert.equal(await page.locator('fieldset').count(), 3);
    await page.getByRole('button', {
      name: 'Remove pair 3',
      exact: true
    }).click();
    await page.locator('fieldset').nth(1).getByLabel('Enabled', {
      exact: true
    }).check();
    await page.locator('fieldset').nth(1).getByLabel('Solo this pair', {
      exact: true
    }).check();
    await page.getByRole('button', {
      name: 'Save As in lab',
      exact: true
    }).click();
    report.saved = await page.evaluate(() => JSON.parse(localStorage.getItem('breathwork-buddy-acoustic-lab-v1')));
    assert.equal(report.saved[0].carrierPairs[0].deltaHz, 3.75);
    const recipeDownload = page.waitForEvent('download');
    await page.getByRole('button', {
      name: 'Export recipe JSON',
      exact: true
    }).click();
    const jsonFile = path.join(output, 'manual-recipe.json');
    await (await recipeDownload).saveAs(jsonFile);
    await page.locator('.world').nth(0).click();
    await page.getByLabel('Import recipe JSON', {
      exact: true
    }).setInputFiles(jsonFile);
    await page.waitForFunction(() => window.labQA.recipe.carrierPairs[0].deltaHz === 3.75);
    report.importRoundTrip = true;
    const before = await page.evaluate(() => window.labQA.recipe);
    await page.getByLabel('Import recipe JSON', {
      exact: true
    }).setInputFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schemaVersion":99}')
    });
    await page.getByRole('alert').waitFor();
    assert.deepEqual(await page.evaluate(() => window.labQA.recipe), before);
    await page.reload();
    await page.waitForFunction(() => window.labQA);
    await page.getByLabel('Restore a saved lab variant').selectOption(report.saved[0].id);
    assert.equal(await page.evaluate(() => window.labQA.recipe.carrierPairs[0].deltaHz), 3.75);
    report.labOnlyPersistence = true;
    // A/B matched real samples and serial lifecycle, optional masking.
    await page.locator('.world').nth(0).click();
    await page.getByLabel('Sample B', {
      exact: true
    }).selectOption('expansion');
    await page.getByLabel('Hide recipe labels during comparison').check();
    await page.getByRole('button', {
      name: 'Measure and match A/B',
      exact: true
    }).click();
    await page.waitForFunction(() => window.labQA.matched, {}, {
      timeout: 45000
    });
    report.matching = await page.evaluate(() => window.labQA.matched);
    await page.getByRole('button', {
      name: 'Listen A',
      exact: true
    }).click();
    await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 1);
    await page.getByRole('button', {
      name: 'Listen B',
      exact: true
    }).click();
    await page.waitForFunction(() => window.labQA.player.diagnostics().state === 'Playing stereo' && document.querySelector('[role=status]').textContent.includes('Sample B'));
    assert.equal(await page.evaluate(() => window.labQA.player.diagnostics().activeGraphs), 1);
    await page.getByRole('button', {
      name: 'Reveal labels',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: 'Stop audio / cancel',
      exact: true
    }).click();
    await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 0);
    // Actual native FFT at three Open Exploration knots; values derive from rendered tone PCM.
    report.glides = await page.evaluate(async () => {
      const {
          warm,
          render,
          spectrum,
          carrier
        } = await import('/dsp.ts'),
        {
          PRESETS
        } = await import('/model.ts');
      const r = PRESETS[4],
        wave = warm(48000, r.sampleSeed),
        t = r.timeline,
        steady = t.durationSeconds - t.entrySeconds - t.returnSeconds;
      return [0, .5, 1].map(at => {
        const start = t.entrySeconds + steady * at,
          pcm = render(r, {
            sampleRate: 48000,
            startSeconds: start,
            durationSeconds: 6,
            selection: 'tones',
            fade: false
          }, wave);
        const specs = pcm.map(c => spectrum(c, 48000));
        return {
          at,
          start,
          expectedAtMidpoint: carrier(r.carrierPairs[0], start + 3, r).hz,
          peaks: specs.map(s => s.peaks[0]),
          binHz: specs[0].binHz
        };
      });
    });
    for (const g of report.glides) {
      assert.ok(Math.abs(g.peaks[0].hz - g.expectedAtMidpoint) < .3);
      assert.ok(Math.abs(g.peaks[1].hz - g.peaks[0].hz - 4) < .3);
    }
    // Native 4B control comparison uses original OscillatorNodes and original source data.
    report.control = await page.evaluate(async repo => {
      const {
          warm,
          render,
          measure
        } = await import('/dsp.ts'),
        {
          PRESETS
        } = await import('/model.ts'),
        {
          createToneGraph
        } = await import(`/@fs/${repo}/src/audio/binaural.ts`),
        {
          createOutput
        } = await import(`/@fs/${repo}/src/audio/output.ts`);
      const r = PRESETS[0],
        wave = warm(48000, r.sampleSeed),
        ctx = new OfflineAudioContext(2, 48000 * 6, 48000),
        master = ctx.createGain();
      master.gain.value = .8;
      master.connect(createOutput(ctx));
      const graph = createToneGraph(ctx, master, 'layered', .08);
      graph.envelope.gain.value = 1;
      graph.start(0);
      const bed = ctx.createBufferSource(),
        buffer = ctx.createBuffer(2, wave.length, 48000),
        noiseGain = ctx.createGain();
      buffer.copyToChannel(wave, 0);
      buffer.copyToChannel(wave, 1);
      bed.buffer = buffer;
      bed.loop = true;
      noiseGain.gain.value = .1;
      bed.connect(noiseGain);
      noiseGain.connect(master);
      bed.start(0, 900 % (wave.length / 48000));
      const actual = await ctx.startRendering(),
        expected = render(r, {
          sampleRate: 48000,
          startSeconds: 900,
          durationSeconds: 6,
          selection: 'combined',
          fade: false
        }, wave);
      graph.disconnect();
      bed.disconnect();
      const channels = [actual.getChannelData(0), actual.getChannelData(1)],
        native = measure(channels, 48000),
        lab = measure(expected, 48000);
      let best = {
        shift: 0,
        rmsError: Infinity,
        maxError: Infinity
      };
      for (let shift = -512; shift <= 512; shift++) {
        let energy = 0,
          max = 0,
          count = 0;
        for (let c = 0; c < 2; c++) for (let i = 1024; i < Math.min(actual.length - 1024, 48000); i++) {
          const d = channels[c][i] - expected[c][i - shift];
          energy += d * d;
          max = Math.max(max, Math.abs(d));
          count++;
        }
        const rmsError = Math.sqrt(energy / count);
        if (rmsError < best.rmsError) best = {
          shift,
          rmsError,
          maxError: max
        };
      }
      return {
        native,
        lab,
        ...best,
        scope: 'Same actual Warm source and native 4B tone/output graph at steady state. Seeded source; native 4x ceiling oversampling differs from sample renderer.'
      };
    }, process.cwd().replaceAll('\\', '/'));
    assert.ok(report.control.rmsError < .0001, JSON.stringify(report.control));
    // Native AudioWorklet in OfflineAudioContext, including published Septon and single-pair diagnostics.
    report.offlineWorklet = await page.evaluate(async () => {
      const {
          warm,
          render
        } = await import('/dsp.ts'),
        {
          PRESETS,
          diagnostic
        } = await import('/model.ts'),
        {
          workletUrl
        } = await import('/audio.ts');
      const results = [];
      for (const r of [diagnostic(PRESETS[1], 'single'), diagnostic(PRESETS[1], 'septon'), PRESETS[1], PRESETS[4]]) {
        const o = {
            sampleRate: 48000,
            startSeconds: 900,
            durationSeconds: 6,
            selection: 'combined',
            fade: false
          },
          wave = warm(48000, r.sampleSeed),
          ctx = new OfflineAudioContext(2, 48000 * 6, 48000);
        await ctx.audioWorklet.addModule(workletUrl);
        const node = new AudioWorkletNode(ctx, 'acoustic-laboratory-v1', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          processorOptions: {
            recipe: r,
            options: o,
            wave
          }
        });
        node.connect(ctx.destination);
        const actual = await ctx.startRendering(),
          expected = render(r, o, wave);
        let maxError = 0;
        for (let c = 0; c < 2; c++) for (let i = 0; i < actual.length; i++) maxError = Math.max(maxError, Math.abs(actual.getChannelData(c)[i] - expected[c][i]));
        node.disconnect();
        node.port.close();
        results.push({
          id: r.name,
          maxError,
          frames: actual.length
        });
      }
      return results;
    });
    for (const r of report.offlineWorklet) assert.ok(r.maxError < 1e-7, JSON.stringify(r));
    report.noiseMovement = await page.evaluate(async () => {
      const {
          warm,
          render,
          measure,
          spectrum
        } = await import('/dsp.ts'),
        {
          PRESETS
        } = await import('/model.ts'),
        wave = warm(48000, 104729);
      return PRESETS.map(r => {
        const pcm = render(r, {
            sampleRate: 48000,
            startSeconds: 600,
            durationSeconds: r.id === 'timeless' ? 120 : 30,
            selection: 'noise',
            fade: false
          }, wave),
          metrics = measure(pcm, 48000),
          correlations = metrics.windows.map(w => w.correlation),
          levels = metrics.windows.flatMap(w => w.rms);
        return {
          id: r.id,
          metrics,
          correlationRange: Math.max(...correlations) - Math.min(...correlations),
          oneSecondRmsRatio: Math.max(...levels) / Math.min(...levels),
          noiseSpectra: pcm.map(c => spectrum(c, 48000))
        };
      });
    });
    for (const m of report.noiseMovement) {
      assert.ok(m.oneSecondRmsRatio < 1.5);
      if (m.id === 'reference') assert.ok(m.correlationRange < 1e-10);else assert.ok(m.correlationRange > 1e-5);
    }
    // Bounded six-pair desktop stress; browser process CPU includes worklet, main-thread and test activity.
    const cdp = await browser.newBrowserCDPSession(),
      beforeCpu = await cdp.send('SystemInfo.getProcessInfo'),
      stressStart = Date.now();
    await page.evaluate(async () => {
      const q = window.labQA,
        {
          pair,
          duplicate
        } = await import('/model.ts'),
        r = duplicate(q.presets[2]);
      r.carrierPairs = Array.from({
        length: 6
      }, (_, i) => pair(100 + i * 100, 4, 1, String(i)));
      r.output.toneLevel = .3;
      r.noise.level = .35;
      r.noise.mix = .3;
      r.noise.movementDepth = .8;
      r.modulations.am.enabled = true;
      r.modulations.am.depth = .15;
      window.stressRecipe = r;
      await q.player.start(r, {
        ...q.options,
        durationSeconds: 60
      });
    });
    await wait(20000);
    report.stress = await page.evaluate(async () => {
      const q = window.labQA,
        capture = await q.player.capture(2),
        {
          measure
        } = await import('/dsp.ts');
      return {
        diagnostics: q.player.diagnostics(),
        captured: measure([capture.left, capture.right], capture.sampleRate),
        jsHeap: performance.memory?.usedJSHeapSize ?? null,
        underrunCount: 'Not exposed by this browser API; software continuity inspected, no hardware driver certification',
        duration: 'Approximately 20s six active pairs, maximum tone/noise/movement and optional AM',
        physicalAndroidTest: false
      };
    });
    const afterCpu = await cdp.send('SystemInfo.getProcessInfo');
    report.stress.elapsedSeconds = (Date.now() - stressStart) / 1000;
    report.stress.totalBrowserProcessCpuSeconds = afterCpu.processInfo.reduce((s, p) => s + p.cpuTime, 0) - beforeCpu.processInfo.reduce((s, p) => s + p.cpuTime, 0);
    assert.equal(report.stress.diagnostics.activeGraphs, 1);
    assert.equal(report.stress.captured.invalidSamples, 0);
    assert.ok(Math.max(...report.stress.captured.peak) < .2);
    await page.evaluate(() => window.labQA.player.stop());
    report.maximumExport = await page.evaluate(async () => {
      const q = window.labQA,
        result = await q.workerJob('render', q.presets[2], {
          sampleRate: 48000,
          startSeconds: 900,
          durationSeconds: 120,
          selection: 'combined'
        });
      return {
        bytes: result.wav.byteLength,
        metrics: result.metrics,
        milliseconds: result.renderMilliseconds
      };
    });
    assert.equal(report.maximumExport.bytes, 23040044);
    assert.equal(report.maximumExport.metrics.invalidSamples, 0);
    // Width/large text, keyboard, dark mode. Only visible fields are counted.
    for (const width of [320, 360, 390, 430]) for (const font of [16, 24, 32]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      await page.evaluate(font => document.documentElement.style.fontSize = font + 'px', font);
      const layout = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll('input,select,button,textarea,summary')].filter(x => x.getClientRects().length).map(x => ({
          tag: x.tagName,
          rect: x.getBoundingClientRect().toJSON()
        }))
      }));
      assert.ok(layout.width <= width, JSON.stringify({
        width,
        font,
        scroll: layout.width
      }));
      for (const c of layout.controls) {
        assert.ok(c.rect.left >= 0 && c.rect.right <= width + .2);
        if (c.tag !== 'INPUT' || c.rect.width > 25) assert.ok(c.rect.height >= 48, JSON.stringify({
          width,
          font,
          ...c
        }));
      }
      report.layouts.push({
        width,
        font,
        scroll: layout.width,
        controls: layout.controls.length
      });
      if (font === 32) await page.screenshot({
        path: path.join(output, `lab-${width}-large-text.png`),
        fullPage: true
      });
    }
    await page.evaluate(() => document.documentElement.style.fontSize = '16px');
    await page.setViewportSize({
      width: 1300,
      height: 950
    });
    await page.emulateMedia({
      colorScheme: 'dark'
    });
    await page.screenshot({
      path: path.join(output, 'lab-dark.png'),
      fullPage: true
    });
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement !== document.body));
    // Cancellation during async Warm preparation and navigation cleanup.
    await page.getByRole('button', {
      name: 'Start stereo preview',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: 'Stop audio / cancel',
      exact: true
    }).click();
    await wait(1800);
    assert.equal(await page.evaluate(() => window.labQA.player.diagnostics().activeGraphs), 0);
    await page.getByRole('button', {
      name: 'Start stereo preview',
      exact: true
    }).click();
    await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 1);
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 0);
    report.stopNavigationLateWork = true;
    assert.equal(await page.evaluate(() => indexedDB.databases().then(x => x.length)), 0);
    assert.equal(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(x => x.length)), 0);
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log('Native lab: all presets, live/offline parity, downloads/import, matched comparison, layouts and cleanup PASS');
  } catch (error) {
    report.error = String(error);
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'native-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
