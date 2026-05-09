// Maps each FORMAT-ID to winning static reference images
// Served from /format-refs/ (frontend/public/format-refs/) — no backend needed
const FORMAT_REFS = {
  'FORMAT-01': ['FORMAT-01_1.png', 'FORMAT-01_2.png'],
  'FORMAT-02': ['FORMAT-02_1.png', 'FORMAT-02_2.png'],
  'FORMAT-03': ['FORMAT-03_1.png'],
  'FORMAT-04': ['FORMAT-04_1.png', 'FORMAT-04_2.png'],
  'FORMAT-05': ['FORMAT-05_1.png', 'FORMAT-05_2.png'],
  'FORMAT-06': ['FORMAT-06_1.png', 'FORMAT-06_2.png'],
  'FORMAT-07': ['FORMAT-07_1.png', 'FORMAT-07_2.png'],
  'FORMAT-08': ['FORMAT-08_1.png', 'FORMAT-08_2.png'],
  'FORMAT-09': ['FORMAT-09_1.png', 'FORMAT-09_2.png'],
  'FORMAT-10': ['FORMAT-10_1.png', 'FORMAT-10_2.png'],
  'FORMAT-11': ['FORMAT-11_1.png', 'FORMAT-11_2.png'],
  'FORMAT-12': ['FORMAT-12_1.png', 'FORMAT-12_2.png'],
  'FORMAT-13': ['FORMAT-13_1.png', 'FORMAT-13_2.png'],
  'FORMAT-14': ['FORMAT-14_1.jpg'],
  'FORMAT-15': ['FORMAT-15_1.jpg', 'FORMAT-15_2.png'],
  'FORMAT-16': ['FORMAT-16_1.png', 'FORMAT-16_2.png'],
  'FORMAT-17': ['FORMAT-17_1.png', 'FORMAT-17_2.png'],
  'FORMAT-18': ['FORMAT-18_1.png', 'FORMAT-18_2.png'],
  'FORMAT-19': ['FORMAT-19_1.png', 'FORMAT-19_2.png'],
  'FORMAT-20': ['FORMAT-20_1.png', 'FORMAT-20_2.png'],
  'FORMAT-21': ['FORMAT-21_1.png', 'FORMAT-21_2.png'],
  'FORMAT-22': ['FORMAT-22_1.png', 'FORMAT-22_2.png'],
};

export function getRefUrls(formatId) {
  const files = FORMAT_REFS[formatId] || [];
  return files.map(f => `/format-refs/${f}`);
}

export default FORMAT_REFS;
