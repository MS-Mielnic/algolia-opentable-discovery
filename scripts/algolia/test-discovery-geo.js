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
      `Could not find ${label} anchor record: ${objectID}`
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

const dallasAnchor = findAnchor(
  '1959',
  'Dallas'
);

const denverAnchor = findAnchor(
  '100009',
  'Denver'
);

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

async function runCase({
  label,
  query,
  anchor = null,
  aroundRadius = null,
}) {
  const geoParams = anchor
    ? {
        aroundLatLng: anchor.aroundLatLng,
        aroundRadius,
        getRankingInfo: true,
      }
    : {
        getRankingInfo: true,
      };

  const response = await client.searchSingleIndex({
    indexName: ALGOLIA_INDEX_NAME,
    searchParams: {
      query,
      hitsPerPage: 5,
      ...geoParams,

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
        '_geoloc',
      ],
    },
  });

  console.log('\n==================================================');
  console.log(label);
  console.log(`QUERY: "${query}"`);

  if (anchor) {
    console.log(
      `CENTER: ${anchor.restaurant.name} | ` +
      `${anchor.restaurant.city}, ${anchor.restaurant.state}`
    );

    console.log(
      `COORDINATES: ${anchor.aroundLatLng}`
    );

    console.log(
      `RADIUS: ${
        aroundRadius === 'all'
          ? 'all records'
          : `${aroundRadius / 1000} km`
      }`
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
      `${hit.food_type} | ` +
      `${hit.city}, ${hit.state} | ` +
      `distance=${formatDistance(hit)}`
    );
  });
}

/*
 * 1. Current text-only baseline.
 */
await runCase({
  label: 'TEXT SEARCH WITHOUT GEO',
  query: 'Italian',
});

/*
 * 2. Keep all Italian matches, but rank with Dallas proximity.
 */
await runCase({
  label: 'ITALIAN RANKED AROUND DALLAS',
  query: 'Italian',
  anchor: dallasAnchor,
  aroundRadius: 'all',
});

/*
 * 3. Restrict Italian results to 25 km around Dallas.
 */
await runCase({
  label: 'ITALIAN WITHIN 25 KM OF DALLAS',
  query: 'Italian',
  anchor: dallasAnchor,
  aroundRadius: 25_000,
});

/*
 * 4. Empty-query browsing near Denver.
 */
await runCase({
  label: 'EMPTY-QUERY BROWSING WITHIN 10 KM OF DENVER',
  query: '',
  anchor: denverAnchor,
  aroundRadius: 10_000,
});
