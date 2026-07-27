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

/*
 * Persona 2 — cuisine discovery baseline.
 *
 * Run before and after adding food_type to searchableAttributes
 * so the impact can be compared directly.
 */
const queries = [
  'Italian',
  'Sushi',
  'Steakhouse',
  'Italian Dallas',
  'Sushi Denver',
  'Steakhouse Dallas',
  'Contemporary American Denver',
];

for (const query of queries) {
  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,
    searchParams: {
      query,
      hitsPerPage: 5,

      attributesToRetrieve: [
        'objectID',
        'name',
        'food_type',
        'city',
        'state',
        'area',
        'neighborhood',
        'stars_count',
        'reviews_count',
        'price_range',
      ],

      attributesToHighlight: [
        'name',
        'name_compact',
        'food_type',
        'city',
        'state',
        'area',
        'neighborhood',
      ],
    },
  });

  console.log('\n==================================================');
  console.log(`QUERY: "${query}"`);
  console.log(`MATCHING RECORDS: ${response.nbHits}`);
  console.log('==================================================');

  response.hits.forEach((hit, index) => {
    const foodMatch =
      hit._highlightResult?.food_type?.matchLevel ?? 'none';

    console.log(
      `${index + 1}. ${hit.name} | ` +
      `${hit.food_type} | ` +
      `${hit.city}, ${hit.state} | ` +
      `${hit.stars_count} stars | ` +
      `${hit.reviews_count} reviews | ` +
      `${hit.price_range} | ` +
      `food_type_match=${foodMatch}`
    );
  });
}
