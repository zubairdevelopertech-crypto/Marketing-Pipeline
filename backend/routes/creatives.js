const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const CLIENTS_DIR = path.join(__dirname, '..', 'clients');
const { getManifestForApi, getReviewForApi, normalizeCreativeImageUrl, getImageFromStorage } = require('../utils/db');

// Serve generated image — filesystem first, Supabase Storage fallback
router.get('/:client/images/:filename', async (req, res) => {
  const slug = req.params.client;
  const safe = path.basename(req.params.filename);
  if (!/^[\w.-]+\.(jpe?g|png)$/i.test(safe)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const imgPath = path.join(CLIENTS_DIR, slug, 'output', 'images', safe);
  if (!imgPath.startsWith(CLIENTS_DIR)) return res.status(400).end();
  const ct = safe.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (fs.existsSync(imgPath)) {
    res.setHeader('Content-Type', ct);
    return fs.createReadStream(imgPath).pipe(res);
  }

  // Try Supabase Storage as fallback (for Vercel deploys where fs is ephemeral)
  const label = safe.replace(/\.(jpe?g|png)$/i, '');
  const bytes = await getImageFromStorage(slug, label);
  if (bytes) {
    res.setHeader('Content-Type', ct);
    return res.send(bytes);
  }

  res.status(404).end();
});

// Get all creatives for a client (manifest file or Supabase)
router.get('/:client', async (req, res) => {
  const slug = req.params.client;
  const clientDir = path.join(CLIENTS_DIR, slug);
  const outputDir = path.join(clientDir, 'output');
  const manifestPath = path.join(outputDir, 'creative_manifest.json');
  const reviewPath = path.join(outputDir, 'review_report.json');
  const promptsDir = path.join(outputDir, 'prompts');

  let manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath))
    : await getManifestForApi(slug);

  if (!manifest?.length) {
    return res.json({ creatives: [], top10: [], total: 0 });
  }

  let review = null;
  if (fs.existsSync(reviewPath)) {
    review = JSON.parse(fs.readFileSync(reviewPath));
  } else {
    review = await getReviewForApi(slug);
  }

  let top10 = [];

  if (review) {
    top10 = review.top_10 || [];

    const scoreMap = {};
    (review.full_rankings || []).forEach(s => { scoreMap[s.label] = s; });

    manifest.forEach(m => {
      m.image_url = normalizeCreativeImageUrl(slug, m);
      if (scoreMap[m.label]) {
        m.score = scoreMap[m.label].total_score;
        m.ctr_tier = scoreMap[m.label].predicted_ctr_tier;
        m.audience = scoreMap[m.label].recommended_audience;
        m.strengths = scoreMap[m.label].strengths;
        m.weakness = scoreMap[m.label].weakness;
        m.improvement = scoreMap[m.label].improvement;
      }
      m.is_top10 = top10.includes(m.label);

      const promptPath = path.join(promptsDir, `${m.label}.json`);
      if (fs.existsSync(promptPath)) {
        const p = JSON.parse(fs.readFileSync(promptPath));
        m.headline = p.headline;
        m.subheadline = p.subheadline;
        m.body_copy = p.body_copy;
        m.cta_text = p.cta_text;
      }
    });
  } else {
    manifest.forEach(m => { m.image_url = normalizeCreativeImageUrl(slug, m); });
  }

  manifest.sort((a, b) => (b.score || 0) - (a.score || 0));
  res.json({ creatives: manifest, top10, total: manifest.length });
});

// Get iteration creatives
router.get('/:client/iterations/:num', (req, res) => {
  const clientDir = path.join(CLIENTS_DIR, req.params.client);
  const analysisPath = path.join(clientDir, 'output', `feedback_analysis_v${req.params.num}.json`);

  if (!fs.existsSync(analysisPath)) {
    return res.json({ iterations: [] });
  }

  const data = JSON.parse(fs.readFileSync(analysisPath));
  res.json({ iterations: data.iterations || [], analysis: data });
});

// Export content briefs as JSON download
router.get('/:client/export/briefs', (req, res) => {
  const briefsPath = path.join(CLIENTS_DIR, req.params.client, 'output', 'content_briefs.json');
  if (!fs.existsSync(briefsPath)) return res.status(404).json({ error: 'No briefs found. Run the Strategy step first.' });
  res.download(briefsPath, `${req.params.client}_content_briefs.json`);
});

// Export master context as JSON download
router.get('/:client/export/context', (req, res) => {
  const ctxPath = path.join(CLIENTS_DIR, req.params.client, 'output', 'master_context.json');
  if (!fs.existsSync(ctxPath)) return res.status(404).json({ error: 'No master context found. Run the Research step first.' });
  res.download(ctxPath, `${req.params.client}_master_context.json`);
});

// Export review report as JSON download
router.get('/:client/export/review', (req, res) => {
  const reviewPath = path.join(CLIENTS_DIR, req.params.client, 'output', 'review_report.json');
  if (!fs.existsSync(reviewPath)) return res.status(404).json({ error: 'No review report found. Run the Review step first.' });
  res.download(reviewPath, `${req.params.client}_review_report.json`);
});

// Export review summary as Markdown download
router.get('/:client/export/review-md', (req, res) => {
  const mdPath = path.join(CLIENTS_DIR, req.params.client, 'output', 'review_summary.md');
  if (!fs.existsSync(mdPath)) return res.status(404).json({ error: 'No review summary found.' });
  res.download(mdPath, `${req.params.client}_review_summary.md`);
});

// Export all image prompts as ZIP
router.get('/:client/export/prompts', (req, res) => {
  const promptsDir = path.join(CLIENTS_DIR, req.params.client, 'output', 'prompts');
  if (!fs.existsSync(promptsDir)) return res.status(404).json({ error: 'No prompts found. Run the Creative step first.' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.client}_image_prompts.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(promptsDir, false);
  archive.finalize();
});

// Export complete client package (all JSONs + images) as ZIP
router.get('/:client/export/full', (req, res) => {
  const outputDir = path.join(CLIENTS_DIR, req.params.client, 'output');
  if (!fs.existsSync(outputDir)) return res.status(404).json({ error: 'No output found for this client.' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.client}_full_export.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);

  // Add key JSON files
  const jsonFiles = ['master_context.json', 'content_briefs.json', 'creative_manifest.json', 'review_report.json', 'review_summary.md'];
  jsonFiles.forEach(f => {
    const fp = path.join(outputDir, f);
    if (fs.existsSync(fp)) archive.file(fp, { name: f });
  });

  // Add images folder
  const imagesDir = path.join(outputDir, 'images');
  if (fs.existsSync(imagesDir)) archive.directory(imagesDir, 'images');

  // Add prompts folder
  const promptsDir = path.join(outputDir, 'prompts');
  if (fs.existsSync(promptsDir)) archive.directory(promptsDir, 'prompts');

  archive.finalize();
});

// Download all images as zip
router.get('/:client/download', (req, res) => {
  const imagesDir = path.join(CLIENTS_DIR, req.params.client, 'output', 'images');
  if (!fs.existsSync(imagesDir)) return res.status(404).json({ error: 'No images found' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.client}_creatives.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(imagesDir, false);
  archive.finalize();
});

// Download top 10 only
router.get('/:client/download-top10', (req, res) => {
  const outputDir = path.join(CLIENTS_DIR, req.params.client, 'output');
  const reviewPath = path.join(outputDir, 'review_report.json');
  const imagesDir = path.join(outputDir, 'images');

  if (!fs.existsSync(reviewPath)) return res.status(404).json({ error: 'No review report found' });

  const review = JSON.parse(fs.readFileSync(reviewPath));
  const top10 = review.top_10 || [];

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.client}_top10.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  top10.forEach(label => {
    const imgPath = path.join(imagesDir, `${label}.jpg`);
    if (fs.existsSync(imgPath)) archive.file(imgPath, { name: `${label}.jpg` });
  });
  archive.finalize();
});

module.exports = router;
