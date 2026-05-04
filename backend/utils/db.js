/**
 * db.js — Unified data layer
 *
 * When SUPABASE_ANON_KEY is set, clients, documents, pipeline JSON, and creatives
 * are stored in Supabase (source of truth). Local files under backend/clients/
 * are still written for image binaries and as a local cache when the folder exists.
 *
 * Run supabase_schema.sql in the Supabase SQL editor after pulling updates.
 */
const fs   = require('fs');
const path = require('path');
const { loadAllDocs } = require('./docReader');

const CLIENTS_DIR = path.join(__dirname, '..', 'clients');

let supabase = null;
function getDB() {
  if (supabase) return supabase;
  const key = process.env.SUPABASE_ANON_KEY;
  const url = process.env.SUPABASE_URL || 'https://avbpsuboiqxhpkyqppjo.supabase.co';
  if (!key || key.trim() === '') return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(url, key);
    console.log('✅ Supabase connected');
    return supabase;
  } catch (e) {
    console.warn('⚠️  Supabase init failed:', e.message);
    return null;
  }
}

/** Must run before any row referencing clients(slug) to satisfy FK. */
async function ensureClientRow(slug, meta = {}) {
  const db = getDB();
  if (!db || !slug) return;
  const name = (meta.name && String(meta.name).trim()) || slug;
  try {
    const { error } = await db.from('clients').upsert({
      slug,
      name,
      product: meta.product ?? null,
      market: meta.market ?? null,
      created_at: meta.created || new Date().toISOString()
    }, { onConflict: 'slug' });
    if (error) console.warn('[Supabase] ensureClientRow:', error.message);
  } catch (e) {
    console.warn('[Supabase] ensureClientRow:', e.message);
  }
}

function clientDir(slug)  { return path.join(CLIENTS_DIR, slug); }
function outputDir(slug)  { return path.join(CLIENTS_DIR, slug, 'output'); }
function docsDir(slug)    { return path.join(CLIENTS_DIR, slug, 'docs'); }
function jsonPath(slug, file) { return path.join(outputDir(slug), file); }

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

async function sbUpsert(table, data, conflict) {
  const db = getDB();
  if (!db) return;
  try {
    const { error } = await db.from(table).upsert(data, { onConflict: conflict });
    if (error) console.warn(`[Supabase] ${table} upsert:`, error.message);
  } catch (e) {
    console.warn(`[Supabase] ${table} error:`, e.message);
  }
}

// ── CLIENT ────────────────────────────────────────────────────────────────────
async function saveClient(meta) {
  await ensureClientRow(meta.slug, meta);

  const dir = clientDir(meta.slug);
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'output', 'images'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'output', 'prompts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'feedback'), { recursive: true });
  writeJSON(path.join(dir, 'client_meta.json'), { ...meta, created: meta.created || new Date().toISOString() });
  fs.writeFileSync(path.join(dir, 'session_log.md'), `# Session Log — ${meta.name}\nCreated: ${new Date().toISOString()}\n`);

  await sbUpsert('clients', {
    slug: meta.slug, name: meta.name,
    product: meta.product || null, market: meta.market || null,
    created_at: meta.created || new Date().toISOString()
  }, 'slug');
}

async function clientExistsInSupabase(slug) {
  const db = getDB();
  if (!db) return false;
  const { data, error } = await db.from('clients').select('slug').eq('slug', slug).maybeSingle();
  if (error) return false;
  return !!data?.slug;
}

async function getAllClients() {
  fs.mkdirSync(CLIENTS_DIR, { recursive: true });
  const db = getDB();

  if (db) {
    const { data: rows, error } = await db.from('clients').select('slug, name, product, market, created_at').order('created_at', { ascending: false });
    if (!error && rows && rows.length) {
      const out = [];
      for (const c of rows) {
        const slug = c.slug;
        const { count: docsCount } = await db.from('client_documents').select('*', { count: 'exact', head: true }).eq('client_slug', slug);
        const { data: ctxRow } = await db.from('pipeline_data').select('id').eq('client_slug', slug).eq('type', 'master_context').maybeSingle();
        const { data: revRow } = await db.from('pipeline_data').select('id').eq('client_slug', slug).eq('type', 'review_report').maybeSingle();
        const { count: okCreative } = await db.from('creatives').select('*', { count: 'exact', head: true }).eq('client_slug', slug).eq('status', 'success');

        let status = 'new';
        if ((docsCount || 0) > 0) status = 'docs_uploaded';
        if (ctxRow) status = 'research_done';
        if ((okCreative || 0) > 0) status = 'creatives_done';
        if (revRow) status = 'review_done';

        const review = readJSON(jsonPath(slug, 'review_report.json'));
        out.push({
          slug,
          name: c.name || slug,
          product: c.product,
          market: c.market,
          status,
          docsCount: docsCount || 0,
          creativesCount: okCreative || 0,
          topScore: review?.full_rankings?.[0]?.total_score ?? null
        });
      }
      return out;
    }
  }

  return fs.readdirSync(CLIENTS_DIR)
    .filter(d => {
      try { return fs.statSync(path.join(CLIENTS_DIR, d)).isDirectory(); } catch { return false; }
    })
    .map(slug => {
      const metaPath = path.join(CLIENTS_DIR, slug, 'client_meta.json');
      const meta = readJSON(metaPath) || { name: slug, slug };
      const manifest = readJSON(jsonPath(slug, 'creative_manifest.json')) || [];
      const review   = readJSON(jsonPath(slug, 'review_report.json'));
      const docsCount = fs.existsSync(docsDir(slug))
        ? fs.readdirSync(docsDir(slug)).filter(f => !f.startsWith('.')).length : 0;

      let status = 'new';
      if (docsCount > 0) status = 'docs_uploaded';
      if (fs.existsSync(jsonPath(slug, 'master_context.json'))) status = 'research_done';
      if (manifest.some(m => m.status === 'success')) status = 'creatives_done';
      if (review) status = 'review_done';

      return {
        slug,
        name: meta.name || slug,
        product: meta.product,
        market: meta.market,
        status,
        docsCount,
        creativesCount: manifest.filter(m => m.status === 'success').length,
        topScore: review?.full_rankings?.[0]?.total_score || null
      };
    });
}

function getClientMeta(slug) {
  const p = path.join(clientDir(slug), 'client_meta.json');
  return readJSON(p) || { name: slug, slug };
}

async function getClientMetaAsync(slug) {
  const db = getDB();
  if (db) {
    const { data } = await db.from('clients').select('*').eq('slug', slug).maybeSingle();
    if (data) {
      return {
        name: data.name,
        slug: data.slug,
        product: data.product,
        market: data.market,
        created: data.created_at
      };
    }
  }
  return getClientMeta(slug);
}

// ── DOCUMENTS ─────────────────────────────────────────────────────────────────
async function getClientDocs(slug) {
  const db = getDB();
  if (db) {
    const { data, error } = await db.from('client_documents')
      .select('filename, size_bytes, updated_at')
      .eq('client_slug', slug)
      .order('filename');
    if (error) {
      console.warn('[Supabase] getClientDocs:', error.message);
      return [];
    }
    return (data || []).map(row => ({
      name: row.filename,
      size: row.size_bytes || 0,
      modified: row.updated_at ? new Date(row.updated_at) : new Date()
    }));
  }

  const dir = docsDir(slug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => !f.startsWith('.'))
    .map(name => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, size: stat.size, modified: stat.mtime };
    });
}

async function saveClientDocument(slug, filename, extractedText, sizeBytes) {
  await ensureClientRow(slug);
  const db = getDB();
  if (db) {
    const { error } = await db.from('client_documents').upsert(
      {
        client_slug: slug,
        filename,
        extracted_text: extractedText,
        size_bytes: sizeBytes,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'client_slug,filename' }
    );
    if (error) throw new Error(error.message);
    return;
  }

  const dir = docsDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  throw new Error('Supabase is not configured: set SUPABASE_ANON_KEY in backend/.env to store uploads in the database.');
}

async function deleteDoc(slug, filename) {
  const safe = path.basename(filename);
  const db = getDB();
  if (db) {
    const { error } = await db.from('client_documents').delete().eq('client_slug', slug).eq('filename', safe);
    if (error) throw new Error(error.message);
    return;
  }
  const p = path.join(docsDir(slug), safe);
  if (!p.startsWith(CLIENTS_DIR)) throw new Error('Invalid path');
  if (!fs.existsSync(p)) throw new Error('File not found');
  fs.unlinkSync(p);
}

async function loadAllDocsForSlug(slug) {
  const db = getDB();
  if (db) {
    const { data, error } = await db.from('client_documents').select('filename, extracted_text').eq('client_slug', slug);
    if (error) throw new Error(error.message);
    const docs = {};
    for (const row of data || []) docs[row.filename] = row.extracted_text;
    if (Object.keys(docs).length === 0) {
      if (fs.existsSync(docsDir(slug))) return loadAllDocs(docsDir(slug));
    }
    return docs;
  }
  return loadAllDocs(docsDir(slug));
}

// ── SUPABASE STORAGE — images ──────────────────────────────────────────────────
// Bucket name: 'creatives' (must be created as PUBLIC in Supabase → Storage dashboard)
const STORAGE_BUCKET = 'creatives';

async function uploadImageToStorage(slug, label, imageBytes) {
  const db = getDB();
  if (!db) return null;
  try {
    const filename = `${slug}/${label}.jpg`;
    const { error } = await db.storage.from(STORAGE_BUCKET).upload(filename, imageBytes, {
      contentType: 'image/jpeg',
      upsert: true
    });
    if (error) { console.warn('[Storage] upload failed:', error.message); return null; }
    const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filename);
    return data?.publicUrl || null;
  } catch (e) {
    console.warn('[Storage] error:', e.message);
    return null;
  }
}

async function getImageFromStorage(slug, label) {
  const db = getDB();
  if (!db) return null;
  try {
    const { data, error } = await db.storage.from(STORAGE_BUCKET).download(`${slug}/${label}.jpg`);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch { return null; }
}

// ── MASTER CONTEXT ────────────────────────────────────────────────────────────
async function saveContext(slug, context) {
  await ensureClientRow(slug);
  writeJSON(jsonPath(slug, 'master_context.json'), context);
  await sbUpsert('pipeline_data', {
    client_slug: slug, type: 'master_context',
    data: context, updated_at: new Date().toISOString()
  }, 'client_slug,type');
}

function getContext(slug) {
  return readJSON(jsonPath(slug, 'master_context.json'));
}

async function getContextAsync(slug) {
  const local = readJSON(jsonPath(slug, 'master_context.json'));
  if (local) return local;
  const db = getDB();
  if (!db) return null;
  const { data } = await db.from('pipeline_data').select('data').eq('client_slug', slug).eq('type', 'master_context').maybeSingle();
  if (data?.data) { writeJSON(jsonPath(slug, 'master_context.json'), data.data); return data.data; }
  return null;
}

// ── CONTENT BRIEFS ────────────────────────────────────────────────────────────
async function saveBriefs(slug, briefs) {
  await ensureClientRow(slug);
  writeJSON(jsonPath(slug, 'content_briefs.json'), briefs);
  await sbUpsert('pipeline_data', {
    client_slug: slug, type: 'content_briefs',
    data: briefs, updated_at: new Date().toISOString()
  }, 'client_slug,type');
}

function getBriefs(slug) {
  return readJSON(jsonPath(slug, 'content_briefs.json'));
}

async function getBriefsAsync(slug) {
  const local = readJSON(jsonPath(slug, 'content_briefs.json'));
  if (local) return local;
  const db = getDB();
  if (!db) return null;
  const { data } = await db.from('pipeline_data').select('data').eq('client_slug', slug).eq('type', 'content_briefs').maybeSingle();
  if (data?.data) { writeJSON(jsonPath(slug, 'content_briefs.json'), data.data); return data.data; }
  return null;
}

// ── CREATIVE MANIFEST ─────────────────────────────────────────────────────────
async function saveManifest(slug, manifest) {
  await ensureClientRow(slug);
  writeJSON(jsonPath(slug, 'creative_manifest.json'), manifest);

  const db = getDB();
  if (!db) return;
  const rows = manifest.map(m => ({
    client_slug: slug,
    label:       m.label,
    format_id:   m.format_id,
    version:     m.version,
    status:      m.status,
    image_url:   m.image_url || null,
    score:       m.score || null,
    ctr_tier:    m.ctr_tier || null,
    headline:    m.brief?.headline || m.headline || null,
    hook_line:   m.brief?.hook_line || null,
    body_copy:   m.brief?.body_copy || m.body_copy || null,
    cta_text:    m.brief?.cta_text || m.cta_text || null,
    error:       m.error || null,
    brief_json:  m.brief || null,
    updated_at:  new Date().toISOString()
  }));
  try {
    const { error } = await db.from('creatives').upsert(rows, { onConflict: 'client_slug,label' });
    if (error) console.warn('[Supabase] creatives upsert:', error.message);
  } catch (e) {
    console.warn('[Supabase] creatives error:', e.message);
  }
}

function getManifest(slug) {
  return readJSON(jsonPath(slug, 'creative_manifest.json')) || [];
}

async function getManifestForApi(slug) {
  const filePath = jsonPath(slug, 'creative_manifest.json');
  if (fs.existsSync(filePath)) return readJSON(filePath) || [];

  const db = getDB();
  if (!db) return [];
  const { data, error } = await db.from('creatives').select('*').eq('client_slug', slug).order('label');
  if (error || !data?.length) return [];

  return data.map(row => ({
    label: row.label,
    format_id: row.format_id,
    version: row.version,
    brief: row.brief_json || {
      format_id: row.format_id,
      format_name: row.format_id,
      version: row.version,
      headline: row.headline,
      hook_line: row.hook_line,
      body_copy: row.body_copy,
      cta_text: row.cta_text
    },
    status: row.status,
    image_url: row.status === 'success' ? `/api/creatives/${slug}/images/${row.label}.jpg` : (row.image_url || null),
    score: row.score,
    ctr_tier: row.ctr_tier,
    error: row.error,
    headline: row.headline,
    subheadline: row.brief_json?.subheadline,
    body_copy: row.body_copy,
    cta_text: row.cta_text
  }));
}

// ── CREATIVE MANIFEST — DB-first read ────────────────────────────────────────
async function getManifestAsync(slug) {
  const local = readJSON(jsonPath(slug, 'creative_manifest.json'));
  if (local?.length) return local;
  return getManifestForApi(slug);
}

// ── REVIEW REPORT ─────────────────────────────────────────────────────────────
async function saveReview(slug, report) {
  await ensureClientRow(slug);
  writeJSON(jsonPath(slug, 'review_report.json'), report);
  await sbUpsert('pipeline_data', {
    client_slug: slug, type: 'review_report',
    data: report, updated_at: new Date().toISOString()
  }, 'client_slug,type');

  const db = getDB();
  if (!db) return;
  for (const s of (report.full_rankings || [])) {
    try {
      await db.from('creatives').update({
        score:    s.total_score,
        ctr_tier: s.predicted_ctr_tier,
        updated_at: new Date().toISOString()
      }).eq('client_slug', slug).eq('label', s.label);
    } catch (_) {}
  }
}

async function getReviewForApi(slug) {
  const p = jsonPath(slug, 'review_report.json');
  if (fs.existsSync(p)) return readJSON(p);

  const db = getDB();
  if (!db) return null;
  const { data: row } = await db.from('pipeline_data').select('data').eq('client_slug', slug).eq('type', 'review_report').maybeSingle();
  return row?.data || null;
}

function getReview(slug) {
  return readJSON(jsonPath(slug, 'review_report.json'));
}

function getPipelineStatus(slug) {
  return {
    research: !!getContext(slug),
    strategy: !!getBriefs(slug),
    creative: fs.existsSync(jsonPath(slug, 'creative_manifest.json')),
    review:   !!getReview(slug),
    briefsCount:    (getBriefs(slug) || []).length,
    creativesCount: getManifest(slug).filter(m => m.status === 'success').length
  };
}

function savePrompt(slug, label, promptData) {
  const p = path.join(outputDir(slug), 'prompts', `${label}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  writeJSON(p, promptData);
  return p;
}

function getPrompt(slug, label) {
  return readJSON(path.join(outputDir(slug), 'prompts', `${label}.json`));
}

function normalizeCreativeImageUrl(slug, m) {
  if (!m || m.status !== 'success') return m?.image_url || null;
  if (m.image_url && m.image_url.startsWith('/api/creatives/')) return m.image_url;
  return `/api/creatives/${slug}/images/${m.label}.jpg`;
}

module.exports = {
  CLIENTS_DIR,
  clientDir, outputDir, docsDir,
  getDB,
  ensureClientRow,
  clientExistsInSupabase,
  saveClient, getAllClients, getClientMeta, getClientMetaAsync,
  getClientDocs, deleteDoc,
  saveClientDocument,
  loadAllDocsForSlug,
  saveContext, getContext, getContextAsync,
  saveBriefs,  getBriefs, getBriefsAsync,
  saveManifest, getManifest, getManifestForApi, getManifestAsync,
  saveReview,  getReview, getReviewForApi,
  getPipelineStatus,
  savePrompt, getPrompt,
  normalizeCreativeImageUrl,
  uploadImageToStorage, getImageFromStorage,
};
