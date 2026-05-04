const { callClaudeJSON } = require('../utils/claude');
const { saveBriefs } = require('../utils/db');
const path = require('path');

async function runStrategy(clientDir, context, formats, onProgress) {
  onProgress({ step: 'strategy', status: 'running', message: `📋 Generating content strategy for ${formats.length * 2} briefs (${formats.length} formats × 2 angles)...` });

  const briefs = [];
  const total = formats.length * 2;
  let count = 0;

  const avatarQuotes = (context.avatar_language || []).map(q => `"${q}"`).join('\n');
  const painPoints = (context.pain_points || []).join('\n- ');
  const failed = (context.failed_alternatives || []).join('\n- ');
  const objections = (context.top_objections || []).join('\n- ');

  for (const fmt of formats) {
    for (const version of ['A', 'B']) {
      count++;
      onProgress({
        step: 'strategy',
        status: 'running',
        message: `📝 Brief ${count}/${total}: ${fmt.id} — ${fmt.name} — Version ${version}`,
        progress: { current: count, total, bar: 'strategy' }
      });

      const versionGuide = version === 'A'
        ? 'Version A: Lead with PRIMARY OFFER angle — focus on core promise and unique mechanism.'
        : 'Version B: Lead with ALTERNATIVE ANGLE — emotional outcome, identity shift, or contrarian framing.';

      const prompt = `You are a world-class direct response copywriter trained in Breakthrough Advertising by Eugene Schwartz.

CLIENT: ${context.client_name}
PRODUCT: ${context.product_name} — ${context.product_price}
CORE USP: ${context.core_usp}
MECHANISM: ${context.mechanism}
GUARANTEE: ${context.guarantee || 'None'}
AWARENESS LEVEL: ${context.awareness_level} — ${context.awareness_reasoning}
TONE OF VOICE: ${context.tone_of_voice}
MARKET LANGUAGE: ${context.market_language || ''}

AVATAR PAIN POINTS:
- ${painPoints}

FAILED ALTERNATIVES (what they tried that didn't work):
- ${failed}

TOP OBJECTIONS:
- ${objections}

THEIR EXACT WORDS (use this language, not yours):
${avatarQuotes}

AD FORMAT:
ID: ${fmt.id} — ${fmt.name}
Structure: ${fmt.structure}
Hook type: ${fmt.hook_type}
Awareness fit: Level ${fmt.awareness_fit.join('-')}
Copy notes: ${fmt.copy_notes}
Visual style: ${fmt.visual_style}

ANGLE: ${versionGuide}

Generate a complete content strategy brief. Return ONLY valid JSON:
{
  "format_id": "${fmt.id}",
  "format_name": "${fmt.name}",
  "version": "${version}",
  "winning_argument": "The single most persuasive argument this ad makes in one sentence",
  "target_pain_or_desire": "The specific pain point or desire this targets",
  "hook_line": "Opening line — max 8 words — must stop the scroll. Use avatar language.",
  "headline": "Max 6 words — bold, attention-stopping, specific",
  "subheadline": "Max 12 words — supports headline, adds mechanism or proof",
  "body_copy": "Max 25 words — core argument in avatar's exact language",
  "cta_text": "Max 5 words — clear low-friction next step",
  "emotional_outcome": "How the avatar feels after seeing this ad — one sentence",
  "belief_addressed": "Which necessary belief this ad builds",
  "objection_handled": "Which specific objection this ad neutralises"
}`;

      try {
        const brief = await callClaudeJSON(prompt, { maxTokens: 1500 });
        briefs.push(brief);
      } catch (e) {
        briefs.push({
          format_id: fmt.id, format_name: fmt.name, version,
          error: e.message, hook_line: '', headline: '', body_copy: '', cta_text: ''
        });
      }

      // Small delay to avoid rate limits
      await new Promise(r => setTimeout(r, 800));
    }
  }

  const clientSlug = path.basename(clientDir);
  await saveBriefs(clientSlug, briefs);

  const successful = briefs.filter(b => !b.error).length;
  onProgress({
    step: 'strategy',
    status: 'done',
    message: `✅ ${successful}/${total} content briefs generated`,
    progress: { current: total, total, bar: 'strategy' }
  });

  return briefs;
}

module.exports = { runStrategy };
