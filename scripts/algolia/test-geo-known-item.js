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

function findAnchor(objectID, label) {
  const restaurant = restaurants.find(
    (record) => record.objectID === objectID
  );

  if (!restaurant) {
    throw new Error(
      `Could not find ${label} anchor: ${objectID}`
    );
  }

  const lat = restaurant._geoloc?.lat;
  const lng = restaurant._geoloc?.lng;

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new Error(
      `${label} anchor has invalid _geoloc`
    );
  }

  return {
    label,
    restaurant,
    aroundLatLng: `${lat},${lng}`,
  };
}

const anchors = {
  dallas: findAnchor(
    '1959',
    'Dallas — Pappas Bros.'
  ),

  houston: findAnchor(
    '1854',
    'Houston — Pappas Bros.'
  ),

  newYork: findAnchor(
    '77779',
    'New York — Pampas Argentinas'
  ),
};

const client = algoliasearch(
  VITE_ALGOLIA_APP_ID,
  VITE_ALGOLIA_SEARCH_API_KEY
);

function formatDistance(hit) {
  const distance =
    hit._rankingInfo?.matchedGeoLocation?.distance;

  if (!Number.isFinite(distance)) {
    return 'not available';
  }

  if (distance < 1000) {
    return `${distance} m`;
  }

  return `${(distance / 1000).toFixed(1)} km`;
}

function formatNameMatch(hit) {
  return (
    hit._highlightResult?.name?.matchLevel ??
    'not available'
  );
}

async function runCase({
  label,
  query,
  anchor = null,
  restrictSearchableAttributes = null,
}) {
  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,

    searchParams: {
      query,
      hitsPerPage: 5,
      getRankingInfo: true,

      ...(restrictSearchableAttributes
        ? { restrictSearchableAttributes }
        : {}),

      ...(anchor
        ? {
            aroundLatLng: anchor.aroundLatLng,
            aroundRadius: 'all',
          }
        : {}),

      attributesToRetrieve: [
        'objectID',
        'name',
        'food_type',
        'city',
        'state',
        'area',
        'neighborhood',
        '_geoloc',
      ],

      attributesToHighlight: [
        'name',
      ],
    },
  });

  console.log('\n==================================================');
  console.log(label);
  console.log(`QUERY: "${query}"`);
  console.log(
    `SEARCH SCOPE: ${
      restrictSearchableAttributes
        ? restrictSearchableAttributes.join(', ')
        : 'all configured searchable attributes'
    }`
  );

  if (anchor) {
    console.log(
      `CENTER: ${anchor.restaurant.name} | ` +
      `${anchor.restaurant.city}, ` +
      `${anchor.restaurant.state}`
    );
  } else {
    console.log('CENTER: none');
  }

  console.log(
    `MATCHING RECORDS: ${response.nbHits}`
  );

  console.log('==================================================');

  response.hits.forEach((hit, index) => {
    console.log(
      `${index + 1}. ${hit.name} | ` +
      `${hit.city}, ${hit.state} | ` +
      `name_match=${formatNameMatch(hit)} | ` +
      `distance=${formatDistance(hit)} | ` +
      `objectID=${hit.objectID}`
    );
  });
}

await runCase({
  label: 'PAPPAS WITHOUT GEO',
  query: 'Pappas',
});

await runCase({
  label: 'PAPPAS AROUND DALLAS',
  query: 'Pappas',
  anchor: anchors.dallas,
});

await runCase({
  label: 'PAPPAS AROUND HOUSTON',
  query: 'Pappas',
  anchor: anchors.houston,
});

/*
 * Deliberate conflict test:
 * Pampas Argentinas is geographically nearby but is not the
 * restaurant brand implied by the Pappas query.
 */
await runCase({
  label: 'PAPPAS AROUND NEW YORK — RELEVANCE RISK TEST',
  query: 'Pappas',
  anchor: anchors.newYork,
});

/*
 * Broad ambiguous known-item query.
 */
await runCase({
  label: 'TOWN WITHOUT GEO',
  query: 'Town',
});

await runCase({
  label: 'TOWN AROUND DALLAS',
  query: 'Town',
  anchor: anchors.dallas,
});

await runCase({
  label: 'TOWN AROUND DALLAS — RESTAURANT SCOPE ONLY',
  query: 'Town',
  anchor: anchors.dallas,
  restrictSearchableAttributes: [
    'name',
    'name_compact',
    'food_type',
  ],
});

/*
 * A sufficiently specific query should remain precise even
 * when the search center is far away.
 */
await runCase({
  label: 'TOWN CARBONDALE AROUND DALLAS',
  query: 'Town Carbondale',
  anchor: anchors.dallas,
});
