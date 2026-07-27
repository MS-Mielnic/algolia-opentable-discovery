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

const expectedDiningStyles = [
  'Casual Dining',
  'Casual Elegant',
  'Fine Dining',
  'Home Style',
];

async function getDiningStyleCounts() {
  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,

    searchParams: {
      query: '',
      hitsPerPage: 0,
      facets: ['dining_style'],
      maxValuesPerFacet: 10,
    },
  });

  const counts = response.facets?.dining_style;

  if (!counts) {
    throw new Error(
      'Algolia did not return dining_style facet counts'
    );
  }

  const actualStyles = Object.keys(counts).sort();
  const expectedStyles = [...expectedDiningStyles].sort();

  if (
    JSON.stringify(actualStyles) !==
    JSON.stringify(expectedStyles)
  ) {
    throw new Error(
      `Unexpected dining styles.\n` +
      `Expected: ${expectedStyles.join(', ')}\n` +
      `Actual: ${actualStyles.join(', ')}`
    );
  }

  const total = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0
  );

  if (total !== response.nbHits) {
    throw new Error(
      `Dining-style counts sum to ${total}, ` +
      `but the empty query returned ${response.nbHits} records`
    );
  }

  console.log('\n==================================================');
  console.log('EMPTY-QUERY DINING-STYLE FACET COUNTS');
  console.log('==================================================');

  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([style, count]) => {
      console.log(`${style}: ${count}`);
    });

  console.log(`Total: ${total}`);
}

async function runCase({
  label,
  query = '',
  filters,
}) {
  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,

    searchParams: {
      query,
      filters,
      hitsPerPage: 5,

      attributesToRetrieve: [
        'objectID',
        'name',
        'food_type',
        'dining_style',
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
  console.log(`FILTERS: ${filters}`);
  console.log(`MATCHING RECORDS: ${response.nbHits}`);
  console.log('==================================================');

  for (const [index, hit] of response.hits.entries()) {
    console.log(
      `${index + 1}. ${hit.name} | ` +
      `${hit.food_type} | ` +
      `${hit.dining_style} | ` +
      `${hit.city}, ${hit.state} | ` +
      `${hit.stars_count} stars | ` +
      `${hit.reviews_count} reviews | ` +
      `${hit.price_range}`
    );
  }
}

await getDiningStyleCounts();

await runCase({
  label: 'EXACT FINE-DINING REFINEMENT',
  filters: 'dining_style:"Fine Dining"',
});

await runCase({
  label: 'ITALIAN + FINE DINING',
  filters:
    'food_type:"Italian" AND dining_style:"Fine Dining"',
});

await runCase({
  label: 'STEAKHOUSE + CASUAL ELEGANT',
  filters:
    'food_type:"Steakhouse" AND dining_style:"Casual Elegant"',
});

await runCase({
  label: 'ITALIAN TEXT + CASUAL DINING',
  query: 'Italian',
  filters:
    'food_type:"Italian" AND dining_style:"Casual Dining"',
});
