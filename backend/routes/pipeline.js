const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const { runResearch } = require('../steps/research');
const { runStrategy } = require('../steps/strategy');
const { runCreative } = require('../steps/creative');
const { runReview } = require('../steps/review');
const { clientExistsInSupabase, ensureClientRow, getClientMeta, saveManifest, getContextAsync, getBriefsAsync, getManifestAsync } = require('../utils/db');

const CLIENTS_DIR = path.join(__dirname, '..', 'clients');
const FORMATS_PATH = path.join(__dirname, '..', 'formats', 'format_library.json');

// SSE endpoint — streams real-time progress to frontend
router.get('/:client/run', async (req, res) => {
  const clientSlug = req.params.client;
  const clientDir = path.join(CLIENTS_DIR, clientSlug);

  const inFs = fs.existsSync(clientDir);
  const inDb = await clientExistsInSupabase(clientSlug);
  if (!inFs && !inDb) {
    return res.status(404).json({ error: 'Client not found' });
  }

  fs.mkdirSync(clientDir, { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'output', 'images'), { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'output', 'prompts'), { recursive: true });
  await ensureClientRow(clientSlug, getClientMeta(clientSlug));

  const {
    steps = 'research,strategy,creative,review',
    skipImages = 'false',
    formatFilter = 'all'
  } = req.query;

  const stepsToRun = steps.split(',');

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  const onProgress = (event) => {
    send(event);
    console.log(`[${clientSlug}] ${event.message}`);
  };

  try {
    send({ type: 'start', message: `🚀 Pipeline started for ${clientSlug}`, timestamp: new Date().toISOString() });

    let context = null;
    let briefs = null;
    let creativeResults = null;

    // STEP 1: RESEARCH
    if (stepsToRun.includes('research')) {
      context = await runResearch(clientDir, onProgress);
    } else {
      context = await getContextAsync(clientSlug);
      if (!context) throw new Error('No master context. Run research step first.');
      send({ step: 'research', status: 'skipped', message: '⏭️  Research skipped — using saved context' });
    }

    // STEP 2: STRATEGY
    if (stepsToRun.includes('strategy')) {
      let formats = JSON.parse(fs.readFileSync(FORMATS_PATH));
      if (formatFilter !== 'all') {
        const ids = formatFilter.split(',');
        formats = formats.filter(f => ids.includes(f.id));
      }
      briefs = await runStrategy(clientDir, context, formats, onProgress);
    } else {
      briefs = await getBriefsAsync(clientSlug);
      if (!briefs) throw new Error('No briefs. Run strategy step first.');
      send({ step: 'strategy', status: 'skipped', message: `⏭️  Strategy skipped — using ${briefs.length} saved briefs` });
    }

    // STEP 3: CREATIVE
    if (stepsToRun.includes('creative')) {
      creativeResults = await runCreative(clientDir, briefs, context, onProgress, skipImages === 'true');
    } else {
      creativeResults = await getManifestAsync(clientSlug);
      if (!creativeResults?.length) throw new Error('No manifest. Run creative step first.');
      send({ step: 'creative', status: 'skipped', message: `⏭️  Creative skipped — using ${creativeResults.length} saved creatives` });
    }

    // STEP 4: REVIEW
    if (stepsToRun.includes('review') && creativeResults) {
      await runReview(clientDir, creativeResults, context, onProgress);
    }

    send({
      type: 'complete',
      message: '🎉 Pipeline complete! Check the Creatives tab for results.',
      timestamp: new Date().toISOString()
    });

  } catch (e) {
    send({ type: 'error', message: `❌ Pipeline error: ${e.message}`, error: e.message });
    console.error('[Pipeline Error]', e);
  } finally {
    res.end();
  }
});

// Retry a single image by label — SSE endpoint
router.get('/:client/retry-image/:label', async (req, res) => {
  const clientSlug = req.params.client;
  const label = req.params.label;
  const clientDir = path.join(CLIENTS_DIR, clientSlug);

  fs.mkdirSync(clientDir, { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'output', 'images'), { recursive: true });
  await ensureClientRow(clientSlug, getClientMeta(clientSlug));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => { res.write(`data: ${JSON.stringify(data)}\n\n`); if (typeof res.flush === 'function') res.flush(); };
  const onProgress = (event) => { send(event); console.log(`[${clientSlug}] ${event.message}`); };

  try {
    const manifest = await getManifestAsync(clientSlug);
    const context = await getContextAsync(clientSlug);

    if (!manifest?.length) { send({ type: 'error', message: 'No manifest found' }); return res.end(); }
    if (!context) { send({ type: 'error', message: 'No master context found' }); return res.end(); }
    const entry = manifest.find(m => m.label === label);

    if (!entry) {
      send({ type: 'error', message: `Label ${label} not found in manifest` });
      return res.end();
    }

    send({ type: 'start', message: `🔄 Retrying image for ${label}...` });

    const results = await runCreative(clientDir, [entry.brief].filter(Boolean), context, onProgress, false);
    const retried = results.find(r => r.label === label);

    if (retried) {
      const idx = manifest.findIndex(m => m.label === label);
      if (idx !== -1) manifest[idx] = retried;
      await saveManifest(clientSlug, manifest);
    }

    send({
      type: 'complete',
      message: retried?.status === 'success' ? `✅ ${label} — Image generated!` : `❌ ${label} — Still failed`,
      status: retried?.status,
      image_url: retried?.image_url
    });
  } catch (e) {
    send({ type: 'error', message: `❌ Retry error: ${e.message}` });
  } finally {
    res.end();
  }
});

// Retry only failed images — SSE endpoint
router.get('/:client/retry-images', async (req, res) => {
  const clientSlug = req.params.client;
  const clientDir = path.join(CLIENTS_DIR, clientSlug);

  fs.mkdirSync(clientDir, { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'output', 'images'), { recursive: true });
  await ensureClientRow(clientSlug, getClientMeta(clientSlug));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => { res.write(`data: ${JSON.stringify(data)}\n\n`); if (typeof res.flush === 'function') res.flush(); };
  const onProgress = (event) => { send(event); console.log(`[${clientSlug}] ${event.message}`); };

  try {
    const manifest = await getManifestAsync(clientSlug);
    const context = await getContextAsync(clientSlug);

    if (!manifest?.length) { send({ type: 'complete', message: '✅ No manifest found.' }); return res.end(); }
    if (!context) { send({ type: 'error', message: 'No master context found.' }); return res.end(); }
    const failed = manifest.filter(m => m.status === 'error' || m.status === 'pending');

    if (failed.length === 0) {
      send({ type: 'complete', message: '✅ No failed images to retry.' });
      return res.end();
    }

    send({ type: 'start', message: `🔄 Retrying ${failed.length} failed images...` });

    // Extract briefs from manifest entries
    const briefs = failed.map(m => m.brief).filter(Boolean);
    const retryResults = await runCreative(clientDir, briefs, context, onProgress, false);

    // Merge retry results back into manifest
    retryResults.forEach(r => {
      const idx = manifest.findIndex(m => m.label === r.label);
      if (idx !== -1) manifest[idx] = r;
    });
    await saveManifest(clientSlug, manifest);

    const newSuccess = retryResults.filter(r => r.status === 'success').length;
    send({ type: 'complete', message: `✅ Retry complete — ${newSuccess}/${failed.length} images now generated.` });
  } catch (e) {
    send({ type: 'error', message: `❌ Retry error: ${e.message}` });
  } finally {
    res.end();
  }
});

// Get pipeline status for a client
router.get('/:client/status', (req, res) => {
  const clientDir = path.join(CLIENTS_DIR, req.params.client);
  const outputDir = path.join(clientDir, 'output');

  const status = {
    research: fs.existsSync(path.join(outputDir, 'master_context.json')),
    strategy: fs.existsSync(path.join(outputDir, 'content_briefs.json')),
    creative: fs.existsSync(path.join(outputDir, 'creative_manifest.json')),
    review: fs.existsSync(path.join(outputDir, 'review_report.json'))
  };

  const briefsCount = status.strategy
    ? JSON.parse(fs.readFileSync(path.join(outputDir, 'content_briefs.json'))).length : 0;
  const creativesCount = status.creative
    ? JSON.parse(fs.readFileSync(path.join(outputDir, 'creative_manifest.json'))).filter(m => m.status === 'success').length : 0;

  res.json({ ...status, briefsCount, creativesCount });
});

module.exports = router;
