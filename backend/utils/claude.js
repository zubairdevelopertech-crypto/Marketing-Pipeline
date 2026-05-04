const fetch = require('node-fetch');

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function callClaude(prompt, options = {}) {
  const {
    maxTokens = 4000,
    model = 'claude-opus-4-5',
    system = null,
    maxRetries = 5
  } = options;

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  };
  if (system) body.system = system;

  let lastErr;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(CLAUDE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      timeout: 180000
    });

    if (response.ok) {
      const data = await response.json();
      let text = data.content[0].text.trim();

      if (text.startsWith('```')) {
        const lines = text.split('\n');
        lines.shift();
        if (lines[lines.length - 1].trim() === '```') lines.pop();
        text = lines.join('\n').trim();
        if (text.startsWith('json')) text = text.slice(4).trim();
      }

      return text;
    }

    const err = await response.text();
    const status = response.status;
    lastErr = new Error(`Claude API ${status}: ${err.slice(0, 200)}`);

    const retryable = status === 529 || status === 503 || status === 502 || status === 429 || status === 500;
    if (retryable && attempt < maxRetries) {
      const delay = Math.min(120000, Math.pow(2, attempt) * 2000);
      console.warn(`[Claude] ${status} — retry ${attempt}/${maxRetries} in ${delay}ms`);
      await sleep(delay);
      continue;
    }

    throw lastErr;
  }

  throw lastErr;
}

async function callClaudeJSON(prompt, options = {}) {
  const text = await callClaude(prompt, options);
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`Failed to parse Claude JSON response: ${text.slice(0, 200)}`);
  }
}

module.exports = { callClaude, callClaudeJSON };
