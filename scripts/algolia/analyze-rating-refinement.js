import { readFile } from 'node:fs/promises';

import {
  CLEANED_RECORDS_PATH,
} from '../lib/project-paths.js';

const restaurants = JSON.parse(
  await readFile(CLEANED_RECORDS_PATH, 'utf8')
);

if (!Array.isArray(restaurants) || restaurants.length === 0) {
  throw new Error(
    'Cleaned dataset must contain a non-empty array'
  );
}

for (const restaurant of restaurants) {
  if (
    !Number.isFinite(restaurant.stars_count) ||
    restaurant.stars_count < 1 ||
    restaurant.stars_count > 5 ||
    !Number.isFinite(restaurant.reviews_count) ||
    restaurant.reviews_count < 0
  ) {
    throw new Error(
      `Restaurant ${restaurant.objectID ?? '<missing>'} ` +
      'has invalid rating or review-count data'
    );
  }
}

const thresholds = [
  4.0,
  4.2,
  4.4,
  4.5,
  4.6,
  4.7,
  4.8,
];

const segments = [
  {
    label: 'All restaurants',
    records: restaurants,
  },
  {
    label: 'Italian',
    records: restaurants.filter(
      (restaurant) =>
        restaurant.food_type === 'Italian'
    ),
  },
  {
    label: 'Steakhouse',
    records: restaurants.filter(
      (restaurant) =>
        restaurant.food_type === 'Steakhouse'
    ),
  },
  {
    label: 'Fine Dining',
    records: restaurants.filter(
      (restaurant) =>
        restaurant.dining_style === 'Fine Dining'
    ),
  },
];

function percentage(count, total) {
  return (
    `${((count / total) * 100).toFixed(1)}%`
  );
}

console.log('RATING REFINEMENT ANALYSIS');
console.log('--------------------------------');
console.log(`Records: ${restaurants.length}`);

console.log('\n==================================================');
console.log('OVERALL THRESHOLD COVERAGE');
console.log('==================================================');

for (const threshold of thresholds) {
  const matching = restaurants.filter(
    (restaurant) =>
      restaurant.stars_count >= threshold
  );

  const atLeast100Reviews = matching.filter(
    (restaurant) =>
      restaurant.reviews_count >= 100
  ).length;

  const atLeast500Reviews = matching.filter(
    (restaurant) =>
      restaurant.reviews_count >= 500
  ).length;

  console.log(
    `${threshold.toFixed(1)}+ stars: ` +
    `${matching.length} ` +
    `(${percentage(matching.length, restaurants.length)}) | ` +
    `100+ reviews: ${atLeast100Reviews} | ` +
    `500+ reviews: ${atLeast500Reviews}`
  );
}

console.log('\n==================================================');
console.log('THRESHOLD COVERAGE BY DISCOVERY SEGMENT');
console.log('==================================================');

for (const segment of segments) {
  console.log(
    `\n${segment.label}: ${segment.records.length}`
  );

  for (const threshold of thresholds) {
    const count = segment.records.filter(
      (restaurant) =>
        restaurant.stars_count >= threshold
    ).length;

    console.log(
      `  ${threshold.toFixed(1)}+ stars: ` +
      `${count} ` +
      `(${percentage(count, segment.records.length)})`
    );
  }
}
