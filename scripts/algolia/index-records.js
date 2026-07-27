import { algoliasearch } from 'algoliasearch';
import { readFile } from 'node:fs/promises';

import { CLEANED_RECORDS_PATH } from '../lib/project-paths.js';


const {
  ALGOLIA_APP_ID,
  ALGOLIA_WRITE_API_KEY,
  ALGOLIA_INDEX_NAME,
} = process.env;

/*
 * Validate required server-side configuration.
 *
 * Never print credential values.
 */
function validateEnvironment() {
  const missing = [];

  if (!ALGOLIA_APP_ID) {
    missing.push('ALGOLIA_APP_ID');
  }

  if (!ALGOLIA_WRITE_API_KEY) {
    missing.push('ALGOLIA_WRITE_API_KEY');
  }

  if (!ALGOLIA_INDEX_NAME) {
    missing.push('ALGOLIA_INDEX_NAME');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}`
    );
  }
}

/*
 * Convert the canonical cleaned restaurant record into the
 * smaller record shape required by the Algolia search experience.
 *
 * Deliberately excluded for now:
 * - food_type_raw: source lineage only
 * - country: all records are US
 * - phone / phone_number: source-of-truth clarification pending
 *
 * The two source price dimensions are included with explicit
 * search-facing names:
 * - price_tier: industry-standard numeric tier
 * - price_tier_label: familiar $$ / $$$ / $$$$ display value
 * - starting_price_range: CSV starting-price band
 */
function compactSearchText(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const VALID_PRICE_TIERS = new Set([
  2,
  3,
  4,
]);

function toPriceTierLabel(priceTier) {
  if (!VALID_PRICE_TIERS.has(priceTier)) {
    throw new Error(
      `Unsupported price tier: ${priceTier}`
    );
  }

  return '$'.repeat(priceTier);
}

function mean(values) {
  if (values.length === 0) {
    throw new Error('Cannot calculate the mean of an empty array');
  }

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function percentile(sortedValues, probability) {
  if (sortedValues.length === 0) {
    throw new Error(
      'Cannot calculate a percentile from an empty array'
    );
  }

  const position =
    (sortedValues.length - 1) * probability;

  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const weight = position - lowerIndex;

  return (
    sortedValues[lowerIndex] * (1 - weight) +
    sortedValues[upperIndex] * weight
  );
}

function buildBayesianRankingModel(restaurants) {
  if (restaurants.length === 0) {
    throw new Error(
      'Cannot build a ranking model from an empty dataset'
    );
  }

  for (const restaurant of restaurants) {
    if (
      !Number.isFinite(restaurant.stars_count) ||
      !Number.isFinite(restaurant.reviews_count) ||
      restaurant.reviews_count < 0
    ) {
      throw new Error(
        `Restaurant ${restaurant.objectID ?? '<missing>'} ` +
        'has invalid rating or review-count data'
      );
    }
  }

  const ratings = restaurants.map(
    (restaurant) => restaurant.stars_count
  );

  const sortedReviewCounts = restaurants
    .map((restaurant) => restaurant.reviews_count)
    .sort((a, b) => a - b);

  return {
    globalMeanRating: mean(ratings),

    // Dataset-derived confidence threshold selected during
    // offline ranking analysis.
    reviewConfidenceThreshold: percentile(
      sortedReviewCounts,
      0.5
    ),
  };
}

function calculateBayesianRating(
  restaurant,
  rankingModel
) {
  const rating = restaurant.stars_count;
  const reviews = restaurant.reviews_count;
  const {
    globalMeanRating,
    reviewConfidenceThreshold,
  } = rankingModel;

  const score =
    (
      reviews /
      (reviews + reviewConfidenceThreshold)
    ) * rating +
    (
      reviewConfidenceThreshold /
      (reviews + reviewConfidenceThreshold)
    ) * globalMeanRating;

  // A stable numeric precision is sufficient for tie-breaking
  // while avoiding unnecessary floating-point noise.
  return Number(score.toFixed(6));
}

function toAlgoliaRecord(restaurant, rankingModel) {
  return {
    objectID: restaurant.objectID,

    // Search / discovery
    name: restaurant.name,

    // Search-only alias for fully concatenated restaurant names.
    name_compact: compactSearchText(restaurant.name),
    food_type: restaurant.food_type,
    city: restaurant.city,
    state: restaurant.state,
    area: restaurant.area,
    neighborhood: restaurant.neighborhood,
    dining_style: restaurant.dining_style,
    payment_options: restaurant.payment_options,

    // Refinement / display / ranking
    price_tier: restaurant.price,
    price_tier_label: toPriceTierLabel(
      restaurant.price
    ),
    starting_price_range: restaurant.price_range,
    stars_count: restaurant.stars_count,
    reviews_count: restaurant.reviews_count,

    // Search-specific quality signal derived from rating
    // and review-count confidence.
    bayesian_rating: calculateBayesianRating(
      restaurant,
      rankingModel
    ),

    // Location-aware relevance
    _geoloc: restaurant._geoloc,

    // Display / location disambiguation
    address: restaurant.address,
    postal_code: restaurant.postal_code,
    image_url: restaurant.image_url,

    // Booking actions
    reserve_url: restaurant.reserve_url,
    mobile_reserve_url: restaurant.mobile_reserve_url,
  };
}

function validateProjectedRecords(records) {
  const objectIDs = records.map((record) => record.objectID);
  const uniqueObjectIDs = new Set(objectIDs);

  if (uniqueObjectIDs.size !== records.length) {
    throw new Error(
      `Projected records contain duplicate objectIDs: ` +
      `${records.length} records, ${uniqueObjectIDs.size} unique IDs`
    );
  }

  for (const record of records) {
    if (
      !record.objectID ||
      !record.name ||
      !record.name_compact ||
      !record.food_type ||
      !VALID_PRICE_TIERS.has(record.price_tier) ||
      record.price_tier_label !==
        '$'.repeat(record.price_tier) ||
      !record.starting_price_range ||
      !record._geoloc ||
      !Number.isFinite(record.bayesian_rating)
    ) {
      throw new Error(
        `Projected record ${record.objectID ?? '<missing>'} ` +
        'is missing required search data'
      );
    }
  }
}

async function main() {
  validateEnvironment();
  
  const shouldUpload = process.argv.includes('--upload');
  const contents = await readFile(CLEANED_RECORDS_PATH, 'utf8');
  const restaurants = JSON.parse(contents);

  if (!Array.isArray(restaurants)) {
    throw new Error('Cleaned dataset must contain a JSON array');
  }

  const rankingModel =
    buildBayesianRankingModel(restaurants);

  const records = restaurants.map((restaurant) => {
    return toAlgoliaRecord(
      restaurant,
      rankingModel
    );
  });

  validateProjectedRecords(records);

  console.log('Algolia indexing dry run: OK');
  console.log(`Source records: ${restaurants.length}`);
  console.log(`Projected records: ${records.length}`);
  console.log(
    `Unique objectIDs: ${new Set(records.map((record) => record.objectID)).size}`
  );
  console.log(`Target index: ${ALGOLIA_INDEX_NAME}`);

  console.log('\nBayesian ranking model:');
  console.log(
    `  Global mean rating: ` +
    `${rankingModel.globalMeanRating.toFixed(4)}`
  );
  console.log(
    `  Review confidence threshold: ` +
    `${rankingModel.reviewConfidenceThreshold.toFixed(1)}`
  );

  console.log('\nFirst projected record:');
  console.dir(records[0], {
    depth: null,
    colors: true,
  });

  if (!shouldUpload) {
  console.log('\nNo records were uploaded.');
  console.log(
    'Dry run only. Use --upload when you are ready to write to Algolia.'
  );
  return;
}

console.log(`\nUploading ${records.length} records...`);

const client = algoliasearch(
  ALGOLIA_APP_ID,
  ALGOLIA_WRITE_API_KEY
);

const response = await client.saveObjects({
  indexName: ALGOLIA_INDEX_NAME,
  objects: records,
  waitForTasks: true,
});

console.log('Algolia upload: OK');
console.log(`Target index: ${ALGOLIA_INDEX_NAME}`);
console.log(`Records submitted: ${records.length}`);
console.log(`Tasks completed: ${response.taskIDs?.length ?? 'completed'}`);
}

main().catch((error) => {
  console.error('\nIndexing dry run failed:');
  console.error(error.message);
  process.exitCode = 1;
});