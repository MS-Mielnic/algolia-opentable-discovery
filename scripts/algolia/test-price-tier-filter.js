import { readFile } from 'node:fs/promises';
import { algoliasearch } from 'algoliasearch';

import {
  CLEANED_RECORDS_PATH,
} from '../lib/project-paths.js';

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

const restaurants = JSON.parse(
  await readFile(CLEANED_RECORDS_PATH, 'utf8')
);

if (!Array.isArray(restaurants) || restaurants.length === 0) {
  throw new Error(
    'Cleaned dataset must contain a non-empty array'
  );
}

const validPriceTiers = new Set([
  2,
  3,
  4,
]);

for (const restaurant of restaurants) {
  if (!validPriceTiers.has(restaurant.price)) {
    throw new Error(
      `Restaurant ${restaurant.objectID ?? '<missing>'} ` +
      `has invalid source price tier: ${restaurant.price}`
    );
  }
}

const client = algoliasearch(
  VITE_ALGOLIA_APP_ID,
  VITE_ALGOLIA_SEARCH_API_KEY
);

const testCases = [
  {
    label: 'PRICE TIER $$',
    filters: 'price_tier = 2',
    predicate: (restaurant) =>
      restaurant.price === 2,
    validHit: (hit) =>
      hit.price_tier === 2,
  },
  {
    label: 'PRICE TIER $$$',
    filters: 'price_tier = 3',
    predicate: (restaurant) =>
      restaurant.price === 3,
    validHit: (hit) =>
      hit.price_tier === 3,
  },
  {
    label: 'PRICE TIER $$$$',
    filters: 'price_tier = 4',
    predicate: (restaurant) =>
      restaurant.price === 4,
    validHit: (hit) =>
      hit.price_tier === 4,
  },
  {
    label: 'ITALIAN + $$',
    filters:
      'food_type:"Italian" AND price_tier = 2',
    predicate: (restaurant) =>
      restaurant.food_type === 'Italian' &&
      restaurant.price === 2,
    validHit: (hit) =>
      hit.food_type === 'Italian' &&
      hit.price_tier === 2,
  },
  {
    label: 'FINE DINING + $$$$',
    filters:
      'dining_style:"Fine Dining" AND price_tier = 4',
    predicate: (restaurant) =>
      restaurant.dining_style === 'Fine Dining' &&
      restaurant.price === 4,
    validHit: (hit) =>
      hit.dining_style === 'Fine Dining' &&
      hit.price_tier === 4,
  },
  {
    label: 'EXCEPTIONAL + $$ OR $$$',
    filters:
      'stars_count >= 4.7 AND price_tier <= 3',
    predicate: (restaurant) =>
      restaurant.stars_count >= 4.7 &&
      restaurant.price <= 3,
    validHit: (hit) =>
      hit.stars_count >= 4.7 &&
      hit.price_tier <= 3,
  },
];

async function runCase(testCase) {
  const expectedHits = restaurants.filter(
    testCase.predicate
  ).length;

  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,

    searchParams: {
      query: '',
      filters: testCase.filters,
      hitsPerPage: 5,

      attributesToRetrieve: [
        'objectID',
        'name',
        'food_type',
        'dining_style',
        'city',
        'state',
        'price_tier',
        'price_tier_label',
        'starting_price_range',
        'stars_count',
        'reviews_count',
      ],
    },
  });

  if (response.nbHits !== expectedHits) {
    throw new Error(
      `${testCase.label}: expected ${expectedHits} hits, ` +
      `received ${response.nbHits}`
    );
  }

  for (const hit of response.hits) {
    const expectedLabel = '$'.repeat(
      hit.price_tier
    );

    if (
      !testCase.validHit(hit) ||
      hit.price_tier_label !== expectedLabel ||
      typeof hit.starting_price_range !== 'string' ||
      hit.starting_price_range.length === 0
    ) {
      throw new Error(
        `${testCase.label}: invalid projected price data ` +
        `for record ${hit.objectID}`
      );
    }
  }

  console.log('\n==================================================');
  console.log(testCase.label);
  console.log(`FILTERS: ${testCase.filters}`);
  console.log(`EXPECTED RECORDS: ${expectedHits}`);
  console.log(`MATCHING RECORDS: ${response.nbHits}`);
  console.log('==================================================');

  response.hits.forEach((hit, index) => {
    console.log(
      `${index + 1}. ${hit.name} | ` +
      `${hit.food_type} | ` +
      `${hit.dining_style} | ` +
      `${hit.city}, ${hit.state} | ` +
      `${hit.price_tier_label} | ` +
      `starts at ${hit.starting_price_range} | ` +
      `${hit.stars_count} stars | ` +
      `${hit.reviews_count} reviews`
    );
  });
}

for (const testCase of testCases) {
  await runCase(testCase);
}

const tierTotal = [2, 3, 4]
  .map((tier) => {
    return restaurants.filter(
      (restaurant) => restaurant.price === tier
    ).length;
  })
  .reduce((sum, count) => sum + count, 0);

if (tierTotal !== restaurants.length) {
  throw new Error(
    `Price-tier totals cover ${tierTotal} records, ` +
    `expected ${restaurants.length}`
  );
}

console.log('\nPrice-tier filter validation: OK');
