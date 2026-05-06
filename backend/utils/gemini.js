const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Model options (from Gemini docs):
// gemini-3.1-flash-image-preview  = Nano Banana 2 (fast, high-volume) — up to 10 object reference images
// gemini-3-pro-image-preview       = Nano Banana Pro (best quality, thinking) — up to 6 object reference images
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Generate an image using Gemini's image generation API.
 *
 * API format (per official docs):
 *   parts: [{ text }, { inline_data: image1 }, { inline_data: image2 }, ...]
 *   TEXT MUST COME FIRST, then images.
 *   Up to 14 reference images supported (10 objects + 4 characters for Flash model).
 *
 * @param {string} prompt - The text prompt (goes first in parts)
 * @param {string|string[]} referenceImagePaths - One or more reference image file paths
 * @param {object} options - { retries, onRetry }
 */
async function generateImage(prompt, referenceImagePaths = [], { retries = 3, onRetry } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const url = `${GEMINI_BASE_URL}/${GEMINI_IMAGE_MODEL}:generateContent`;

  // Normalise to array
  const refPaths = Array.isArray(referenceImagePaths)
    ? referenceImagePaths
    : (referenceImagePaths ? [referenceImagePaths] : []);

  // ── Build parts: TEXT FIRST (per API spec), then reference images ──
  const parts = [{ text: prompt }];

  for (const refPath of refPaths) {
    if (refPath && fs.existsSync(refPath)) {
      const ext = path.extname(refPath).slice(1).toLowerCase();
      const mimeType = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';
      const imageData = fs.readFileSync(refPath).toString('base64');
      parts.push({ inline_data: { mime_type: mimeType, data: imageData } });
    }
  }

  const body = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      // 4:5 = portrait Meta ad format (1080x1350)
      imageConfig: { aspectRatio: '4:5' }
    }
  });

  // Delay strategy by error type:
  // 429 (quota/rate-limit): 60s → 90s → 120s → 150s → 180s  — Gemini needs a full minute
  // 503/500 (server error): 8s  → 16s → 32s  — transient, short wait
  // network:                6s  → 12s → 24s
  const delayFor = (status, attempt) => {
    if (status === 429) return (60 + (attempt - 1) * 30) * 1000;  // 60s, 90s, 120s…
    return Math.pow(2, attempt) * 4000;                            // 8s, 16s, 32s…
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body,
        timeout: 240000
      });

      if (!response.ok) {
        const errText = await response.text();
        const status  = response.status;

        // 404 = wrong model name — permanent, don't retry
        if (status === 404) {
          throw new Error(`Gemini model not found (404). Check GEMINI_IMAGE_MODEL. Current: ${GEMINI_IMAGE_MODEL}`);
        }

        if ((status === 429 || status === 503 || status === 500) && attempt < retries) {
          const delay = delayFor(status, attempt);
          if (onRetry) onRetry(attempt, retries, status, Math.round(delay / 1000));
          console.log(`[Gemini] ${status} on attempt ${attempt} — waiting ${Math.round(delay/1000)}s before retry`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw new Error(`Gemini API ${status}: ${errText.slice(0, 300)}`);
      }

      const data = await response.json();

      for (const candidate of data.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.inlineData?.data) {
            return Buffer.from(part.inlineData.data, 'base64');
          }
        }
      }

      throw new Error('No image returned from Gemini — model may not have generated an image for this prompt');

    } catch (e) {
      const msg = e.message || String(e);

      if (msg.includes('model not found') || msg.includes('No image returned')) throw e;

      const networkLike =
        e.type === 'request-timeout' || e.code === 'ECONNRESET' ||
        e.code === 'ETIMEDOUT'       || e.code === 'ENOTFOUND'  ||
        /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|network/i.test(msg);

      if (attempt < retries && networkLike) {
        const delay = Math.pow(2, attempt) * 3000;
        if (onRetry) onRetry(attempt, retries, 'network-timeout', Math.round(delay / 1000));
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      throw e;
    }
  }
}

module.exports = { generateImage };
