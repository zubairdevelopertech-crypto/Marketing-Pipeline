const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const {
  saveClient, getAllClients, getClientMeta, getClientMetaAsync,
  getClientDocs, deleteDoc, clientDir, docsDir,
  saveClientDocument, clientExistsInSupabase, getDB
} = require('../utils/db');
const { extractTextFromBuffer } = require('../utils/docReader');

// ── List all clients ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const clients = await getAllClients();
    res.json({ clients });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create client ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { name, product, market } = req.body;
  if (!name) return res.status(400).json({ error: 'Client name is required' });

  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  try {
    await saveClient({ name: name.trim(), slug, product, market, created: new Date().toISOString() });
    res.json({ success: true, slug });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get client detail ─────────────────────────────────────────────────────────
router.get('/:client', async (req, res) => {
  const slug = req.params.client;
  const dir  = clientDir(slug);
  const inFs = fs.existsSync(dir);
  const inDb = await clientExistsInSupabase(slug);
  if (!inFs && !inDb) return res.status(404).json({ error: 'Client not found' });

  const { getContext, getBriefs, getManifest, getReview } = require('../utils/db');
  const meta     = await getClientMetaAsync(slug);
  const docs     = await getClientDocs(slug);
  const context  = getContext(slug);
  const briefs   = getBriefs(slug);
  const manifest = getManifest(slug);
  const review   = getReview(slug);

  res.json({
    meta,
    docs,
    hasContext:  !!context,
    hasBriefs:   !!briefs,
    hasManifest: manifest.length > 0,
    hasReview:   !!review,
    context: context ? {
      awareness_level: context.awareness_level,
      core_usp: context.core_usp,
      tone_of_voice: context.tone_of_voice,
      top_ad_angles: context.top_ad_angles
    } : null,
    review: review ? {
      top_10: review.top_10,
      total_evaluated: review.total_evaluated,
      top_score: review.full_rankings?.[0]?.total_score
    } : null
  });
});

// ── List uploaded docs ────────────────────────────────────────────────────────
router.get('/:client/docs', async (req, res) => {
  try {
    const docs = await getClientDocs(req.params.client);
    res.json({ docs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Upload docs: memory → extract → Supabase client_documents (or disk if no DB)
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = docsDir(req.params.client);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
const diskUpload = multer({ storage: diskStorage, limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/:client/upload', (req, res, next) => {
  const upload = getDB() ? memoryUpload.array('documents', 10) : diskUpload.array('documents', 10);
  upload(req, res, next);
}, async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });

  const slug = req.params.client;
  const files = [];

  try {
    if (getDB()) {
      for (const f of req.files) {
        const text = await extractTextFromBuffer(f.originalname, f.buffer);
        await saveClientDocument(slug, f.originalname, text, f.size);
        files.push({ name: f.originalname, size: f.size });
      }
    } else {
      for (const f of req.files) {
        files.push({ name: f.originalname, size: f.size });
      }
    }
    res.json({ success: true, files, count: files.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete a doc ──────────────────────────────────────────────────────────────
router.delete('/:client/docs/:filename', async (req, res) => {
  try {
    await deleteDoc(req.params.client, req.params.filename);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Delete entire client ──────────────────────────────────────────────────────
router.delete('/:client', async (req, res) => {
  const slug = req.params.client;
  const dir = clientDir(slug);

  try {
    const { getDB } = require('../utils/db');
    const db = getDB();
    if (db) {
      const { error } = await db.from('clients').delete().eq('slug', slug);
      if (error) console.warn('[Supabase] delete client:', error.message);
    }
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
