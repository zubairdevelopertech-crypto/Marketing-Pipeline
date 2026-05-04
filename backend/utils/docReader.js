const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text;
    } catch (e) {
      return `[PDF extraction failed: ${e.message}]`;
    }
  }

  // Fallback: try as text
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return `[Could not read file: ${path.basename(filePath)}]`;
  }
}

/** Extract text from an in-memory file (Supabase / no local docs folder). */
async function extractTextFromBuffer(filename, buffer) {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.txt' || ext === '.md') {
    return buffer.toString('utf-8');
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      return data.text;
    } catch (e) {
      return `[PDF extraction failed: ${e.message}]`;
    }
  }

  try {
    return buffer.toString('utf-8');
  } catch {
    return `[Could not read file: ${path.basename(filename)}]`;
  }
}

async function loadAllDocs(docsDir) {
  const supported = ['.docx', '.pdf', '.txt', '.md'];
  const files = fs.readdirSync(docsDir)
    .filter(f => supported.includes(path.extname(f).toLowerCase()) && !f.startsWith('.'));

  const docs = {};
  for (const file of files) {
    const text = await extractText(path.join(docsDir, file));
    docs[file] = text;
  }
  return docs;
}

module.exports = { extractText, extractTextFromBuffer, loadAllDocs };
