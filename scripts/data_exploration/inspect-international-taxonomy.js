import {
  RESTAURANTS_JSON_PATH,
  RESTAURANTS_CSV_PATH,
} from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

/*
 * Investigate whether:
 *
 *   "Global, International"
 *   "International"
 *
 * represent the same user-facing cuisine category or two meaningfully
 * different source taxonomy values.
 *
 * This script is diagnostic only.
 * It does NOT modify the source data or cleaning pipeline.
 */

const jsonContents = await readFile(
  RESTAURANTS_JSON_PATH,
  'utf8'
);

const csvContents = await readFile(
  RESTAURANTS_CSV_PATH,
  'utf8'
);

const restaurants = JSON.parse(jsonContents);

const restaurantsInfo = parse(csvContents, {
  columns: true,
  delimiter: ';',
  skip_empty_lines: true,
});

const restaurantByID = new Map(
  restaurants.map((restaurant) => [
    String(restaurant.objectID),
    restaurant,
  ])
);

const TARGET_TYPES = new Set([
  'Global, International',
  'International',
]);

const records = restaurantsInfo
  .filter((info) => TARGET_TYPES.has(info.food_type))
  .map((info) => {
    const restaurant = restaurantByID.get(
      String(info.objectID)
    );

    if (!restaurant) {
      throw new Error(
        `Missing restaurant for objectID ${info.objectID}`
      );
    }

    return {
      objectID: String(info.objectID),
      name: restaurant.name,
      city: restaurant.city,
      state: restaurant.state,
      price: restaurant.price,

      food_type: info.food_type,
      price_range: info.price_range,
      dining_style: info.dining_style,

      stars_count: Number(info.stars_count),
      reviews_count: Number(info.reviews_count),
    };
  });

const globalInternational = records.filter(
  (record) =>
    record.food_type === 'Global, International'
);

const international = records.filter(
  (record) =>
    record.food_type === 'International'
);


function countValues(recordsToCount, field) {
  const counts = new Map();

  for (const record of recordsToCount) {
    const value = record[field];

    counts.set(
      value,
      (counts.get(value) ?? 0) + 1
    );
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1]);
}


function printDistribution(label, recordsToPrint, field) {
  console.log(`\n${label} — ${field}`);

  for (
    const [value, count]
    of countValues(recordsToPrint, field)
  ) {
    const percentage =
      ((count / recordsToPrint.length) * 100).toFixed(1);

    console.log(
      `  ${value}: ${count} (${percentage}%)`
    );
  }
}


function printSamples(label, recordsToPrint, limit = 25) {
  console.log(`\n${label} — sample restaurants`);

  recordsToPrint
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit)
    .forEach((record) => {
      console.log(
        `  ${record.name} | ` +
        `${record.city}, ${record.state} | ` +
        `${record.price_range} | ` +
        `${record.dining_style}`
      );
    });
}


function summarizeRatings(label, recordsToSummarize) {
  const ratings = recordsToSummarize.map(
    (record) => record.stars_count
  );

  const reviews = recordsToSummarize.map(
    (record) => record.reviews_count
  );

  const averageRating =
    ratings.reduce((sum, value) => sum + value, 0) /
    ratings.length;

  const averageReviews =
    reviews.reduce((sum, value) => sum + value, 0) /
    reviews.length;

  console.log(`\n${label} — quality/popularity summary`);

  console.log(
    '  Average rating:',
    averageRating.toFixed(2)
  );

  console.log(
    '  Average review count:',
    averageReviews.toFixed(1)
  );
}


console.log('International taxonomy investigation');

console.log('\nRecord counts:');
console.log(
  'Global, International:',
  globalInternational.length
);
console.log(
  'International:',
  international.length
);
console.log(
  'Combined:',
  records.length
);


/*
 * Compare descriptive characteristics.
 */

printDistribution(
  'Global, International',
  globalInternational,
  'price_range'
);

printDistribution(
  'International',
  international,
  'price_range'
);

printDistribution(
  'Global, International',
  globalInternational,
  'dining_style'
);

printDistribution(
  'International',
  international,
  'dining_style'
);


/*
 * Rating/review data is not proof of taxonomy equivalence,
 * but large differences could suggest that the categories describe
 * different restaurant populations.
 */

summarizeRatings(
  'Global, International',
  globalInternational
);

summarizeRatings(
  'International',
  international
);


/*
 * Concrete restaurant examples are the most important evidence.
 */

printSamples(
  'Global, International',
  globalInternational
);

printSamples(
  'International',
  international
);