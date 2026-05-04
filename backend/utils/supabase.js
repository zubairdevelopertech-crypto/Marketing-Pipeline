const { createClient } = require('@supabase/supabase-js');
const { ensureClientRow } = require('./db');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://avbpsuboiqxhpkyqppjo.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

let _client = null;

function getSupabase() {
  if (!SUPABASE_ANON_KEY) return null; // not configured yet
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _client;
}

// ─── Sync a client's creative manifest to Supabase ───────────────────────────
// Prefer saveManifest() from db.js (writes disk + DB). Kept for legacy callers.
async function syncManifest(clientSlug, manifest) {
  const supabase = getSupabase();
  if (!supabase) return;

  await ensureClientRow(clientSlug);

  try {
    const rows = manifest.map(m => ({
      client_slug:  clientSlug,
      label:        m.label,
      format_id:    m.format_id,
      version:      m.version,
      status:       m.status,
      image_url:    m.image_url || null,
      score:        m.score || null,
      ctr_tier:     m.ctr_tier || null,
      headline:     m.brief?.headline || m.headline || null,
      hook_line:    m.brief?.hook_line || null,
      body_copy:    m.brief?.body_copy || m.body_copy || null,
      cta_text:     m.brief?.cta_text || m.cta_text || null,
      error:        m.error || null,
      brief_json:   m.brief || null,
      updated_at:   new Date().toISOString()
    }));

    const { error } = await supabase
      .from('creatives')
      .upsert(rows, { onConflict: 'client_slug,label' });

    if (error) console.warn('[Supabase] sync error:', error.message);
  } catch (e) {
    console.warn('[Supabase] sync failed:', e.message);
  }
}

// ─── Sync client metadata ─────────────────────────────────────────────────────
async function syncClient(meta) {
  const supabase = getSupabase();
  if (!supabase) return;

  await ensureClientRow(meta.slug, meta);

  try {
    const { error } = await supabase
      .from('clients')
      .upsert({
        slug:       meta.slug,
        name:       meta.name,
        product:    meta.product || null,
        market:     meta.market || null,
        created_at: meta.created || new Date().toISOString()
      }, { onConflict: 'slug' });

    if (error) console.warn('[Supabase] client sync error:', error.message);
  } catch (e) {
    console.warn('[Supabase] client sync failed:', e.message);
  }
}

// ─── Sync master context JSON ─────────────────────────────────────────────────
async function syncContext(clientSlug, context) {
  const supabase = getSupabase();
  if (!supabase) return;

  await ensureClientRow(clientSlug);

  try {
    const { error } = await supabase
      .from('pipeline_data')
      .upsert({
        client_slug:     clientSlug,
        type:            'master_context',
        data:            context,
        updated_at:      new Date().toISOString()
      }, { onConflict: 'client_slug,type' });

    if (error) console.warn('[Supabase] context sync error:', error.message);
  } catch (e) {
    console.warn('[Supabase] context sync failed:', e.message);
  }
}

// ─── Sync content briefs ──────────────────────────────────────────────────────
async function syncBriefs(clientSlug, briefs) {
  const supabase = getSupabase();
  if (!supabase) return;

  await ensureClientRow(clientSlug);

  try {
    const { error } = await supabase
      .from('pipeline_data')
      .upsert({
        client_slug: clientSlug,
        type:        'content_briefs',
        data:        briefs,
        updated_at:  new Date().toISOString()
      }, { onConflict: 'client_slug,type' });

    if (error) console.warn('[Supabase] briefs sync error:', error.message);
  } catch (e) {
    console.warn('[Supabase] briefs sync failed:', e.message);
  }
}

// ─── Sync review report ───────────────────────────────────────────────────────
async function syncReview(clientSlug, report) {
  const supabase = getSupabase();
  if (!supabase) return;

  await ensureClientRow(clientSlug);

  try {
    const { error } = await supabase
      .from('pipeline_data')
      .upsert({
        client_slug: clientSlug,
        type:        'review_report',
        data:        report,
        updated_at:  new Date().toISOString()
      }, { onConflict: 'client_slug,type' });

    if (error) console.warn('[Supabase] review sync error:', error.message);
  } catch (e) {
    console.warn('[Supabase] review sync failed:', e.message);
  }
}

module.exports = { getSupabase, syncManifest, syncClient, syncContext, syncBriefs, syncReview };
