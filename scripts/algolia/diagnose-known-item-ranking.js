import { algoliasearch } from 'algoliasearch';

const {
  VITE_ALGOLIA_APP_ID,
  VITE_ALGOLIA_SEARCH_API_KEY,
  ALGOLIA_INDEX_NAME,
} = process.env;

for (const [name, value] of Object.entries({
  VITE_ALGOLIA_APP_ID,
  VITE_ALGOLIA_SEARCH_API_KEY,
  ALGOLIA_INDEX_NAME,
})) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const client = algoliasearch(
  VITE_ALGOLIA_APP_ID,
  VITE_ALGOLIA_SEARCH_API_KEY
);

const query = 'Atrias Pittsburgh';

const response = await client.searchSingleIndex({
  indexName: ALGOLIA_INDEX_NAME,
  searchParams: {
    query,
    hitsPerPage: 8,
    getRankingInfo: true,

    attributesToRetrieve: [
      'objectID',
      'name',
      'city',
      'state',
      'area',
      'neighborhood',
    ],

    attributesToHighlight: [
      'name',
      'name_compact',
      'city',
      'area',
      'neighborhood',
      'state',
    ],
  },
});

console.log(`QUERY: "${query}"`);
console.log(`MATCHING RECORDS: ${response.nbHits}`);

for (const [index, hit] of response.hits.entries()) {
  console.log('\n----------------------------------------');
  console.log(
    `${index + 1}. ${hit.name} | ${hit.city}, ${hit.state}`
  );

  console.log(`area: ${hit.area}`);
  console.log(`neighborhood: ${hit.neighborhood}`);

  console.log('\nRanking info:');
  console.dir(hit._rankingInfo, {
    depth: null,
  });

  console.log('\nMatch info:');

  for (const attribute of [
    'name',
    'name_compact',
    'city',
    'area',
    'neighborhood',
    'state',
  ]) {
    const match = hit._highlightResult?.[attribute];

    if (!match) {
      continue;
    }

    console.log(
      `${attribute}: ` +
      `matchLevel=${match.matchLevel}, ` +
      `matchedWords=${JSON.stringify(match.matchedWords ?? [])}`
    );
  }
}
