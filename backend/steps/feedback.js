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

  // ── Analysis prompt (adapts to mode) ────────────────────────────────────────
  const modeContext = formatMode
    ? `These ad names correspond directly to ads generated by the Creative Pipeline (FORMAT-XX-VERSION-X labels).
       The creative context (headline, hook, body, visual direction) is included per ad.
       Your job: diagnose why each performed as it did and specify targeted improvements.`
    : `These are existing campaign ads with custom Dutch names — they are NOT labelled with FORMAT-XX codes.
       They may be video ads, meme ads, or earlier creative work.
       Your job: identify which CREATIVE ANGLES and HOOKS proved most effective, then create iteration_priorities that map
       each winning angle to the best FORMAT from the Creative Pipeline FORMAT library.
       Assign new FORMAT-XX-VERSION-X labels to each iteration priority.`;

  const analysisPrompt = `You are a senior Meta Ads performance analyst and direct-response creative strategist.

CLIENT: ${context.client_name}
PRODUCT: ${context.product_name}
CORE USP: ${context.core_usp}
TARGET AUDIENCE: ${JSON.stringify(context.target_audience || {})}
PAIN POINTS: ${(context.pain_points || []).join(', ')}
MARKET LANGUAGE / VERBATIM QUOTES: ${context.market_language || ''}
AWARENESS LEVEL: ${context.awareness_level}

MODE: ${formatMode ? 'FORMAT (ads are labelled FORMAT-XX-VERSION-X)' : 'FREE-FORM (custom ad names)'}

${modeContext}

AVAILABLE FORMAT IDs (Creative Pipeline FORMAT library):
FORMAT-01 PAS (Problem-Agitate-Solution), FORMAT-02 BAB (Before-After-Bridge),
FORMAT-03 Social Proof, FORMAT-04 Direct Offer, FORMAT-05 Listicle (phone mockup),
FORMAT-06 Question Hook, FORMAT-07 Comparison Table, FORMAT-08 Result First,
FORMAT-09 Empathy, FORMAT-10 Bold Statement, FORMAT-11 Sticky Note,
FORMAT-12 iPhone Notes, FORMAT-13 iMessage, FORMAT-14 ChatGPT Ad,
FORMAT-15 Us vs Them, FORMAT-16 Benefit Callout, FORMAT-17 UGC Static,
FORMAT-18 Cartoon Style, FORMAT-19 Lifestyle Context, FORMAT-20 Carousel Panels,
FORMAT-21 Review (testimonial), FORMAT-22 Negative/Positive split

META PERFORMANCE DATA (${enrichedRows.length} ads, sorted by spend):
${JSON.stringify(enrichedRows, null, 2)}

ANALYSIS RULES:
- Ads with spend < €5 and 0 conversions are statistically inconclusive — note but don't over-penalise
- Focus on CPL (cost_per_result) and conversions for lead-gen campaigns
- CTR matters for awareness-stage creatives even if CPL is not tracked
- "not_delivering" status means the ad is paused but the historic data is still valid
- Engagement rankings ("Beneden gemiddeld" = Below average, "Gemiddeld" = Average, "Boven gemiddeld" = Above average)

Return ONLY valid JSON (no markdown, no prose outside JSON):
{
  "performance_summary": "3-4 sentences: what the data shows overall, what worked, what failed, what the audience responded to",
  "mode": "${formatMode ? 'format' : 'free'}",
  "winning_creatives": [
    {
      "ad_name": "exact ad name from data",
      "spend_eur": 0,
      "conversions": 0,
      "cpl_eur": 0,
      "ctr_pct": 0,
      "why_winning": "Specific psychological reason: what angle/hook/promise resonated",
      "winning_angle": "The core creative concept in one sentence",
      "scale_recommendation": "Specific action: increase budget to X/day, duplicate adset, etc."
    }
  ],
  "losing_creatives": [
    {
      "ad_name": "exact ad name",
      "spend_eur": 0,
      "why_losing": "Specific reason: wrong hook, wrong audience stage, weak offer, etc.",
      "fix": "What to change — be specific"
    }
  ],
  "key_insights": [
    "Insight about what creative angle worked and why (reference real data)",
    "Insight about the audience — what pain point they responded to",
    "Insight about format or structure that worked"
  ],
  "best_performing_angle": "The #1 creative concept that proved itself with data",
  "best_performing_pain_point": "Which pain resonated most",
  "iteration_priorities": [
    {
      "label": "FORMAT-01-VERSION-A",
      "source_ad": "exact source ad name that inspired this (or 'new' if no direct source)",
      "winning_angle": "The creative concept being translated/improved",
      "format_id": "FORMAT-01",
      "format_name": "PAS",
      "why_this_format": "Why this FORMAT best expresses this concept for static image",
      "version": "A",
      "brief": {
        "hook_line": "Opening hook — max 8 words",
        "headline": "Main headline — max 6 words, bold",
        "subheadline": "Supporting — max 10 words",
        "body_copy": "Max 20 words in Dutch market language matching the winning angle",
        "cta_text": "CTA — max 4 words",
        "winning_argument": "The #1 reason this creative will work based on the data"
      },
      "change_type": "new_static_version | improve_hook | improve_offer | improve_cta",
      "what_was_wrong": "What underperformed or what gap exists",
      "specific_change": "Exactly what this new creative does differently"
    }
  ],
  "weekly_report_summary": "4-5 sentence client-facing summary: what ran, what won, what we're doing next",
  "next_7_days_recommendation": "Specific budget and creative actions for next 7 days"
}`;

  onProgress({ step: 'feedback', status: 'running', message: 'Claude is analyzing performance data…' });

  const analysis = await callClaudeJSON(analysisPrompt, { maxTokens: 5000 });

  const priorities = analysis.iteration_priorities || [];
  onProgress({
    step: 'feedback', status: 'running',
    message: `Analysis complete — generating ${priorities.length} new creatives…`
  });

  // ── Generate improved / new creatives ────────────────────────────────────────
  const iterations = [];

  for (const plan of priorities) {
    const newLabel = plan.label || `FORMAT-00-VERSION-A-V${iterationNum}`;
    onProgress({ step: 'feedback', status: 'running', message: `Building creative for ${newLabel}…` });

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

      const imageBytes = await generateImage(iterData.nano_banana_prompt, [], { retries: 2 });
      const imagePath  = path.join(imagesDir, `${newLabel}.jpg`);
      fs.writeFileSync(imagePath, imageBytes);

      const storageUrl = await uploadImageToStorage(clientSlug, `iteration_${iterationNum}/${newLabel}`, imageBytes).catch(() => null);
      iterData.image_url   = storageUrl || `/api/creatives/${clientSlug}/images/iteration_${iterationNum}/${newLabel}.jpg`;
      iterData.image_path  = imagePath;
      iterData.status      = 'success';
      iterData.source_ad   = plan.source_ad || '';
      iterData.winning_angle = plan.winning_angle || '';
      iterations.push(iterData);

      onProgress({ step: 'feedback', status: 'running', message: `   ✅ ${newLabel} — image saved` });
    } catch (e) {
      onProgress({ step: 'feedback', status: 'running', message: `   ❌ ${newLabel} failed: ${e.message.slice(0, 80)}` });
      iterations.push({ label: newLabel, status: 'error', error: e.message, source_ad: plan.source_ad || '' });
    }

    await new Promise(r => setTimeout(r, 2500));
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
