import { algoliasearch } from 'algoliasearch';

const {
  VITE_ALGOLIA_APP_ID,
  VITE_ALGOLIA_SEARCH_API_KEY,
  ALGOLIA_INDEX_NAME,
} = process.env;

const requiredEnvironment = {
  VITE_ALGOLIA_APP_ID,
  VITE_ALGOLIA_SEARCH_API_KEY,
  ALGOLIA_INDEX_NAME,
};

for (const [name, value] of Object.entries(requiredEnvironment)) {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}`
    );
  }
}

const client = algoliasearch(
  VITE_ALGOLIA_APP_ID,
  VITE_ALGOLIA_SEARCH_API_KEY
);

const HIDDEN_GEMS_MIN_RATING = 4.7;
const HIDDEN_GEMS_MAX_REVIEWS = 200;
const EXPECTED_HITS = 108;

const filters =
  `stars_count >= ${HIDDEN_GEMS_MIN_RATING} ` +
  `AND reviews_count <= ${HIDDEN_GEMS_MAX_REVIEWS}`;

const response = await client.searchSingleIndex({
  indexName: ALGOLIA_INDEX_NAME,

  searchParams: {
    query: '',
    filters,
    hitsPerPage: 20,

    attributesToRetrieve: [
      'objectID',
      'name',
      'food_type',
      'dining_style',
      'city',
      'state',
      'stars_count',
      'reviews_count',
      'price_tier_label',
      'bayesian_rating',
    ],
  },
});

if (response.nbHits !== EXPECTED_HITS) {
  throw new Error(
    `Hidden Gems: expected ${EXPECTED_HITS} hits, ` +
    `received ${response.nbHits}`
  );
}

for (const hit of response.hits) {
  if (
    !Number.isFinite(hit.stars_count) ||
    hit.stars_count < HIDDEN_GEMS_MIN_RATING
  ) {
    throw new Error(
      `Hidden Gems: record ${hit.objectID} ` +
      `has invalid rating ${hit.stars_count}`
    );
  }

  if (
    !Number.isFinite(hit.reviews_count) ||
    hit.reviews_count > HIDDEN_GEMS_MAX_REVIEWS
  ) {
    throw new Error(
      `Hidden Gems: record ${hit.objectID} ` +
      `has invalid review count ${hit.reviews_count}`
    );
  }
}

console.log('\n==================================================');
console.log('HIDDEN GEMS');
console.log(`FILTERS: ${filters}`);
console.log(`EXPECTED RECORDS: ${EXPECTED_HITS}`);
console.log(`MATCHING RECORDS: ${response.nbHits}`);
console.log('==================================================');

response.hits.slice(0, 10).forEach((hit, index) => {
  console.log(
    `${index + 1}. ${hit.name} | ` +
    `${hit.food_type} | ` +
    `${hit.dining_style} | ` +
    `${hit.city}, ${hit.state} | ` +
    `${hit.stars_count} stars | ` +
    `${hit.reviews_count} reviews | ` +
    `${hit.price_tier_label ?? ''}`
  );
});

console.log('\nHidden Gems filter validation: OK');