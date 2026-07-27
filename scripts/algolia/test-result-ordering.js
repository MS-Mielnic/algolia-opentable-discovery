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

function formatRankingInfo(hit) {
  const ranking = hit._rankingInfo ?? {};

  return [
    `typos=${ranking.nbTypos ?? 'n/a'}`,
    `exactWords=${ranking.nbExactWords ?? 'n/a'}`,
    `proximity=${ranking.proximityDistance ?? 'n/a'}`,
    `userScore=${ranking.userScore ?? 'n/a'}`,
  ].join(', ');
}

async function runCase({
  label,
  query,
  filters = null,
}) {
  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,

    searchParams: {
      query,
      hitsPerPage: 10,
      getRankingInfo: true,

      ...(filters ? { filters } : {}),

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
      `${hit.price_range} | ` +
      `${formatRankingInfo(hit)} | ` +
      `objectID=${hit.objectID}`
    );
  });
}

/*
 * All records have no text-relevance signal.
 * This reveals the current empty-query order.
 */
await runCase({
  label: 'EMPTY QUERY — CURRENT ORDER',
  query: '',
});

/*
 * All returned records have the same exact cuisine refinement.
 * This isolates ordering when text relevance is absent.
 */
await runCase({
  label: 'EMPTY QUERY + ITALIAN FACET — CURRENT ORDER',
  query: '',
  filters: 'food_type:"Italian"',
});

/*
 * Text relevance remains active.
 * Restaurants with Italian in their names may rank above other
 * records sharing the same exact cuisine.
 */
await runCase({
  label: 'ITALIAN TEXT + ITALIAN FACET — CURRENT ORDER',
  query: 'Italian',
  filters: 'food_type:"Italian"',
});

/*
 * A second cuisine verifies that any ordering behavior is not
 * specific to Italian restaurants.
 */
await runCase({
  label: 'EMPTY QUERY + STEAKHOUSE FACET — CURRENT ORDER',
  query: '',
  filters: 'food_type:"Steakhouse"',
});
