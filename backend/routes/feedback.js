const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
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
const csvUpload = multer({ storage: csvStorage });

// SSE feedback loop endpoint
router.post('/:client/upload-csv', csvUpload.single('csv'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });
  res.json({ success: true, filename: req.file.filename, path: req.file.path });
});

router.get('/:client/run', async (req, res) => {
  const clientSlug = req.params.client;
  const clientDir = path.join(CLIENTS_DIR, clientSlug);
  const iterationNum = parseInt(req.query.iteration) || 2;

  const feedbackDir = path.join(clientDir, 'feedback');
  if (!fs.existsSync(feedbackDir)) {
    return res.status(400).json({ error: 'No feedback data. Upload Meta CSV first.' });
  }

  const csvFiles = fs.readdirSync(feedbackDir).filter(f => f.endsWith('.csv'));
  if (!csvFiles.length) {
    return res.status(400).json({ error: 'No CSV file found. Upload Meta performance data first.' });
  }

  const csvPath = path.join(feedbackDir, csvFiles.sort().pop());

  // SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const onProgress = (event) => { send(event); console.log(`[Feedback] ${event.message}`); };

  try {
    send({ type: 'start', message: `🔄 Feedback loop started — Iteration ${iterationNum}`, timestamp: new Date().toISOString() });
    const result = await runFeedback(clientDir, csvPath, iterationNum, onProgress);
    send({ type: 'complete', message: `✅ Iteration ${iterationNum} complete — ${result.iterations.length} new creatives`, data: result.analysis });
  } catch (e) {
    send({ type: 'error', message: `❌ Feedback error: ${e.message}` });
  } finally {
    res.end();
  }
});

// Get latest feedback report
router.get('/:client/report', (req, res) => {
  const clientDir = path.join(CLIENTS_DIR, req.params.client);
  const outputDir = path.join(clientDir, 'output');

  const reports = [];
  if (fs.existsSync(outputDir)) {
    fs.readdirSync(outputDir)
      .filter(f => f.startsWith('feedback_analysis_v'))
      .forEach(f => {
        const data = JSON.parse(fs.readFileSync(path.join(outputDir, f)));
        reports.push(data);
      });
  }

  res.json({ reports: reports.sort((a, b) => b.iteration_num - a.iteration_num) });
});

// Get Meta CSV template
router.get('/csv-template', (req, res) => {
  const template = 'ad_name,impressions,reach,clicks,ctr,cpc,cpm,spend,conversions,cpa,conversion_rate,thumb_stop_rate,frequency\n' +
    'FORMAT-01-VERSION-A,15420,12300,185,1.20,0.85,22.50,157.25,12,13.10,6.49,35.2,1.25\n' +
    'FORMAT-01-VERSION-B,14200,11800,142,1.00,0.98,24.10,142.80,8,17.85,5.63,28.4,1.20\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="meta_results_template.csv"');
  res.send(template);
});

module.exports = router;
