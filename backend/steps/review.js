const { callClaudeJSON } = require('../utils/claude');
const { saveReview } = require('../utils/db');
const fs = require('fs');
const path = require('path');

async function runReview(clientDir, creativeResults, context, onProgress) {
  const outputDir = path.join(clientDir, 'output');
  const successful = creativeResults.filter(r => r.status === 'success' || r.status === 'prompt_only');
  const total = successful.length;

  onProgress({ step: 'review', status: 'running', message: `⭐ Scoring ${total} creatives on 7 criteria...` });

  const scores = [];
  let count = 0;

  for (const result of successful) {
    count++;
    onProgress({
      step: 'review',
      status: 'running',
      message: `🔍 [${count}/${total}] Scoring ${result.label}...`,
      progress: { current: count, total, bar: 'review' }
    });

    try {
      const score = await scoreCreative(result, context);
      scores.push(score);
    } catch (e) {
      scores.push({ label: result.label, total_score: 0, error: e.message });
    }

    await new Promise(r => setTimeout(r, 600));
  }

  // Sort by score
  scores.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

  const report = {
    client: context.client_name,
    generated_at: new Date().toISOString(),
    total_evaluated: scores.length,
    top_10: scores.slice(0, 10).map(s => s.label),
    flagged_weak: scores.filter(s => (s.total_score || 0) < 60).map(s => s.label),
    full_rankings: scores
  };

  const summaryLines = [
    `# Pre-Launch Review — ${context.client_name}`,
    `Generated: ${new Date().toISOString()}`,
    `\n## Top 10 Recommended for Meta Upload\n`
  ];
  scores.slice(0, 10).forEach((s, i) => {
    summaryLines.push(`${i + 1}. **${s.label}** — Score: ${s.total_score}/100 — ${s.predicted_ctr_tier?.toUpperCase()} CTR — ${s.recommended_audience}`);
  });
  summaryLines.push(`\n## Flagged (score < 60)\n`);
  report.flagged_weak.forEach(l => summaryLines.push(`- ${l}`));

  fs.writeFileSync(path.join(outputDir, 'review_summary.md'), summaryLines.join('\n'));

  await saveReview(path.basename(clientDir), report);

  const top = scores[0];
  onProgress({
    step: 'review',
    status: 'done',
    message: `✅ Review complete — Top creative: ${top?.label} (${top?.total_score}/100)`,
    progress: { current: total, total, bar: 'review' }
  });

  return report;
}

async function scoreCreative(result, context) {
  const brief = result.brief || {};
  const promptData = result.prompt || {};

  const prompt = `You are a senior Meta Ads performance expert and direct response copywriter.

CLIENT: ${context.client_name}
AWARENESS LEVEL: ${context.awareness_level}
CORE USP: ${context.core_usp}
TONE: ${context.tone_of_voice}

CREATIVE: ${result.label}
Format: ${brief.format_name || ''} — Version ${result.version}
Headline: ${promptData.headline || brief.headline || ''}
Subheadline: ${promptData.subheadline || brief.subheadline || ''}
Body: ${promptData.body_copy || brief.body_copy || ''}
CTA: ${promptData.cta_text || brief.cta_text || ''}
Hook: ${brief.hook_line || ''}
Visual: ${promptData.visual_direction || ''}
Winning argument: ${brief.winning_argument || ''}

Score 1-10 on each criterion. Return ONLY valid JSON:
{
  "label": "${result.label}",
  "scores": {
    "hook_strength": 0,
    "argument_clarity": 0,
    "emotional_resonance": 0,
    "belief_alignment": 0,
    "cta_strength": 0,
    "brand_alignment": 0,
    "meta_compliance": 0
  },
  "total_score": 0,
  "hook_note": "Why this hook works or doesn't — one sentence",
  "strengths": ["strength 1", "strength 2"],
  "weakness": "The single biggest weakness",
  "improvement": "One specific actionable improvement",
  "predicted_ctr_tier": "high/medium/low",
  "recommended_audience": "cold/warm/retargeting"
}

total_score = (sum of all 7 scores / 7) * 10. Return ONLY valid JSON.`;

  const data = await callClaudeJSON(prompt, { maxTokens: 800 });

  // Recalculate total
  const s = data.scores || {};
  const vals = Object.values(s).filter(v => typeof v === 'number');
  if (vals.length > 0) {
    data.total_score = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10);
  }

  return data;
}

module.exports = { runReview };
