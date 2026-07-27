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

const commonSearchParams = {
  hitsPerPage: 5,

  attributesToRetrieve: [
    'objectID',
    'name',
    'food_type',
    'city',
    'state',
    'stars_count',
    'reviews_count',
    'price_range',
  ],
};

async function runCase({
  label,
  query,
  filters,
}) {
  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,
    searchParams: {
      ...commonSearchParams,
      query,
      ...(filters ? { filters } : {}),
    },
  });

  console.log('\n==================================================');
  console.log(label);
  console.log(`QUERY: "${query}"`);
  console.log(`FILTERS: ${filters ?? '(none)'}`);
  console.log(`MATCHING RECORDS: ${response.nbHits}`);
  console.log('==================================================');

  response.hits.forEach((hit, index) => {
    console.log(
      `${index + 1}. ${hit.name} | ` +
      `${hit.food_type} | ` +
      `${hit.city}, ${hit.state} | ` +
      `${hit.stars_count} stars | ` +
      `${hit.reviews_count} reviews | ` +
      `${hit.price_range}`
    );
  });

  return response;
}

/*
 * 1. Broad text discovery.
 *
 * May match food_type, restaurant name, or other searchable text.
 */
await runCase({
  label: 'BROAD TEXT SEARCH',
  query: 'Italian',
  filters: null,
});

/*
 * 2. Exact cuisine refinement with an empty text query.
 *
 * Every returned record must have food_type = Italian.
 */
await runCase({
  label: 'EXACT CUISINE REFINEMENT',
  query: '',
  filters: 'food_type:"Italian"',
});

/*
 * 3. Text search combined with exact refinement.
 *
 * Demonstrates how a user can search and then refine.
 */
await runCase({
  label: 'TEXT SEARCH + EXACT CUISINE REFINEMENT',
  query: 'Italian',
  filters: 'food_type:"Italian"',
});

/*
 * 4. Empty-query cuisine browsing.
 *
 * Retrieve cuisine counts that can later power browse/refinement UI.
 */
const facetResponse = await client.searchSingleIndex({
  indexName: ALGOLIA_INDEX_NAME,
  searchParams: {
    query: '',
    hitsPerPage: 0,
    facets: ['food_type'],
    maxValuesPerFacet: 20,
  },
});

const cuisineCounts =
  facetResponse.facets?.food_type ?? {};

const topCuisines = Object.entries(cuisineCounts)
  .sort((a, b) => b[1] - a[1]);

console.log('\n==================================================');
console.log('EMPTY-QUERY CUISINE FACET COUNTS');
console.log('==================================================');

for (const [cuisine, count] of topCuisines) {
  console.log(`${cuisine}: ${count}`);
}
