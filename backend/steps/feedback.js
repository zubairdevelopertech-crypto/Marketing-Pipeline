/**
 * feedback.js — Feedback loop engine
 *
 * Two operating modes (auto-detected from the CSV):
 *
 * FORMAT MODE  — ad names match FORMAT-01-VERSION-A labels.
 *                Full creative context available. Makes targeted improvements.
 *
 * FREE MODE    — ad names are custom (e.g. "Remote werken", "Angst").
 *                Analyzes performance patterns, maps winning concepts to the
 *                FORMAT library, and generates new static image ads.
 */

const { callClaudeJSON } = require('../utils/claude');
const { generateImage }  = require('../utils/gemini');
const { getContextAsync, getBriefsAsync, getManifestAsync, uploadImageToStorage, getMetaName } = require('../utils/db');
const fs   = require('fs');
const path = require('path');

// ── Dutch ↔ English column mapping ───────────────────────────────────────────
const COL_MAP = {
  'Advertentienaam':                            'ad_name',
  'Naam advertentie':                           'ad_name',
  'Weergaven':                                  'impressions',
  'Bereik':                                     'reach',
  'Frequentie':                                 'frequency',
  'Besteed bedrag (EUR)':                       'spend',
  'Besteed bedrag':                             'spend',
  'Resultaten':                                 'conversions',
  'Resultatenindicator':                        'result_type',
  'Kosten per resultaten':                      'cost_per_result',
  'CTR (doorklikratio voor klikken op link)':   'ctr',
  'CPC (kosten per klik op link) (EUR)':        'cpc',
  'Klikken op links':                           'link_clicks',
  'Klikken (alle)':                             'all_clicks',
  'CTR (alle)':                                 'ctr_all',
  'CPM (kosten per 1000 weergaven) (EUR)':      'cpm',
  'Kwaliteitsscore':                            'quality_score',
  'Rangschikking betrokkenheidspercentage':     'engagement_ranking',
  'Score conversieratio':                       'conversion_score',
  'Naam advertentieset':                        'ad_set_name',
  'Weergaven van landingspagina':               'landing_page_views',
  // English pass-through
  'ad_name': 'ad_name', 'impressions': 'impressions', 'clicks': 'clicks',
  'ctr': 'ctr', 'cpc': 'cpc', 'spend': 'spend', 'conversions': 'conversions',
  'cpa': 'cpa', 'reach': 'reach', 'thumb_stop_rate': 'thumb_stop_rate',
};

// ── Robust CSV parser ─────────────────────────────────────────────────────────
function parseLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

function parseMetaCSV(raw) {
  // Remove BOM and normalise line endings
  const text = raw.replace(/^﻿/, '').trim();
  const lines = text.split(/\r?\n/);

  // Split into sections at blank lines — Meta sometimes exports two tables
  const sections = [];
  let block = [];
  for (const ln of lines) {
    if (!ln.trim()) {
      if (block.length > 1) sections.push(block);
      block = [];
    } else {
      block.push(ln);
    }
  }
  if (block.length > 1) sections.push(block);
  if (!sections.length) sections.push(lines.filter(l => l.trim()));

  // Parse every section, pick the one with the most columns (most detail)
  let best = [];
  for (const sec of sections) {
    const hdrs = parseLine(sec[0]);
    const rows = sec.slice(1).map(ln => {
      const vals = parseLine(ln);
      const row = {};
      hdrs.forEach((h, i) => {
        const key = COL_MAP[h] || h;
        const val = (vals[i] || '').replace(/^"|"$/g, '');
        row[key] = val;
      });
      return row;
    }).filter(r => {
      const nm = r.ad_name || '';
      return nm && nm !== 'Advertentienaam' && nm !== 'ad_name' && nm !== 'Naam advertentie';
    });

    const colCount = Object.keys(rows[0] || {}).length;
    if (rows.length > 0 && colCount > Object.keys(best[0] || {}).length) best = rows;
  }
  return best;
}

function num(v) {
  if (!v || v === '-' || v === '') return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
}

// FORMAT mode = any ad_name matches FORMAT-XX-VERSION-X OR {brand}-{FormatName}-{Version}
const META_NAME_RE = /^[\w-]+-(?:PAS|BAB|Proof|Offer|List|Hook|Compare|Result|Empathy|Bold|StickyNote|Notes|iMessage|ChatGPT|UsVsThem|Benefits|UGC|Cartoon|Lifestyle|Carousel|Review|NegPos)-[AB]$/i;
function isFormatMode(rows) {
  return rows.some(r =>
    /^FORMAT-\d+-VERSION-[AB]/i.test(r.ad_name || '') ||
    META_NAME_RE.test(r.ad_name || '')
  );
}

// ── Main feedback runner ──────────────────────────────────────────────────────
async function runFeedback(clientDir, csvPath, iterationNum, onProgress) {
  const clientSlug = path.basename(clientDir);
  const outputDir  = path.join(clientDir, 'output');
  const imagesDir  = path.join(outputDir, 'images', `iteration_${iterationNum}`);
  fs.mkdirSync(imagesDir, { recursive: true });

  onProgress({ step: 'feedback', status: 'running', message: 'Reading Meta performance CSV…' });

  // ── Load CSV ────────────────────────────────────────────────────────────────
  const rawCSV  = fs.readFileSync(csvPath, 'utf-8');
  const metaRows = parseMetaCSV(rawCSV);

  if (!metaRows.length) throw new Error('Could not parse the CSV. Check that the file is a valid Meta Ads export.');

  onProgress({ step: 'feedback', status: 'running', message: `Parsed ${metaRows.length} ad rows from Meta CSV.` });

  // ── Load pipeline data from DB (or filesystem) ──────────────────────────────
  const context  = await getContextAsync(clientSlug);
  const briefs   = (await getBriefsAsync(clientSlug)) || [];
  const manifest = (await getManifestAsync(clientSlug)) || [];

  if (!context) throw new Error('No master context found. Run the main pipeline first so Claude knows the product and audience.');

  const briefsLookup   = {};
  const manifestLookup = {};
  briefs.forEach(b => { briefsLookup[`${b.format_id}-VERSION-${b.version}`] = b; });
  manifest.forEach(m => {
    manifestLookup[m.label] = m;
    // Also index by meta_name so "ray-ban-PAS-A" matches FORMAT-01-VERSION-A
    const mname = m.meta_name || getMetaName(clientSlug, m.format_id, m.version);
    if (mname) manifestLookup[mname] = m;
  });

  // ── Detect mode ─────────────────────────────────────────────────────────────
  const formatMode = isFormatMode(metaRows);
  onProgress({
    step: 'feedback', status: 'running',
    message: formatMode
      ? 'FORMAT mode detected — ad names match FORMAT labels. Cross-referencing original creative context…'
      : 'Free-form mode detected — custom ad names found. Claude will map winning concepts to our FORMAT library…'
  });

  // ── Enrich rows with any available creative context ──────────────────────────
  const enrichedRows = metaRows.map(row => {
    const name = row.ad_name || '';
    const cr   = manifestLookup[name] || {};
    const br   = briefsLookup[name]   || {};
    return {
      ad_name:            name,
      impressions:        num(row.impressions),
      reach:              num(row.reach),
      spend_eur:          num(row.spend),
      conversions:        num(row.conversions),
      result_type:        row.result_type || '',
      cost_per_result:    num(row.cost_per_result),
      ctr_pct:            num(row.ctr),
      cpc_eur:            num(row.cpc),
      link_clicks:        num(row.link_clicks),
      cpm_eur:            num(row.cpm),
      quality_score:      row.quality_score || '',
      engagement_ranking: row.engagement_ranking || '',
      conversion_score:   row.conversion_score  || '',
      ad_set_name:        row.ad_set_name || '',
      // Creative context (only available in FORMAT mode)
      original_headline:  cr.prompt?.headline   || br.headline   || '',
      original_hook:      br.hook_line           || '',
      original_body:      cr.prompt?.body_copy   || br.body_copy  || '',
      original_cta:       cr.prompt?.cta_text    || br.cta_text   || '',
      original_visual:    cr.prompt?.visual_direction || '',
      winning_argument:   br.winning_argument    || '',
      format_name:        br.format_name         || '',
    };
  });

  // Sort by spend desc so Claude sees the most-run ads first
  enrichedRows.sort((a, b) => b.spend_eur - a.spend_eur);

  // ── Compress ad data into a compact table (saves ~70% tokens vs JSON.stringify) ─
  // Only include rows with actual spend or conversions — zero-zero rows add noise
  const meaningfulRows = enrichedRows.filter(r => r.spend_eur > 0.5 || r.conversions > 0);

  const q = (v, unit = '') => (v > 0 ? `${unit}${v}` : '-');
  const compactTable = meaningfulRows.map(r =>
    [
      `"${r.ad_name}"`,
      `spend:${q(r.spend_eur, '€')}`,
      `conv:${r.conversions}(${r.result_type.replace('actions:', '') || '?'})`,
      r.cost_per_result > 0 ? `CPL:€${r.cost_per_result}` : null,
      r.ctr_pct > 0         ? `CTR:${r.ctr_pct}%`         : null,
      r.quality_score       ? `qual:${r.quality_score}`   : null,
      r.conversion_score    ? `cvr:${r.conversion_score}` : null,
      r.ad_set_name         ? `[${r.ad_set_name}]`        : null,
      // FORMAT mode only: original copy context
      r.original_headline   ? `hl:"${r.original_headline.slice(0, 40)}"` : null,
    ].filter(Boolean).join(' | ')
  ).join('\n');

  const clientCtx = [
    `Client: ${context.client_name}`,
    `Product: ${context.product_name}`,
    `USP: ${context.core_usp || ''}`,
    `Pain points: ${(context.pain_points || []).slice(0, 4).join('; ')}`,
    `Market language: ${(context.market_language || '').slice(0, 200)}`,
    `Audience: ${JSON.stringify(context.target_audience || {}).slice(0, 150)}`,
  ].join('\n');

  const formatList = `FORMAT-01 PAS, FORMAT-02 BAB, FORMAT-03 Social Proof, FORMAT-04 Direct Offer,
FORMAT-05 Listicle, FORMAT-06 Question Hook, FORMAT-07 Comparison Table, FORMAT-08 Result First,
FORMAT-09 Empathy, FORMAT-10 Bold Statement, FORMAT-17 UGC Static, FORMAT-18 Cartoon,
FORMAT-19 Lifestyle, FORMAT-21 Review, FORMAT-22 Negative/Positive`;

  // ── CALL 1: Performance analysis (no iteration priorities — keeps it short) ──
  const analysisPrompt = `You are a senior Meta Ads analyst. Return ONLY valid JSON, no markdown.

${clientCtx}
MODE: ${formatMode ? 'FORMAT-labelled ads' : 'Free-form (custom ad names)'}
${formatMode ? 'Cross-reference original copy context included per row.' : 'Map winning angles to static image FORMAT library after analysis.'}

AD PERFORMANCE (compact — Beneden gemiddeld=below avg, Gemiddeld=avg, Boven gemiddeld=above avg):
${compactTable}

Rules: ignore spend<€1 + 0 conv (no signal). CPL is primary metric for leadgen. CTR for awareness.

Return JSON:
{
  "performance_summary": "3-4 sentences on what worked and what didn't, with specific numbers",
  "mode": "${formatMode ? 'format' : 'free'}",
  "winning_creatives": [{ "ad_name":"", "spend_eur":0, "conversions":0, "cpl_eur":0, "ctr_pct":0, "why_winning":"psychological reason with data", "winning_angle":"core concept 1 sentence", "scale_recommendation":"specific next action" }],
  "losing_creatives": [{ "ad_name":"", "spend_eur":0, "why_losing":"specific diagnosis", "fix":"concrete change" }],
  "key_insights": ["insight with data reference", "audience insight", "format/structure insight", "budget/distribution insight"],
  "best_performing_angle": "1 sentence — the #1 proven concept",
  "next_7_days_recommendation": "Specific budget and creative actions"
}`;

  onProgress({ step: 'feedback', status: 'running', message: 'Claude is analyzing performance data…' });

  const analysis = await callClaudeJSON(analysisPrompt, { maxTokens: 4000 });
  analysis.mode = formatMode ? 'format' : 'free';

  // ── CALL 2: Iteration priorities (separate call — laser focused) ─────────────
  onProgress({ step: 'feedback', status: 'running', message: 'Generating iteration plan…' });

  const winnersContext = (analysis.winning_creatives || [])
    .map(w => `• "${w.ad_name}" — ${w.winning_angle} (€${w.cpl_eur} CPL)`)
    .join('\n');
  const insightsContext = (analysis.key_insights || []).join('\n• ');

  const prioritiesPrompt = `You are a Meta Ads creative strategist. Return ONLY valid JSON, no markdown.

Client: ${context.client_name} | Product: ${context.product_name}
Language for ad copy: ${(context.target_audience?.location || '').toLowerCase().includes('nether') ? 'Dutch (Nederlands)' : 'English'}

WINNING ANGLES FROM DATA:
${winnersContext || analysis.best_performing_angle || 'No clear winners yet'}

KEY INSIGHTS:
• ${insightsContext}

AVAILABLE FORMATS: ${formatList}

Generate 4-5 iteration_priorities — new static image ads that translate the proven video/concept angles into FORMAT-based static ads.
Each must have a unique FORMAT-XX-VERSION-X label (use A or B version, mix formats).
Write Dutch copy if the product/audience is Dutch.

Return JSON:
{
  "iteration_priorities": [
    {
      "label": "FORMAT-01-VERSION-A",
      "source_ad": "which winning ad this is based on",
      "winning_angle": "the concept being translated into static",
      "format_id": "FORMAT-01",
      "format_name": "PAS",
      "version": "A",
      "brief": {
        "hook_line": "max 8 words Dutch",
        "headline": "max 6 words bold Dutch",
        "subheadline": "max 10 words Dutch",
        "body_copy": "max 20 words Dutch",
        "cta_text": "max 4 words Dutch",
        "winning_argument": "why this will convert based on the data"
      },
      "what_was_wrong": "gap this creative fills",
      "specific_change": "what makes this different"
    }
  ]
}`;

  const prioritiesResult = await callClaudeJSON(prioritiesPrompt, { maxTokens: 3000 });
  const priorities = prioritiesResult.iteration_priorities || [];

  // Merge priorities into analysis object
  analysis.iteration_priorities = priorities;

  onProgress({
    step: 'feedback', status: 'running',
    message: `Analysis complete — generating ${priorities.length} new creatives…`
  });

  // Send analysis summary so frontend can show it while images generate
  onProgress({
    type: 'analysis_ready',
    step: 'feedback',
    status: 'running',
    message: `Analysis complete — generating ${priorities.length} new creatives…`,
    analysis_data: {
      performance_summary:        analysis.performance_summary,
      key_insights:               analysis.key_insights,
      winning_creatives:          analysis.winning_creatives,
      losing_creatives:           analysis.losing_creatives,
      best_performing_angle:      analysis.best_performing_angle,
      next_7_days_recommendation: analysis.next_7_days_recommendation,
      mode:                       analysis.mode,
    }
  });

  // ── Generate improved / new creatives ────────────────────────────────────────
  const iterations = [];

  for (const plan of priorities) {
    // Enforce iteration suffix so labels never overwrite main pipeline images
    const baseLabel = (plan.label || 'FORMAT-01-VERSION-A').replace(/-V\d+$/, '');
    const newLabel  = `${baseLabel}-V${iterationNum}`;
    onProgress({ step: 'feedback', status: 'running', message: `[${iterations.length + 1}/${priorities.length}] Building ${newLabel}…` });

    try {
      const isNL = (context.target_audience?.location || '').toLowerCase().includes('nether') ||
                   (context.target_audience?.location || '').toLowerCase().includes('nederland');
      const lang = isNL ? 'Dutch (Nederlands)' : 'English';

      const iterPrompt = `You are a world-class Meta ad creative director. Generate a production-ready image prompt.

CLIENT: ${context.client_name}
PRODUCT: ${context.product_name}
TONE: ${context.tone_of_voice}
BRAND COLOR: ${context.brand_primary_color || '#2563EB'}
ALL TEXT ON THE IMAGE MUST BE IN: ${lang}

CREATIVE BRIEF:
Format: ${plan.format_id} — ${plan.format_name} — Version ${plan.version || 'A'}
Winning angle: ${plan.winning_angle}
Hook: ${plan.brief?.hook_line || ''}
Headline: ${plan.brief?.headline || ''}
Subheadline: ${plan.brief?.subheadline || ''}
Body copy: ${plan.brief?.body_copy || ''}
CTA: ${plan.brief?.cta_text || ''}
Why it will work: ${plan.brief?.winning_argument || ''}

SOURCE INSIGHT: ${plan.what_was_wrong || ''} → ${plan.specific_change || ''}

IMPORTANT: The nano_banana_prompt is sent DIRECTLY to Gemini which renders it as a pixel image.
Any label like "(TOP-RIGHT)", "(MIDDLE)", "80px", "ZONE 1" will be LITERALLY PAINTED as text. Write only cinematic scene descriptions.

Return ONLY valid JSON:
{
  "label": "${newLabel}",
  "format_id": "${plan.format_id || 'FORMAT-01'}",
  "version": "${plan.version || 'A'}",
  "headline": "Exact headline text",
  "subheadline": "Exact subheadline text",
  "body_copy": "Exact body copy",
  "cta_text": "Exact CTA",
  "hook_line": "${plan.brief?.hook_line || ''}",
  "winning_argument": "${plan.brief?.winning_argument || ''}",
  "change_made": "What changed vs the original and the psychological reason",
  "nano_banana_prompt": "Write a 300-400 word image generation prompt for Gemini. Pure cinematic visual description — no position labels, no pixel values, no zone numbers. Include: the scene composition matching the ${plan.format_name} format, the mood and lighting, the person or product in the frame, the text that must appear word-for-word in ${lang} (headline, subheadline, CTA button), brand color ${context.brand_primary_color || '#2563EB'}. Portrait 4:5 ratio. Mobile-first. High contrast. Looks like a real Meta static ad."
}`;

      const iterData = await callClaudeJSON(iterPrompt, { maxTokens: 2500 });

      onProgress({ step: 'feedback', status: 'running', message: `   Generating image for ${newLabel}…` });

      const imageBytes = await generateImage(iterData.nano_banana_prompt, [], {
        retries: 5,
        onRetry: (att, total, code, delaySec) => {
          onProgress({
            step: 'feedback', status: 'running',
            message: `   ⏳ ${newLabel} — Gemini busy (${code}), retry ${att}/${total} in ${delaySec}s…`
          });
        }
      });
      const imagePath  = path.join(imagesDir, `${newLabel}.jpg`);
      fs.writeFileSync(imagePath, imageBytes);

      const storageUrl = await uploadImageToStorage(clientSlug, `iteration_${iterationNum}/${newLabel}`, imageBytes).catch(() => null);
      // FIXED: use /api/feedback/ route, not /api/creatives/
      iterData.image_url     = storageUrl || `/api/feedback/${clientSlug}/images/iteration_${iterationNum}/${newLabel}.jpg`;
      iterData.image_path    = imagePath;
      iterData.status        = 'success';
      iterData.source_ad     = plan.source_ad || '';
      iterData.winning_angle = plan.winning_angle || '';
      iterations.push(iterData);

      // Fire per-image event so frontend shows the image immediately
      onProgress({
        type:        'image_ready',
        step:        'feedback',
        status:      'running',
        message:     `✅ ${newLabel} — image ready`,
        label:       newLabel,
        image_url:   iterData.image_url,
        headline:    iterData.headline,
        subheadline: iterData.subheadline,
        body_copy:   iterData.body_copy,
        cta_text:    iterData.cta_text,
        change_made: iterData.change_made,
        source_ad:   plan.source_ad || '',
        winning_angle: plan.winning_angle || '',
      });
    } catch (e) {
      const errEntry = { label: newLabel, status: 'error', error: e.message, source_ad: plan.source_ad || '', winning_angle: plan.winning_angle || '' };
      iterations.push(errEntry);
      onProgress({
        type:      'image_failed',
        step:      'feedback',
        status:    'running',
        message:   `   ❌ ${newLabel} failed: ${e.message.slice(0, 80)}`,
        label:     newLabel,
        source_ad: plan.source_ad || '',
        error:     e.message
      });
    }

    // Minimum 12s between Gemini calls to stay within 15 RPM quota
    await new Promise(r => setTimeout(r, 12000));
  }

  // ── Persist results ──────────────────────────────────────────────────────────
  analysis.iterations    = iterations;
  analysis.iteration_num = iterationNum;
  analysis.generated_at  = new Date().toISOString();
  analysis.csv_row_count = enrichedRows.length;

  const analysisPath = path.join(outputDir, `feedback_analysis_v${iterationNum}.json`);
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

  // Weekly report markdown
  const md = [
    `# Performance Report — ${context.client_name} — Iteration ${iterationNum}`,
    `Generated: ${new Date().toISOString()}`,
    `\n## Summary\n${analysis.performance_summary}`,
    `\n## Key Insights`,
    ...(analysis.key_insights || []).map(i => `- ${i}`),
    `\n## Top Performers`,
    ...(analysis.winning_creatives || []).map(w =>
      `- **${w.ad_name}** — ${w.conversions} leads @ €${w.cpl_eur} CPL — ${w.why_winning}\n  → ${w.scale_recommendation}`),
    `\n## Generated Iterations (${iterations.length})`,
    ...iterations.map(it => `- **${it.label}**: ${it.change_made || it.error || ''}`),
    `\n## Next 7 Days\n${analysis.next_7_days_recommendation}`
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, `weekly_report_v${iterationNum}.md`), md);

  try {
    fs.appendFileSync(
      path.join(clientDir, 'session_log.md'),
      `\n## ${new Date().toISOString()} — Feedback Iteration ${iterationNum}\n- Rows: ${enrichedRows.length}, Mode: ${formatMode ? 'FORMAT' : 'FREE'}, Iterations: ${iterations.length}\n`
    );
  } catch (_) {}

  onProgress({ step: 'feedback', status: 'done', message: `✅ Feedback complete — ${iterations.length} new creatives generated` });

  return { analysis, iterations };
}

module.exports = { runFeedback };
