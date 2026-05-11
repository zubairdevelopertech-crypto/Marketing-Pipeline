const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');

const CUSTOM_FORMATS_FILE = path.join(__dirname, '..', 'formats', 'custom_formats.json');
const CUSTOM_REFS_DIR     = path.join(__dirname, '..', 'formats', 'custom_refs');

function loadCustomFormats() {
  if (!fs.existsSync(CUSTOM_FORMATS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(CUSTOM_FORMATS_FILE, 'utf8')); }
  catch { return []; }
}

function saveCustomFormats(formats) {
  fs.mkdirSync(path.dirname(CUSTOM_FORMATS_FILE), { recursive: true });
  fs.writeFileSync(CUSTOM_FORMATS_FILE, JSON.stringify(formats, null, 2));
}

function nextFormatId(formats) {
  const nums = formats
    .map(f => parseInt(f.id.replace('FORMAT-', '')))
    .filter(n => !isNaN(n) && n > 22);
  const max = nums.length ? Math.max(...nums) : 22;
  return `FORMAT-${String(max + 1).padStart(2, '0')}`;
}

// Multer — ref images stored under backend/formats/custom_refs/:id/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(CUSTOM_REFS_DIR, req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(jpe?g|png|webp)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only image files are accepted'));
  }
});

// GET /api/formats — list all custom formats
router.get('/', (req, res) => {
  res.json(loadCustomFormats());
});

// POST /api/formats — create a new custom format
router.post('/', (req, res) => {
  const { name, structure, awareness_fit, hook } = req.body;
  if (!name?.trim() || !structure?.trim()) {
    return res.status(400).json({ error: 'name and structure are required' });
  }
  const formats = loadCustomFormats();
  const id = nextFormatId(formats);
  const fmt = {
    id,
    name: String(name).trim(),
    structure: String(structure).trim(),
    awareness_fit: Array.isArray(awareness_fit)
      ? awareness_fit.map(Number).filter(n => n >= 1 && n <= 5)
      : [],
    hook: hook ? String(hook).trim() : '',
    custom: true,
    created_at: new Date().toISOString()
  };
  formats.push(fmt);
  saveCustomFormats(formats);
  res.json(fmt);
});

// PUT /api/formats/:id — update a custom format
router.put('/:id', (req, res) => {
  const formats = loadCustomFormats();
  const idx = formats.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Format not found' });

  const { name, structure, awareness_fit, hook } = req.body;
  const fmt = formats[idx];
  if (name?.trim())      fmt.name = name.trim();
  if (structure?.trim()) fmt.structure = structure.trim();
  if (awareness_fit)     fmt.awareness_fit = Array.isArray(awareness_fit)
    ? awareness_fit.map(Number).filter(n => n >= 1 && n <= 5)
    : fmt.awareness_fit;
  if (hook !== undefined) fmt.hook = String(hook).trim();
  fmt.updated_at = new Date().toISOString();

  formats[idx] = fmt;
  saveCustomFormats(formats);
  res.json(fmt);
});

// DELETE /api/formats/:id — delete custom format + its reference images
router.delete('/:id', (req, res) => {
  const formats = loadCustomFormats();
  const filtered = formats.filter(f => f.id !== req.params.id);
  if (filtered.length === formats.length) return res.status(404).json({ error: 'Format not found' });

  const refsDir = path.join(CUSTOM_REFS_DIR, req.params.id);
  if (fs.existsSync(refsDir)) {
    try { fs.rmSync(refsDir, { recursive: true, force: true }); } catch (_) {}
  }

  saveCustomFormats(filtered);
  res.json({ success: true });
});

// POST /api/formats/:id/refs — upload reference images for a custom format
router.post('/:id/refs', upload.array('refs', 4), (req, res) => {
  const formats = loadCustomFormats();
  if (!formats.find(f => f.id === req.params.id)) {
    return res.status(404).json({ error: 'Format not found' });
  }
  const files = req.files || [];
  res.json({ success: true, count: files.length, files: files.map(f => f.filename) });
});

// DELETE /api/formats/:id/refs/:filename — remove one reference image
router.delete('/:id/refs/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);
  const filePath = path.join(CUSTOM_REFS_DIR, req.params.id, safe);
  if (!filePath.startsWith(CUSTOM_REFS_DIR)) return res.status(400).end();
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
  res.json({ success: true });
});

// GET /api/formats/:id/refs — list reference images
router.get('/:id/refs', (req, res) => {
  const refsDir = path.join(CUSTOM_REFS_DIR, req.params.id);
  if (!fs.existsSync(refsDir)) return res.json([]);
  const files = fs.readdirSync(refsDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
  res.json(files.map(f => ({
    filename: f,
    url: `/api/formats/${req.params.id}/refs/${encodeURIComponent(f)}`
  })));
});

// GET /api/formats/:id/refs/:filename — serve image file
router.get('/:id/refs/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);
  if (!/^[\w._-]+\.(jpe?g|png|webp)$/i.test(safe)) return res.status(400).end();
  const filePath = path.join(CUSTOM_REFS_DIR, req.params.id, safe);
  if (!filePath.startsWith(CUSTOM_REFS_DIR)) return res.status(400).end();
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

module.exports = router;
