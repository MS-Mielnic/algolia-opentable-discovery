import { CLEANED_RECORDS_PATH } from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';

const INPUT = CLEANED_RECORDS_PATH;

const restaurants = JSON.parse(
  await readFile(INPUT, 'utf8')
);

const cashOnlyRestaurants = restaurants.filter(
  (restaurant) =>
    restaurant.payment_options.includes('Cash Only')
);

const cashOnlyExclusive = cashOnlyRestaurants.filter(
  (restaurant) =>
    restaurant.payment_options.length === 1
);

const cashOnlyWithOthers = cashOnlyRestaurants.filter(
  (restaurant) =>
    restaurant.payment_options.length > 1
);

console.log(
  'Restaurants with Cash Only:',
  cashOnlyRestaurants.length
);

console.log(
  'Cash Only as the only payment option:',
  cashOnlyExclusive.length
);

console.log(
  'Cash Only combined with other payment options:',
  cashOnlyWithOthers.length
);

if (cashOnlyWithOthers.length > 0) {
  console.log('\nExamples of Cash Only with other options:');

  for (const restaurant of cashOnlyWithOthers.slice(0, 10)) {
    console.log({
      objectID: restaurant.objectID,
      name: restaurant.name,
      payment_options: restaurant.payment_options,
    });
  }
}