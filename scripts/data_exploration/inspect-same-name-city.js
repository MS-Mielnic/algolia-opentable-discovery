import { readFile } from 'node:fs/promises';

import {
  CLEANED_RECORDS_PATH,
} from '../lib/project-paths.js';

const restaurants = JSON.parse(
  await readFile(CLEANED_RECORDS_PATH, 'utf8')
);

const groups = new Map();

for (const restaurant of restaurants) {
  const key = [
    restaurant.name,
    restaurant.city,
    restaurant.state,
  ].join('|||');

  if (!groups.has(key)) {
    groups.set(key, []);
  }

  groups.get(key).push(restaurant);
}

const repeatedSameCity = [...groups.values()]
  .filter((group) => group.length > 1)
  .sort((a, b) => {
    const nameCompare = a[0].name.localeCompare(b[0].name);

    if (nameCompare !== 0) {
      return nameCompare;
    }

    return a[0].city.localeCompare(b[0].city);
  });

console.log(
  `Repeated name + city groups: ${repeatedSameCity.length}`
);

for (const group of repeatedSameCity) {
  const first = group[0];

  console.log(
    `\n${first.name} | ${first.city}, ${first.state} | ` +
    `${group.length} locations`
  );

  for (const restaurant of group) {
    console.log(
      `  - ${restaurant.address} | ` +
      `${restaurant.neighborhood} | ` +
      `objectID=${restaurant.objectID}`
    );
  }
}
