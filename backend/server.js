require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS: comma-separated origins, e.g. FRONTEND_ORIGIN=https://myapp.railway.app,http://localhost:3000
const corsOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
app.use(cors({
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  credentials: false
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images statically
app.use('/outputs', express.static(path.join(__dirname, 'clients')));

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const client = req.params.client || 'default';
    const dir = path.join(__dirname, 'clients', client, 'docs');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// CSV upload for feedback
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const client = req.params.client;
    const dir = path.join(__dirname, 'clients', client, 'feedback');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `meta_data_${Date.now()}.csv`)
});
const csvUpload = multer({ storage: csvStorage });

// Routes
app.use('/api/clients', require('./routes/clients'));
app.use('/api/pipeline', require('./routes/pipeline'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/creatives', require('./routes/creatives'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    claude: !!process.env.CLAUDE_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    version: '1.0.0'
  });
});

// Production: serve React build from same origin (Railway / Render single service)
const buildDir = path.join(__dirname, '..', 'frontend', 'build');
if (process.env.NODE_ENV === 'production' && fs.existsSync(path.join(buildDir, 'index.html'))) {
  app.use(express.static(buildDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/outputs')) return next();
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🚀 Creative Pipeline Backend running on port ${PORT}`);
  console.log(`   Claude API: ${process.env.CLAUDE_API_KEY ? '✅ Connected' : '❌ Missing'}`);
  console.log(`   Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Connected' : '❌ Missing'}\n`);
});

module.exports = app;
