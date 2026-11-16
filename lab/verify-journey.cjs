/* Native Chrome, disposable browser data, separate localhost lab. No production data. */
const {
  chromium
} = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const output = path.resolve('qa/journey');
fs.mkdirSync(output, {
  recursive: true
});
const report = {
  date: new Date().toISOString(),
  errors: [],
  layouts: [],
  parity: [],
  desktopChromeOnly: true,
  physicalHeadphoneListening: false
};
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
  });
  const page = await browser.newPage({
    viewport: {
      width: 1300,
      height: 950
    },
    acceptDownloads: true
  });
  page.on('pageerror', e => report.errors.push(e.message));
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    window.audioAudit = {
      active: 0,
      peak: 0,
      created: 0
    };
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        window.audioAudit.active++;
        window.audioAudit.created++;
        window.audioAudit.peak = Math.max(window.audioAudit.peak, window.audioAudit.active);
      }
      async close() {
        await super.close();
        window.audioAudit.active--;
      }
    };
  });
  try {
    await page.goto('http://127.0.0.1:4187/');
    await page.getByRole('link', {
      name: 'Build a journey',
      exact: true
    }).click();
    await page.getByRole('heading', {
      name: 'Build a journey',
      exact: true
    }).waitFor();
    assert.match(await page.locator('.journey-total').textContent(), /20:00/);
    await page.getByRole('button', {
      name: 'Make a short test version',
      exact: true
    }).click();
    await page.getByLabel('Journey name', {
      exact: true
    }).fill('Evening journey');
    await page.getByLabel('Journey name', {
      exact: true
    }).press('Tab');
    const input = page.getByLabel('Journey transition seconds', {
      exact: true
    });
    await input.fill('6');
    await input.press('Tab');
    await page.getByRole('button', {
      name: 'Move stop 4 earlier',
      exact: true
    }).click();
    assert.equal(await page.getByLabel('Journey stop 3 environment', {
      exact: true
    }).inputValue(), 'open');
    await page.getByRole('button', {
      name: 'Repeat stop 2',
      exact: true
    }).click();
    assert.equal(await page.locator('.journey-stops>li').count(), 5);
    await page.getByRole('button', {
      name: 'Remove stop 3',
      exact: true
    }).click();
    await page.getByLabel('Add journey environment', {
      exact: true
    }).selectOption('timeless');
    await page.getByRole('button', {
      name: 'Add journey stop',
      exact: true
    }).click();
    assert.equal(await page.locator('.journey-stops>li').count(), 5);
    await page.getByRole('button', {
      name: 'Remove stop 5',
      exact: true
    }).click();
    assert.match(await page.locator('.journey-total').textContent(), /2:00/);
    await page.getByRole('button', {
      name: 'Save journey locally',
      exact: true
    }).click();
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('breathwork-buddy-acoustic-journeys-v1'))[0]);
    assert.equal(snapshot.timeline.durationSeconds, 120);
    assert.deepEqual(snapshot.stages.map(s => s.recipe.id), ['threshold', 'expansion', 'open', 'timeless']);
    const exported = page.waitForEvent('download');
    await page.getByRole('button', {
      name: 'Export journey JSON',
      exact: true
    }).click();
    const saved = path.join(output, 'evening.journey.json');
    await (await exported).saveAs(saved);
    assert.deepEqual(JSON.parse(fs.readFileSync(saved, 'utf8')), snapshot);
    await page.getByRole('button', {
      name: 'Reset journey',
      exact: true
    }).click();
    await page.getByLabel('Import journey JSON', {
      exact: true
    }).setInputFiles(saved);
    await page.waitForFunction(() => document.querySelector('input[aria-label="Journey name"]').value === 'Evening journey');
    assert.match(await page.locator('.journey-total').textContent(), /2:00/);
    await page.getByLabel('Import journey JSON', {
      exact: true
    }).setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"schemaVersion":2}')
    });
    await page.locator('.journey [role=alert]').waitFor();
    assert.equal(await page.getByLabel('Journey name', {
      exact: true
    }).inputValue(), 'Evening journey');
    await page.reload();
    await page.getByLabel('Restore a saved journey', {
      exact: true
    }).selectOption(snapshot.id);
    assert.match(await page.locator('.journey-total').textContent(), /2:00/);
    report.saveRestoreRoundTrip = true;
    // Actual continuous graph through each incoming transition, with live worklet capture.
    for (const index of [1, 2, 3]) {
      await page.getByLabel('Journey preview position', {
        exact: true
      }).selectOption(`transition-${snapshot.stages[index].id}`);
      await page.getByLabel('Journey excerpt length', {
        exact: true
      }).selectOption('15');
      await page.getByRole('button', {
        name: 'Preview journey excerpt',
        exact: true
      }).click();
      await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 1);
      await page.waitForFunction(() => document.querySelector('.journey-state').textContent.includes('→'));
      const from = index * 30 - 8;
      const measurement = await page.evaluate(async ({
        journey,
        from
      }) => {
        const q = window.labQA,
          {
            renderProgram
          } = await import('/program.ts'),
          {
            warm,
            measure
          } = await import('/dsp.ts');
        const captured = await q.player.capture(1),
          wave = warm(captured.sampleRate, journey.sampleSeed);
        const o = {
          sampleRate: captured.sampleRate,
          startSeconds: from + captured.firstFrame / captured.sampleRate,
          durationSeconds: 1,
          selection: 'combined',
          fade: false
        };
        const expected = renderProgram(journey, o, wave);
        let maxError = 0;
        for (let c = 0; c < 2; c++) {
          const actual = c ? captured.right : captured.left;
          for (let i = 0; i < actual.length; i++) maxError = Math.max(maxError, Math.abs(actual[i] - expected[c][i]));
        }
        return {
          maxError,
          firstFrame: captured.firstFrame,
          metrics: measure([captured.left, captured.right], captured.sampleRate),
          diagnostics: q.player.diagnostics(),
          audit: window.audioAudit
        };
      }, {
        journey: snapshot,
        from
      });
      assert.equal(measurement.maxError, 0);
      assert.ok(measurement.diagnostics.measuredLiveRms > 0);
      assert.equal(measurement.audit.active, 1);
      report.parity.push({
        transition: index,
        ...measurement
      });
      await page.getByRole('button', {
        name: 'Stop journey / cancel',
        exact: true
      }).click();
      await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 0);
      await page.waitForFunction(() => window.audioAudit.active === 0);
    }
    console.log('Three native journey transitions: live/export sample parity and one graph PASS');
    // WAV from the exact UI excerpt, then decode the actual downloaded file.
    const downloads = [];
    const listener = d => downloads.push(d);
    page.on('download', listener);
    await page.getByRole('button', {
      name: 'Export journey WAV excerpt',
      exact: true
    }).click();
    await page.waitForFunction(() => window.labQA.metrics?.metrics?.seconds === 15);
    while (downloads.length < 2) await new Promise(r => setTimeout(r, 30));
    page.off('download', listener);
    for (const d of downloads) await d.saveAs(path.join(output, d.suggestedFilename()));
    const wav = downloads.find(d => d.suggestedFilename().endsWith('.wav'));
    const bytes = fs.readFileSync(path.join(output, wav.suggestedFilename()));
    assert.equal(bytes.length, 44 + 48000 * 15 * 4);
    report.wav = await page.evaluate(async base64 => {
      const ctx = new OfflineAudioContext(2, 48000, 48000),
        decoded = await ctx.decodeAudioData(Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer);
      return {
        channels: decoded.numberOfChannels,
        seconds: decoded.duration,
        sampleRate: decoded.sampleRate
      };
    }, bytes.toString('base64'));
    assert.deepEqual(report.wav, {
      channels: 2,
      seconds: 15,
      sampleRate: 48000
    });
    report.metrics = await page.evaluate(() => window.labQA.metrics.metrics);
    assert.equal(report.metrics.invalidSamples, 0);
    assert.ok(Math.max(...report.metrics.peak) < .08);
    // Full journey starts at zero even when the excerpt position is a later transition.
    await page.getByRole('button', {
      name: 'Start full journey',
      exact: true
    }).click();
    await page.waitForFunction(() => window.labQA.player.diagnostics().activeGraphs === 1);
    assert.ok(await page.evaluate(() => window.labQA.player.diagnostics().positionSeconds < 4));
    // Swap to a standalone environment through the same owner; never two contexts.
    await page.getByRole('button', {
      name: 'Start stereo preview',
      exact: true
    }).click();
    await page.waitForFunction(() => window.labQA.player.diagnostics().programId === 'reference');
    assert.ok(await page.evaluate(() => window.labQA.player.diagnostics().measuredLiveRms > 0));
    await page.getByRole('button', {
      name: 'Stop audio / cancel',
      exact: true
    }).click();
    await page.waitForFunction(() => window.audioAudit.active === 0);
    // 44.1 kHz native OfflineAudioContext worklet uses the same journey sample core.
    report.offline44100 = await page.evaluate(async journey => {
      const {
          warm
        } = await import('/dsp.ts'),
        {
          renderProgram
        } = await import('/program.ts'),
        {
          workletUrl
        } = await import('/audio.ts');
      const o = {
          sampleRate: 44100,
          startSeconds: 24,
          durationSeconds: 8,
          selection: 'combined',
          fade: false
        },
        wave = warm(44100, journey.sampleSeed),
        ctx = new OfflineAudioContext(2, 44100 * 8, 44100);
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'acoustic-laboratory-v1', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          recipe: journey,
          options: o,
          wave
        }
      });
      node.connect(ctx.destination);
      const actual = await ctx.startRendering(),
        expected = renderProgram(journey, o, wave);
      let max = 0;
      for (let c = 0; c < 2; c++) for (let i = 0; i < actual.length; i++) max = Math.max(max, Math.abs(actual.getChannelData(c)[i] - expected[c][i]));
      node.disconnect();
      node.port.close();
      return {
        frames: actual.length,
        maxError: max
      };
    }, snapshot);
    assert.equal(report.offline44100.maxError, 0);
    // Native layout checks include the new journey controls and existing manual generator.
    for (const width of [320, 360, 390, 430]) for (const font of [16, 24, 32]) {
      await page.setViewportSize({
        width,
        height: 900
      });
      await page.evaluate(font => document.documentElement.style.fontSize = font + 'px', font);
      const layout = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        controls: [...document.querySelectorAll('.journey input,.journey select,.journey button')].filter(x => x.getClientRects().length).map(x => ({
          type: x.type,
          rect: x.getBoundingClientRect().toJSON()
        }))
      }));
      assert.ok(layout.scroll <= width, JSON.stringify({
        width,
        font,
        scroll: layout.scroll
      }));
      for (const c of layout.controls) {
        assert.ok(c.rect.right <= width + .1 && c.rect.left >= 0, JSON.stringify(c));
        assert.ok(c.rect.height >= 48, JSON.stringify(c));
      }
      report.layouts.push({
        width,
        font,
        scroll: layout.scroll,
        controls: layout.controls.length
      });
    }
    await page.setViewportSize({
      width: 1300,
      height: 950
    });
    await page.evaluate(() => document.documentElement.style.fontSize = '16px');
    await page.locator('.journey').screenshot({
      path: path.join(output, 'journey-builder.png')
    });
    await page.emulateMedia({
      colorScheme: 'dark'
    });
    await page.locator('.journey').screenshot({
      path: path.join(output, 'journey-dark.png')
    });
    await page.getByRole('button', {
      name: 'Preview journey excerpt',
      exact: true
    }).click();
    await page.getByRole('button', {
      name: 'Stop journey / cancel',
      exact: true
    }).click();
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => window.labQA.player.diagnostics().activeGraphs), 0);
    report.audioAudit = await page.evaluate(() => window.audioAudit);
    assert.equal(report.audioAudit.peak, 1);
    assert.equal(report.audioAudit.active, 0);
    assert.equal(await page.evaluate(() => indexedDB.databases().then(d => d.length)), 0);
    assert.equal(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(d => d.length)), 0);
    assert.deepEqual(report.errors, []);
    report.passed = true;
    console.log('Journey UI, persistence, WAV, 44.1k worklet, layouts, cancellation and standalone swap PASS');
  } catch (error) {
    report.error = String(error);
    report.visibleErrors = await page.locator('.error').allTextContents();
    report.audioState = await page.evaluate(() => window.labQA?.player.diagnostics());
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'native-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
