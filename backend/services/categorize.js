/**
 * categorize.js  —  Strict keyword-based visit category classifier
 *
 * STRICT MODE: Categories are only assigned when the transcript contains
 * SPECIFIC, UNAMBIGUOUS agricultural terms — not common English words.
 *
 * The problem with the old version:
 *   - 'yellow rice' matched 'Crop Health' via 'yellow'
 *   - 'water' alone matched 'Irrigation' (it's in everyday speech)
 *   - 'health' alone matched 'Crop Health'
 *   - 'disease' in a business/metaphorical context triggered 'Disease' category
 *
 * Fix: Every category (except Urgent) now requires the transcript to also
 * contain at least one FLORICULTURE ANCHOR word — a term that grounds the
 * conversation in an agricultural / farm context. Without an anchor, the
 * transcript is classified as 'General', no matter what keyword it contains.
 *
 * 'disease' also now requires 2 hits to prevent metaphorical uses from firing.
 *
 * Supported categories (must match the PostgreSQL visit_category enum):
 *   'Irrigation' | 'Pesticide' | 'Crop Health' | 'Fertilizer' |
 *   'Disease'    | 'Urgent'    | 'General'     | 'Farmer Note'
 */

// ── Floriculture anchor words ─────────────────────────────────────────────────
// At least ONE of these must appear in the transcript for any agriculture
// category to be assigned. This prevents metaphorical / everyday uses of words
// like 'disease', 'spray', 'rot', 'crop' from triggering farm categories.
const AGRI_ANCHORS = [
  // Farm / plot context
  'farm', 'plot', 'field', 'nursery', 'greenhouse', 'plantation',
  // Plants / flowers
  'plant', 'flower', 'crop', 'leaf', 'leaves', 'stem', 'root', 'bud',
  'soil', 'seedling', 'sapling',
  // Floriculture species
  'marigold', 'rose', 'carnation', 'gerbera', 'chrysanthemum', 'tuberose',
  'jasmine', 'lily', 'dahlia', 'gladiolus', 'anthurium', 'aster',
  // Common field terms
  'harvest', 'yield', 'irrigation', 'pesticide', 'fertilizer', 'fertiliser',
  'manure', 'compost', 'spray', 'drip', 'mulch',
];

// ── Minimum keyword hits required per category ───────────────────────────────
const MIN_HITS = {
  Urgent:        1,   // any single urgent word is enough (emergencies are universal)
  Disease:       2,   // needs 2 hits to prevent metaphorical uses
  Pesticide:     1,
  Fertilizer:    1,
  Irrigation:    2,   // 'water' alone is NOT enough — needs 2 irrigation terms
  'Crop Health': 2,   // 'yellow' or 'plant' alone is NOT enough
};

const RULES = [
  // ── HIGHEST priority: Safety emergencies ─────────────────────────────────
  {
    category: 'Urgent',
    // Urgent is the only category that does NOT require an AGRI_ANCHOR
    // because fire / flood / accident emergencies are always valid regardless of context.
    requiresAnchor: false,
    keywords: [
      'urgent', 'emergency', 'critical', 'immediately',
      'dangerous', 'severe', 'dying', 'dead crop', 'crop failure',
      'total loss', 'mass die', 'complete failure',
    ],
  },

  // ── Specific plant pathology ──────────────────────────────────────────────
  {
    category: 'Disease',
    requiresAnchor: true,
    keywords: [
      'disease', 'infection', 'blight', 'rot', 'fungus', 'fungal',
      'bacterial', 'virus', 'viral', 'wilt', 'rust', 'mold', 'mould',
      'canker', 'lesion', 'necrosis', 'pathogen', 'powdery mildew',
      'downy mildew', 'anthracnose', 'damping off',
    ],
  },

  // ── Pest / chemical management ────────────────────────────────────────────
  {
    category: 'Pesticide',
    requiresAnchor: true,
    keywords: [
      'pesticide', 'insecticide', 'herbicide', 'spray', 'spraying',
      'insect', 'fungicide', 'neem oil', 'neem spray', 'dosage',
      'chemical spray', 'aphid', 'mite', 'thrip', 'caterpillar',
      'whitefly', 'scale insect', 'mealy bug',
    ],
  },

  // ── Soil nutrition / amendments ───────────────────────────────────────────
  {
    category: 'Fertilizer',
    requiresAnchor: true,
    keywords: [
      'fertilizer', 'fertiliser', 'manure', 'compost', 'urea', 'npk',
      'dap', 'potash', 'nitrogen', 'phosphorus', 'potassium',
      'micronutrient', 'top dress', 'basal dose', 'foliar spray',
      'soil amendment', 'organic matter',
    ],
  },

  // ── Water management ─────────────────────────────────────────────────────
  {
    category: 'Irrigation',
    requiresAnchor: true,
    keywords: [
      'irrigation', 'drip irrigation', 'drip system', 'canal',
      'pump', 'flood irrigation', 'sprinkler', 'moisture level',
      'waterlogged', 'drainage', 'groundwater', 'bore well',
      'water schedule', 'water stress', 'soil moisture',
    ],
  },

  // ── General crop / plant observation ─────────────────────────────────────
  {
    category: 'Crop Health',
    requiresAnchor: true,
    keywords: [
      'seedling', 'germination', 'canopy', 'stunted growth',
      'yellowing leaves', 'yellow leaves', 'leaf curl', 'leaf spot',
      'wilting', 'flowering stage', 'fruiting stage', 'harvest stage',
      'plant health', 'crop damage', 'yield loss', 'marigold', 'rose',
      'carnation', 'gerbera', 'chrysanthemum', 'tuberose', 'jasmine',
      'field observation', 'white spots', 'brown spots', 'discoloration',
    ],
  },
];

/**
 * inferCategory
 *
 * Strict classifier — requires domain-specific context AND a floriculture anchor.
 * Generic English words that happen to overlap with agriculture are excluded.
 * Returns 'General' for irrelevant or ambiguous transcripts.
 *
 * @param {string} transcript - English transcript from Sarvam translate endpoint
 * @returns {string}          - visit_category enum value
 */
function inferCategory(transcript) {
  if (!transcript || transcript.trim().length < 5) return 'General';

  const lower = transcript.toLowerCase();

  // Pre-compute whether the transcript contains any agricultural anchor word
  const hasAnchor = AGRI_ANCHORS.some(anchor => lower.includes(anchor));

  for (const rule of RULES) {
    // If this category requires a farm context and none is found, skip it
    if (rule.requiresAnchor && !hasAnchor) continue;

    const hits      = rule.keywords.filter(kw => lower.includes(kw)).length;
    const threshold = MIN_HITS[rule.category] ?? 1;
    if (hits >= threshold) return rule.category;
  }

  return 'General';
}

module.exports = { inferCategory };
