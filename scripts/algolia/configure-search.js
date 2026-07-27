import { algoliasearch } from 'algoliasearch';

const {
  ALGOLIA_APP_ID,
  ALGOLIA_WRITE_API_KEY,
  ALGOLIA_INDEX_NAME,
} = process.env;

const APPLY = process.argv.includes('--apply');

const requiredEnvironment = {
  ALGOLIA_APP_ID,
  ALGOLIA_WRITE_API_KEY,
  ALGOLIA_INDEX_NAME,
};

for (const [name, value] of Object.entries(requiredEnvironment)) {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }
}

/*
 * Shared search baseline — known-item and discovery
 *
 * Goal:
 * - restaurant name remains the strongest relevance signal
 * - compact name supports fully concatenated restaurant names
 * - cuisine supports discovery without outranking restaurant identity
 * - location attributes help disambiguate restaurants with
 *   the same or similar names
 */
const searchableAttributes = [
  'unordered(name)',
  'unordered(name_compact)',
  'unordered(food_type)',
  'city,neighborhood',
  'area',
  'state',
];

const attributesForFaceting = [
  'searchable(food_type)',
  'dining_style',
  'filterOnly(stars_count)',
  'filterOnly(price_tier)',
  'filterOnly(city)',
  'filterOnly(state)',
  'filterOnly(area)',
  'filterOnly(neighborhood)',
  'filterOnly(reviews_count)',
  'payment_options',
];

const customRanking = [
  'desc(bayesian_rating)',
];

console.log('Search configuration');
console.log('-------------------------------');
console.log(`Index: ${ALGOLIA_INDEX_NAME}`);

console.log('\nsearchableAttributes:');

searchableAttributes.forEach((attribute, index) => {
  console.log(
    `  Priority ${index + 1}: ${attribute}`
  );
});

console.log('\nattributesForFaceting:');

for (const attribute of attributesForFaceting) {
  console.log(`  - ${attribute}`);
}

console.log('\ncustomRanking:');

for (const criterion of customRanking) {
  console.log(`  - ${criterion}`);
}

if (!APPLY) {
  console.log('\nNo settings were changed.');
  console.log(
    'Dry run only. Use --apply when ready to update Algolia.'
  );
  process.exit(0);
}

const client = algoliasearch(
  ALGOLIA_APP_ID,
  ALGOLIA_WRITE_API_KEY
);

console.log('\nApplying settings...');

const response = await client.setSettings({
  indexName: ALGOLIA_INDEX_NAME,
  indexSettings: {
    searchableAttributes,
    attributesForFaceting,
    customRanking,
  },
});

await client.waitForTask({
  indexName: ALGOLIA_INDEX_NAME,
  taskID: response.taskID,
});

console.log('\nSearch configuration: OK');
console.log(`Index: ${ALGOLIA_INDEX_NAME}`);
console.log('Settings task completed.');
