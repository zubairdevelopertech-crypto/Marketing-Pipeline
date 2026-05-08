// Maps each FORMAT-ID to its winning static reference image filenames
// Files are served from /api/format-refs/:filename (URL-encoded)
const FORMAT_REFS = {
  'FORMAT-01': ['PAS1.png', 'PAS2.png'],
  'FORMAT-02': ['BAB_1.png', 'BAB_2.png'],
  'FORMAT-03': ['Social Proof_1.png'],
  'FORMAT-04': ['Direct Offer_1.png', 'Direct Offer_2.png'],
  'FORMAT-05': ['Listicle_1.png', 'Listicle_2.png'],
  'FORMAT-06': ['Question Hook_1.png', 'Question Hook_2.png'],
  'FORMAT-07': ['Comparison_1.png', 'Comparison_2.png'],
  'FORMAT-08': ['Result First_1.png', 'Result First_2.png'],
  'FORMAT-09': ['Empathy_1.png', 'Empathy_2.png'],
  'FORMAT-10': ['Bold Statement_1.png', 'Bold Statement_2.png'],
  'FORMAT-11': ['Sticky Note_1.png', 'Sticky Note_2.png'],
  'FORMAT-12': ['iPhone Notes_!.png', 'iPhone Notes_2.png'],
  'FORMAT-13': ['iMessage Conversation1.png', 'iMessage Conversation2.png'],
  'FORMAT-14': ['ChatGPT Ad_1.jpg'],
  'FORMAT-15': ['Us vs Them_1.jpg', 'Us vs Them_2.png'],
  'FORMAT-16': ['Benefit Callout_1.png', 'Benefit Callout_2.png'],
  'FORMAT-17': ['UGC Static1.png', 'UGC Static2.png'],
  'FORMAT-18': ['Cartoon Style_1.png', 'Cartoon Style_2.png'],
  'FORMAT-19': ['Lifestyle Context_1.png', 'Lifestyle Context2.png'],
  'FORMAT-20': ['Carousel Ad1.png', 'Carousel Ad_2.png'],
  'FORMAT-21': ['Add Review1.png', 'Add Review2.png'],
  'FORMAT-22': ['Negative-Positive1.png', 'Negative-Positive2.png'],
};

export function getRefUrls(formatId) {
  const files = FORMAT_REFS[formatId] || [];
  return files.map(f => `/api/format-refs/${encodeURIComponent(f)}`);
}

export default FORMAT_REFS;
