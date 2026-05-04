const { callClaudeJSON, callClaude } = require('../utils/claude');
const { generateImage } = require('../utils/gemini');
const fs = require('fs');
const path = require('path');

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i] || '');
    return row;
  });
}

async function runFeedback(clientDir, csvPath, iterationNum, onProgress) {
  onProgress({ step: 'feedback', status: 'running', message: '📊 Reading Meta performance data...' });

  const outputDir = path.join(clientDir, 'output');

  // Load previous pipeline data (this is how it "remembers")
  const contextPath = path.join(outputDir, 'master_context.json');
  const briefsPath = path.join(outputDir, 'content_briefs.json');
  const manifestPath = path.join(outputDir, 'creative_manifest.json');

  if (!fs.existsSync(contextPath)) throw new Error('No master context found. Run the main pipeline first.');
  if (!fs.existsSync(manifestPath)) throw new Error('No creative manifest found. Run the main pipeline first.');

  const context = JSON.parse(fs.readFileSync(contextPath));
  const briefs = fs.existsSync(briefsPath) ? JSON.parse(fs.readFileSync(briefsPath)) : [];
  const manifest = JSON.parse(fs.readFileSync(manifestPath));

  // Build lookup of all previous creatives with their full prompts and copy
  const manifestLookup = {};
  manifest.forEach(m => {
    manifestLookup[m.label] = m;
  });
  const briefsLookup = {};
  briefs.forEach(b => {
    briefsLookup[`${b.format_id}-VERSION-${b.version}`] = b;
  });

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const metaData = parseCSV(csvText);

  onProgress({ step: 'feedback', status: 'running', message: `📈 Loaded ${metaData.length} ad performance records. Claude is analyzing...` });

  // Build full context of what was previously created for each ad
  const adContexts = metaData.map(row => {
    const label = row.ad_name || '';
    const creative = manifestLookup[label] || {};
    const brief = briefsLookup[label] || {};
    return {
      ...row,
      previous_headline: creative.prompt?.headline || brief.headline || '',
      previous_hook: brief.hook_line || '',
      previous_body: creative.prompt?.body_copy || brief.body_copy || '',
      previous_cta: creative.prompt?.cta_text || brief.cta_text || '',
      previous_visual: creative.prompt?.visual_direction || '',
      winning_argument: brief.winning_argument || '',
      format_name: brief.format_name || ''
    };
  });

  const analysisPrompt = `You are a senior Meta Ads performance analyst and creative strategist.

CLIENT: ${context.client_name}
PRODUCT: ${context.product_name}
CORE USP: ${context.core_usp}
AWARENESS LEVEL: ${context.awareness_level}
AVATAR PAIN POINTS: ${(context.pain_points || []).join(', ')}
MARKET LANGUAGE: ${context.market_language || ''}

META PERFORMANCE DATA WITH PREVIOUS CREATIVE CONTEXT:
${JSON.stringify(adContexts, null, 2)}

This is iteration ${iterationNum}. Analyze performance and identify patterns.

Return a JSON analysis:
{
  "performance_summary": "3-4 sentence overview of what the data shows, what worked, what didn't",
  "winning_creatives": [
    {
      "label": "FORMAT-01-VERSION-A",
      "ctr": "1.8%",
      "why_winning": "Psychological reason with reference to the specific copy/hook used",
      "winning_elements": ["specific element 1", "specific element 2"],
      "best_audience": "cold/warm/retargeting",
      "scale_recommendation": "Specific next action"
    }
  ],
  "losing_creatives": [
    {
      "label": "FORMAT-02-VERSION-B",
      "ctr": "0.4%",
      "why_losing": "Specific reason referencing the hook/copy/visual that underperformed",
      "fix": "Concrete change with reference to what was wrong"
    }
  ],
  "best_performing_offer_angle": "Description with evidence from data",
  "best_performing_pain_point": "Which pain resonated most and why",
  "best_performing_format": "Which format structure won and why",
  "best_performing_version": "A or B overall and why",
  "fatigue_signals": ["Labels showing frequency decline"],
  "iteration_priorities": [
    {
      "label": "FORMAT-03-VERSION-B",
      "change_type": "rewrite_hook/adjust_offer/strengthen_cta/change_visual/change_angle",
      "what_was_wrong": "Specific diagnosis referencing original copy",
      "specific_change": "Exact change to make with new copy suggestion",
      "confidence": "high/medium/low"
    }
  ],
  "weekly_report_summary": "4-5 sentences for client-facing report",
  "next_7_days_recommendation": "Specific budget and creative actions for next week"
}`;

  const analysis = await callClaudeJSON(analysisPrompt, { maxTokens: 4000 });

  onProgress({ step: 'feedback', status: 'running', message: `🔄 Generating ${analysis.iteration_priorities?.length || 0} improved creatives...` });

  const iterations = [];
  const iterImagesDir = path.join(outputDir, 'images', `iteration_${iterationNum}`);
  fs.mkdirSync(iterImagesDir, { recursive: true });

  for (const plan of (analysis.iteration_priorities || [])) {
    const label = plan.label;
    const newLabel = `${label}-V${iterationNum}`;
    const original = manifestLookup[label] || {};
    const originalBrief = briefsLookup[label] || {};

    onProgress({ step: 'feedback', status: 'running', message: `🔧 Iterating ${label} → ${newLabel}` });

    try {
      const iterPrompt = `You are a world-class direct response copywriter. A Meta ad underperformed and needs improvement.

CLIENT: ${context.client_name}
PRODUCT: ${context.product_name}
CORE USP: ${context.core_usp}
TONE: ${context.tone_of_voice}
MARKET LANGUAGE: ${context.market_language || ''}

ORIGINAL CREATIVE (${label}):
Format: ${originalBrief.format_name || ''}
Hook: ${originalBrief.hook_line || ''}
Headline: ${original.prompt?.headline || originalBrief.headline || ''}
Body: ${original.prompt?.body_copy || originalBrief.body_copy || ''}
CTA: ${original.prompt?.cta_text || originalBrief.cta_text || ''}

PERFORMANCE DIAGNOSIS:
What was wrong: ${plan.what_was_wrong}
Change needed: ${plan.change_type}
Specific improvement: ${plan.specific_change}

Generate improved creative. Return ONLY valid JSON:
{
  "label": "${newLabel}",
  "change_made": "Describe exactly what changed and the psychological reason",
  "headline": "Improved — max 6 words",
  "subheadline": "Improved — max 12 words",
  "body_copy": "Improved — max 25 words in market language",
  "cta_text": "Improved — max 5 words",
  "hook_line": "Improved — max 8 words",
  "visual_direction": "Updated scene description — be specific",
  "nano_banana_prompt": "Complete 200-300 word English prompt for Nano Banana Pro. Include: FORMAT. SCENE. COMPOSITION. COLORS with hex. TYPOGRAPHY hierarchy. VISIBLE TEXT word for word in correct language: Headline, Subheadline, Body, CTA. STYLE. QUALITY: mobile-first, text max 20%, high contrast. DO NOT INCLUDE list."
}`;

      const iterData = await callClaudeJSON(iterPrompt, { maxTokens: 2000 });

      // Generate new image
      onProgress({ step: 'feedback', status: 'running', message: `   🍌 Generating image for ${newLabel}...` });
      const imageBytes = await generateImage(iterData.nano_banana_prompt);
      const imagePath = path.join(iterImagesDir, `${newLabel}.jpg`);
      fs.writeFileSync(imagePath, imageBytes);

      iterData.image_path = imagePath;
      iterData.image_url = `/outputs/${path.basename(clientDir)}/output/images/iteration_${iterationNum}/${newLabel}.jpg`;
      iterData.status = 'success';
      iterations.push(iterData);

      onProgress({ step: 'feedback', status: 'running', message: `   ✅ ${newLabel} generated` });
    } catch (e) {
      onProgress({ step: 'feedback', status: 'running', message: `   ❌ ${label} iteration failed: ${e.message.slice(0, 80)}` });
      iterations.push({ label: newLabel, status: 'error', error: e.message });
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  analysis.iterations = iterations;
  analysis.iteration_num = iterationNum;
  analysis.generated_at = new Date().toISOString();

  const analysisPath = path.join(outputDir, `feedback_analysis_v${iterationNum}.json`);
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));

  // Weekly report
  const reportLines = [
    `# Weekly Performance Report — ${context.client_name} — Iteration ${iterationNum}`,
    `Generated: ${new Date().toISOString()}`,
    `\n## Summary\n${analysis.performance_summary}`,
    `\n## Best Offer Angle: ${analysis.best_performing_offer_angle}`,
    `\n## Best Pain Point: ${analysis.best_performing_pain_point}`,
    `\n## Best Format: ${analysis.best_performing_format}`,
    `\n## Top Performing Creatives\n`
  ];
  (analysis.winning_creatives || []).forEach(w => {
    reportLines.push(`- **${w.label}** (CTR: ${w.ctr}): ${w.why_winning}`);
    reportLines.push(`  → ${w.scale_recommendation}`);
  });
  reportLines.push(`\n## Iterations Generated (${iterations.length})\n`);
  iterations.forEach(it => reportLines.push(`- ${it.label}: ${it.change_made || it.error || ''}`));
  reportLines.push(`\n## Next 7 Days\n${analysis.next_7_days_recommendation}`);

  const reportPath = path.join(outputDir, `weekly_report_v${iterationNum}.md`);
  fs.writeFileSync(reportPath, reportLines.join('\n'));

  fs.appendFileSync(
    path.join(clientDir, 'session_log.md'),
    `\n## ${new Date().toISOString()} — Feedback Iteration ${iterationNum}\n- ${iterations.length} iterations generated\n`
  );

  onProgress({
    step: 'feedback',
    status: 'done',
    message: `✅ Feedback loop complete — ${iterations.length} new creatives generated`
  });

  return { analysis, iterations };
}

module.exports = { runFeedback };
