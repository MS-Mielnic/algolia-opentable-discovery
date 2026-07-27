import {
  RESTAURANTS_JSON_PATH,
  RESTAURANTS_CSV_PATH,
} from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';


/*
 * Investigate whether the source food_type values:
 *
 *   "Steak"
 *   "Steakhouse"
 *
 * represent genuinely different restaurant categories or whether they
 * are two labels for substantially the same user-facing cuisine intent.
 *
 * IMPORTANT:
 * This script does NOT clean or modify anything.
 * It only produces evidence for a later normalization decision.
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


/*
 * Build the restaurant lookup so we can combine food_type with
 * restaurant name, city, price, and other descriptive fields.
 */

const restaurantByID = new Map(
  restaurants.map((restaurant) => [
    String(restaurant.objectID),
    restaurant,
  ])
);


const steakRecords = restaurantsInfo
  .filter(
    (info) =>
      info.food_type === 'Steak' ||
      info.food_type === 'Steakhouse'
  )
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


const steak = steakRecords.filter(
  (record) => record.food_type === 'Steak'
);

const steakhouse = steakRecords.filter(
  (record) => record.food_type === 'Steakhouse'
);


/*
 * Generic distribution helper.
 *
 * This lets us compare whether the two source categories have noticeably
 * different price or dining-style profiles.
 */

function countValues(records, field) {
  const counts = new Map();

  for (const record of records) {
    const value = record[field];

    counts.set(
      value,
      (counts.get(value) ?? 0) + 1
    );
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1]);
}


function printDistribution(label, records, field) {
  console.log(`\n${label} — ${field}`);

  for (const [value, count] of countValues(records, field)) {
    const percentage =
      ((count / records.length) * 100).toFixed(1);

    console.log(
      `  ${value}: ${count} (${percentage}%)`
    );
  }
}


/*
 * Restaurant-name evidence
 *
 * A source category may be called "Steak" while the actual restaurant
 * identifies itself as a steakhouse.
 *
 * We therefore inspect the names instead of relying only on the taxonomy
 * label.
 */

function analyzeNameLanguage(records) {
  const containsSteakhouse = records.filter(
    (record) =>
      /\bsteak\s*house\b|\bsteakhouse\b/i.test(record.name)
  );

  const containsSteak = records.filter(
    (record) =>
      /\bsteak\b/i.test(record.name)
  );

  return {
    containsSteakhouse,
    containsSteak,
  };
}


function printNameAnalysis(label, records) {
  const analysis = analyzeNameLanguage(records);

  console.log(`\n${label} — restaurant-name evidence`);

  console.log(
    `  Names containing "steakhouse/steak house": ` +
    `${analysis.containsSteakhouse.length} / ${records.length}`
  );

  console.log(
    `  Names containing "steak": ` +
    `${analysis.containsSteak.length} / ${records.length}`
  );
}


/*
 * Print representative samples.
 *
 * The goal is to inspect whether the businesses in the two groups
 * appear qualitatively different.
 */

function printSamples(label, records, limit = 20) {
  console.log(`\n${label} — sample restaurants`);

  records
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


/*
 * Summary
 */

console.log('Steak taxonomy investigation');

console.log('\nRecord counts:');
console.log('Steak:', steak.length);
console.log('Steakhouse:', steakhouse.length);
console.log('Combined:', steakRecords.length);


/*
 * Compare user-facing characteristics.
 */

printDistribution(
  'Steak',
  steak,
  'price_range'
);

printDistribution(
  'Steakhouse',
  steakhouse,
  'price_range'
);

printDistribution(
  'Steak',
  steak,
  'dining_style'
);

printDistribution(
  'Steakhouse',
  steakhouse,
  'dining_style'
);


/*
 * Check restaurant naming language.
 */

printNameAnalysis(
  'Steak',
  steak
);

printNameAnalysis(
  'Steakhouse',
  steakhouse
);


/*
 * Show concrete examples from each category.
 */

printSamples(
  'Steak',
  steak
);

printSamples(
  'Steakhouse',
  steakhouse
);
