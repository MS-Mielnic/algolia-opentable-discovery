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

const testCases = [
  {
    label: 'ALL RESTAURANTS — 4.5+',
    filters: 'stars_count >= 4.5',
    minimumRating: 4.5,
    expectedHits: 1590,
  },
  {
    label: 'ALL RESTAURANTS — 4.7+',
    filters: 'stars_count >= 4.7',
    minimumRating: 4.7,
    expectedHits: 332,
  },
  {
    label: 'ITALIAN — 4.5+',
    filters:
      'food_type:"Italian" AND stars_count >= 4.5',
    minimumRating: 4.5,
    expectedHits: 247,
  },
  {
    label: 'ITALIAN — 4.7+',
    filters:
      'food_type:"Italian" AND stars_count >= 4.7',
    minimumRating: 4.7,
    expectedHits: 41,
  },
  {
    label: 'FINE DINING — 4.7+',
    filters:
      'dining_style:"Fine Dining" AND stars_count >= 4.7',
    minimumRating: 4.7,
    expectedHits: 98,
  },
];

async function runCase(testCase) {
  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,

    searchParams: {
      query: '',
      filters: testCase.filters,
      hitsPerPage: 10,

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
        'bayesian_rating',
      ],
    },
  });

  if (response.nbHits !== testCase.expectedHits) {
    throw new Error(
      `${testCase.label}: expected ` +
      `${testCase.expectedHits} hits, received ${response.nbHits}`
    );
  }

  for (const hit of response.hits) {
    if (
      !Number.isFinite(hit.stars_count) ||
      hit.stars_count < testCase.minimumRating
    ) {
      throw new Error(
        `${testCase.label}: record ${hit.objectID} ` +
        `has invalid rating ${hit.stars_count}`
      );
    }
  }

  console.log('\n==================================================');
  console.log(testCase.label);
  console.log(`FILTERS: ${testCase.filters}`);
  console.log(`MATCHING RECORDS: ${response.nbHits}`);
  console.log('==================================================');

  response.hits.slice(0, 5).forEach((hit, index) => {
    console.log(
      `${index + 1}. ${hit.name} | ` +
      `${hit.food_type} | ` +
      `${hit.dining_style} | ` +
      `${hit.city}, ${hit.state} | ` +
      `${hit.stars_count} stars | ` +
      `${hit.reviews_count} reviews | ` +
      `${hit.price_range}`
    );
  });
}

for (const testCase of testCases) {
  await runCase(testCase);
}

console.log('\nRating-filter validation: OK');
