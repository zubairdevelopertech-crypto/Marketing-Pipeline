const { callClaudeJSON } = require('../utils/claude');
const { loadAllDocsForSlug, saveContext } = require('../utils/db');
const fs = require('fs');
const path = require('path');

async function runResearch(clientDir, onProgress) {
  onProgress({ step: 'research', status: 'running', message: '📚 Reading uploaded documents...' });

  const clientSlug = path.basename(clientDir);
  const outputDir = path.join(clientDir, 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const documents = await loadAllDocsForSlug(clientSlug);
  const docNames = Object.keys(documents);

  if (docNames.length === 0) {
    throw new Error('No documents found in docs folder. Please upload research documents first.');
  }

  onProgress({ step: 'research', status: 'running', message: `📄 Loaded ${docNames.length} documents: ${docNames.join(', ')}` });
  onProgress({ step: 'research', status: 'running', message: '🧠 Claude is reading your documents — this takes about 30 seconds...' });

  // Heartbeat: reassure the user every 10 seconds while Claude is thinking
  const HEARTBEAT_MESSAGES = [
    '⏳ Still working... Claude is analysing your market research documents.',
    '⏳ Processing customer voice data and avatar insights...',
    '⏳ Extracting pain points, objections, and brand guidelines...',
    '⏳ Almost done — building the final master context...',
  ];
  let heartbeatCount = 0;
  const heartbeat = setInterval(() => {
    onProgress({
      step: 'research',
      status: 'running',
      message: HEARTBEAT_MESSAGES[Math.min(heartbeatCount, HEARTBEAT_MESSAGES.length - 1)],
      heartbeat: true
    });
    heartbeatCount++;
  }, 10000);

  const docsText = Object.entries(documents)
    .map(([name, content]) => `=== ${name} ===\n${content}`)
    .join('\n\n');

  const prompt = `You are a senior marketing strategist. Read all client research documents and extract a complete structured master context.

DOCUMENTS:
${docsText.slice(0, 80000)}

Extract and return a JSON object with EXACTLY these fields (fill every field with real data from the documents):
{
  "client_name": "",
  "product_name": "",
  "product_price": "",
  "offer_structure": "",
  "website": "",
  "awareness_level": 0,
  "awareness_reasoning": "One sentence explaining the awareness level",
  "sophistication_level": 0,
  "target_audience": {
    "age_range": "",
    "gender": "",
    "location": "",
    "income": "",
    "job_title": "",
    "experience": ""
  },
  "pain_points": ["", "", ""],
  "desired_outcomes": ["", "", ""],
  "failed_alternatives": ["", "", ""],
  "top_objections": ["", "", ""],
  "avatar_language": ["exact verbatim quote 1", "exact verbatim quote 2", "exact verbatim quote 3", "exact verbatim quote 4", "exact verbatim quote 5"],
  "tone_of_voice": "",
  "core_usp": "",
  "mechanism": "",
  "proof_points": ["", "", ""],
  "guarantee": "",
  "top_ad_angles": ["angle 1 with full description", "angle 2 with full description", "angle 3 with full description"],
  "necessary_beliefs": ["belief 1", "belief 2", "belief 3", "belief 4", "belief 5"],
  "brand_primary_color": "",
  "brand_secondary_color": "",
  "brand_dos": [],
  "brand_donts": [],
  "market_language": "The exact language and slang the market uses — extracted directly from reddit/customer voice document"
}

Return ONLY valid JSON. Every field must be populated with real data from the documents.`;

  let context;
  try {
    context = await callClaudeJSON(prompt, { maxTokens: 6000 });
  } finally {
    clearInterval(heartbeat);
  }

  await saveContext(clientSlug, context);

  onProgress({
    step: 'research',
    status: 'done',
    message: `✅ Master context built — Awareness Level ${context.awareness_level} — "${context.core_usp?.slice(0, 60)}..."`,
    data: { awareness_level: context.awareness_level, core_usp: context.core_usp }
  });

  const logPath = path.join(clientDir, 'session_log.md');
  fs.appendFileSync(logPath, `\n## ${new Date().toISOString()} — Research\n- Docs: ${docNames.join(', ')}\n- Awareness: ${context.awareness_level}\n`);

  return context;
}

module.exports = { runResearch };
