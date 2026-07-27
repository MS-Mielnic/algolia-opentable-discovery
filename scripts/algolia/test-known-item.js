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
 * First known-item baseline.
 *
 * These queries intentionally test only:
 * - exact restaurant-name retrieval
 * - restaurant name + location
 * - ambiguous/repeated names
 *
 * Typo, partial-name, and concatenation cases will be evaluated
 * separately after this baseline.
 */
const queries = [
  // Baseline precision / disambiguation
  'Epernay',
  'Epernay Denver',
  'Town',
  'Town Carbondale',
  'Pappas Bros. Steakhouse',

  // Partial restaurant names
  'Pappas',
  'Pappas Bros',

  // Misspellings
  'Papas Bros Steakhouse',
  'Pappas Bros Stekhouse',

  // Concatenated restaurant names
  'pappasbros',
  'pappasbrossteakhouse',
  'labellavita',
  'rafainbraziliansteakhouse',
  'thecedarssocial',

  // Concatenation + misspelling
  'pappasbrosteakhouse',
  'pappasbrossteakhose',
  'ppapasbrostakehouse',
  'labellvit',

  // Punctuation / formatting variations
  "Iaria's Italian Restaurant",
  'Iarias Italian Restaurant',
  "Atria's",
  'Atrias',

  // Same-brand / location disambiguation
  'Atrias Pittsburgh',
  'Atrias PNC Park',
  "Atrias O'Hara",

  // Name + location disambiguation
  'Pappas Bros Dallas',
  'Pappas Bros Houston',
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
    console.log(
      `${index + 1}. ${hit.name} | ` +
      `${hit.city}, ${hit.state} | ` +
      `${hit.neighborhood} | ` +
      `objectID=${hit.objectID}`
    );
  });
}
