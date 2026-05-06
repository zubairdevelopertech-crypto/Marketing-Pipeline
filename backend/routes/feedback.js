const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const { runFeedback } = require('../steps/feedback');

const CLIENTS_DIR = path.join(__dirname, '..', 'clients');

const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(CLIENTS_DIR, req.params.client, 'feedback');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `meta_data_${Date.now()}.csv`)
});
const csvUpload = multer({ storage: csvStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// Upload Meta CSV
router.post('/:client/upload-csv', csvUpload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file received' });
  res.json({ success: true, filename: req.file.filename });
});

// Run feedback loop — SSE endpoint
router.get('/:client/run', async (req, res) => {
  const clientSlug   = req.params.client;
  const clientDir    = path.join(CLIENTS_DIR, clientSlug);
  const iterationNum = Math.max(2, parseInt(req.query.iteration) || 2);

  const feedbackDir = path.join(clientDir, 'feedback');
  if (!fs.existsSync(feedbackDir)) {
    return res.status(400).json({ error: 'No feedback directory. Upload Meta CSV first.' });
  }
  const csvFiles = fs.readdirSync(feedbackDir).filter(f => f.endsWith('.csv'));
  if (!csvFiles.length) {
    return res.status(400).json({ error: 'No CSV found. Upload Meta CSV first.' });
  }

  const csvPath = path.join(feedbackDir, [...csvFiles].sort().pop());

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
    if (event.message) console.log(`[Feedback] ${event.message}`);
  };

  try {
    send({ type: 'start', message: `Feedback loop started — Iteration ${iterationNum}`, timestamp: new Date().toISOString() });
    const result = await runFeedback(clientDir, csvPath, iterationNum, onProgress);
    send({
      type: 'complete',
      message: `Iteration ${iterationNum} complete — ${result.iterations.length} new creatives generated`,
      data: result.analysis,
      iterations: result.iterations
    });
  } catch (e) {
    send({ type: 'error', message: `Feedback error: ${e.message}` });
    console.error('[Feedback]', e);
  } finally {
    res.end();
  }
});

// Get all saved feedback reports for a client
router.get('/:client/reports', (req, res) => {
  const outputDir = path.join(CLIENTS_DIR, req.params.client, 'output');
  if (!fs.existsSync(outputDir)) return res.json({ reports: [] });
  const reports = fs.readdirSync(outputDir)
    .filter(f => f.startsWith('feedback_analysis_v') && f.endsWith('.json'))
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(outputDir, f))); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.iteration_num - a.iteration_num);
  res.json({ reports });
});

// Serve iteration images
router.get('/:client/images/iteration_:num/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);
  if (!/^[\w.-]+\.(jpe?g|png)$/i.test(safe)) return res.status(400).end();
  const imgPath = path.join(CLIENTS_DIR, req.params.client, 'output', 'images', `iteration_${req.params.num}`, safe);
  if (!fs.existsSync(imgPath)) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Type', safe.endsWith('.png') ? 'image/png' : 'image/jpeg');
  fs.createReadStream(imgPath).pipe(res);
});

// Retry a single failed feedback image — SSE endpoint
router.get('/:client/retry-image/:iternum/:label', async (req, res) => {
  const { client, iternum, label } = req.params;
  const clientDir  = path.join(CLIENTS_DIR, client);
  const outputDir  = path.join(clientDir, 'output');
  const iterNum    = parseInt(iternum) || 2;
  const imagesDir  = path.join(outputDir, 'images', `iteration_${iterNum}`);
  const analysisPath = path.join(outputDir, `feedback_analysis_v${iterNum}.json`);

  fs.mkdirSync(imagesDir, { recursive: true });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (d) => { res.write(`data: ${JSON.stringify(d)}\n\n`); if (typeof res.flush === 'function') res.flush(); };

  try {
    if (!fs.existsSync(analysisPath)) throw new Error('No analysis found for this iteration');
    const analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf-8'));
    const iteration = (analysis.iterations || []).find(it => it.label === label);
    if (!iteration) throw new Error(`Label ${label} not found in iteration ${iterNum}`);
    if (!iteration.nano_banana_prompt) throw new Error('No image prompt saved for this iteration');

    send({ type: 'start', message: `Retrying ${label}…` });

    const { generateImage }         = require('../utils/gemini');
    const { uploadImageToStorage }  = require('../utils/db');

    const imageBytes = await generateImage(iteration.nano_banana_prompt, [], {
      retries: 5,
      onRetry: (att, total, code, delaySec) => send({ type: 'progress', message: `Gemini busy (${code}), retry ${att}/${total} in ${delaySec}s…` })
    });

    const imagePath = path.join(imagesDir, `${label}.jpg`);
    fs.writeFileSync(imagePath, imageBytes);

    const storageUrl = await uploadImageToStorage(client, `iteration_${iterNum}/${label}`, imageBytes).catch(() => null);
    const image_url  = storageUrl || `/api/feedback/${client}/images/iteration_${iterNum}/${label}.jpg`;

    // Patch analysis file
    const idx = analysis.iterations.findIndex(it => it.label === label);
    if (idx !== -1) { analysis.iterations[idx].image_url = image_url; analysis.iterations[idx].status = 'success'; }
    fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

    send({ type: 'complete', label, image_url, message: `✅ ${label} — image ready`, status: 'success',
      headline: iteration.headline, subheadline: iteration.subheadline,
      body_copy: iteration.body_copy, cta_text: iteration.cta_text,
      change_made: iteration.change_made, source_ad: iteration.source_ad
    });
  } catch (e) {
    send({ type: 'error', label, message: `❌ Retry failed: ${e.message}` });
  } finally {
    res.end();
  }
});

// Download Meta CSV template
router.get('/csv-template', (req, res) => {
  const rows = [
    'ad_name,impressions,reach,clicks,ctr,cpc,cpm,spend,conversions,cost_per_result,frequency',
    'FORMAT-01-VERSION-A,15420,12300,185,1.20,0.85,22.50,157.25,12,13.10,1.25',
    'FORMAT-01-VERSION-B,14200,11800,142,1.00,0.98,24.10,142.80,8,17.85,1.20',
    'FORMAT-02-VERSION-A,11000,9500,98,0.89,1.12,28.00,95.00,5,19.00,1.15',
    'FORMAT-09-VERSION-A,8500,7200,75,0.88,1.25,32.00,78.00,3,26.00,1.10',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="meta_results_template.csv"');
  res.send(rows);
});

module.exports = router;
