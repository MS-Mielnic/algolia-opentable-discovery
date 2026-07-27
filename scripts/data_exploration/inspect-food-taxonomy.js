import { RESTAURANTS_CSV_PATH } from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

/*
 * ============================================================
 * FOOD TYPE TAXONOMY REVIEW
 * ============================================================
 *
 * PURPOSE:
 * Surface food_type labels that may represent taxonomy fragmentation.
 *
 * Example already investigated:
 *
 *   Steak
 *   Steakhouse
 *
 * IMPORTANT:
 * This script does NOT modify the data.
 *
 * Candidate pairs are only investigation hints. Similar-looking labels
 * are not automatically considered equivalent.
 */


const csvContents = await readFile(
  RESTAURANTS_CSV_PATH,
  'utf8'
);

const restaurantsInfo = parse(csvContents, {
  columns: true,
  delimiter: ';',
  skip_empty_lines: true,
});


/*
 * Count source food_type values.
 */

const foodTypeCounts = new Map();

for (const record of restaurantsInfo) {
  const foodType = record.food_type.trim();

  foodTypeCounts.set(
    foodType,
    (foodTypeCounts.get(foodType) ?? 0) + 1
  );
}

const foodTypes = [...foodTypeCounts.keys()];


/*
 * ============================================================
 * NORMALIZATION FOR COMPARISON ONLY
 * ============================================================
 *
 * This value is NEVER written back to the dataset.
 *
 * It removes punctuation and spacing so that labels such as:
 *
 *   "Gastro Pub"
 *   "Gastro-Pub"
 *
 * would look more similar during candidate detection.
 */

function normalizeForComparison(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}


/*
 * Tokenization gives us a second comparison signal.
 *
 * Example:
 *
 *   "Contemporary American"
 *
 * becomes:
 *
 *   ["contemporary", "american"]
 */

function tokenize(value) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}


/*
 * Jaccard token similarity.
 *
 * 1.0 = same token set
 * 0.0 = no shared tokens
 *
 * This is only a screening heuristic.
 */

function tokenSimilarity(a, b) {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));

  const intersection = [...tokensA].filter(
    (token) => tokensB.has(token)
  );

  const union = new Set([
    ...tokensA,
    ...tokensB,
  ]);

  return intersection.length / union.size;
}


/*
 * Basic Levenshtein distance.
 *
 * Used to detect labels that differ only slightly in wording/spelling.
 */

function levenshteinDistance(a, b) {
  const matrix = Array.from(
    { length: b.length + 1 },
    () => Array(a.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i += 1) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= b.length; j += 1) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const substitutionCost =
        a[i - 1] === b[j - 1] ? 0 : 1;

      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + substitutionCost
      );
    }
  }

  return matrix[b.length][a.length];
}


function stringSimilarity(a, b) {
  const normalizedA = normalizeForComparison(a);
  const normalizedB = normalizeForComparison(b);

  const longestLength = Math.max(
    normalizedA.length,
    normalizedB.length
  );

  if (longestLength === 0) {
    return 1;
  }

  const distance = levenshteinDistance(
    normalizedA,
    normalizedB
  );

  return 1 - distance / longestLength;
}


/*
 * ============================================================
 * CANDIDATE DETECTION
 * ============================================================
 *
 * We flag pairs when at least one of these signals is present:
 *
 * 1. One normalized label contains the other.
 *    Example: Steak / Steakhouse
 *
 * 2. High character similarity.
 *
 * 3. Strong token overlap.
 *
 * Again: being flagged does NOT mean the categories should be merged.
 */

const candidates = [];

for (let i = 0; i < foodTypes.length; i += 1) {
  for (let j = i + 1; j < foodTypes.length; j += 1) {
    const first = foodTypes[i];
    const second = foodTypes[j];

    const normalizedFirst =
      normalizeForComparison(first);

    const normalizedSecond =
      normalizeForComparison(second);

    const contains =
      normalizedFirst.includes(normalizedSecond) ||
      normalizedSecond.includes(normalizedFirst);

    const characterSimilarity =
      stringSimilarity(first, second);

    const tokens =
      tokenSimilarity(first, second);

    /*
     * Thresholds are intentionally used only to reduce the number of
     * pairs requiring human review.
     *
     * They are NOT cleaning rules.
     */
    if (
      contains ||
      characterSimilarity >= 0.72 ||
      tokens >= 0.5
    ) {
      candidates.push({
        first,
        firstCount: foodTypeCounts.get(first),
        second,
        secondCount: foodTypeCounts.get(second),
        contains,
        characterSimilarity,
        tokenSimilarity: tokens,
      });
    }
  }
}


/*
 * Sort the strongest candidates first.
 */

candidates.sort((a, b) => {
  const scoreA = Math.max(
    a.characterSimilarity,
    a.tokenSimilarity,
    a.contains ? 1 : 0
  );

  const scoreB = Math.max(
    b.characterSimilarity,
    b.tokenSimilarity,
    b.contains ? 1 : 0
  );

  return scoreB - scoreA;
});


/*
 * ============================================================
 * OUTPUT
 * ============================================================
 */

console.log('Food type taxonomy review');

console.log(
  '\nUnique food types:',
  foodTypes.length
);


/*
 * First show the complete taxonomy and record counts.
 *
 * This gives us context when evaluating suspicious pairs.
 */

console.log('\nFood types by frequency:');

[...foodTypeCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .forEach(([foodType, count]) => {
    console.log(
      `  ${foodType}: ${count}`
    );
  });


console.log('\nPotential taxonomy overlaps:');

if (candidates.length === 0) {
  console.log('  None detected by current heuristics.');
} else {
  for (const candidate of candidates) {
    console.log(
      `\n  ${candidate.first} (${candidate.firstCount})` +
      `  <->  ` +
      `${candidate.second} (${candidate.secondCount})`
    );

    console.log(
      `    substring relation: ` +
      `${candidate.contains ? 'yes' : 'no'}`
    );

    console.log(
      `    character similarity: ` +
      `${candidate.characterSimilarity.toFixed(2)}`
    );

    console.log(
      `    token similarity: ` +
      `${candidate.tokenSimilarity.toFixed(2)}`
    );
  }
}