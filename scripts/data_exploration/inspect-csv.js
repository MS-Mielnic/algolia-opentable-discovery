import { RESTAURANTS_CSV_PATH } from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

const fileContents = await readFile(
  RESTAURANTS_CSV_PATH,
  'utf8'
);

const restaurantsInfo = parse(fileContents, {
  columns: true,
  delimiter: ';',
  skip_empty_lines: true,
});

console.log('Number of records:', restaurantsInfo.length);

console.log('\nFirst record:');
console.log(restaurantsInfo[0]);

console.log('\nAvailable fields:');
console.log(Object.keys(restaurantsInfo[0]));

// is objetcID unique in this file?
const objectIDs = restaurantsInfo.map(
  (restaurant) => restaurant.objectID
);

const uniqueObjectIDs = new Set(objectIDs);

console.log('\nObjectID check:');
console.log('Total objectIDs:', objectIDs.length);
console.log('Unique objectIDs:', uniqueObjectIDs.size);
console.log(
  'Duplicate objectIDs:',
  objectIDs.length - uniqueObjectIDs.size
);
//checking missing values
const fields = Object.keys(restaurantsInfo[0]);

console.log('\nMissing values by field:');

for (const field of fields) {
  const missingCount = restaurantsInfo.filter((restaurant) => {
    const value = restaurant[field];

    return (
      value === null ||
      value === undefined ||
      value.trim() === ''
    );
  }).length;

  console.log(field, missingCount);
}
//convert to numeric values ratings and stars -verify conversion not NaN- Validation of correct range

const ratings = restaurantsInfo.map(
  (restaurant) => Number(restaurant.stars_count)
);

const reviewCounts = restaurantsInfo.map(
  (restaurant) => Number(restaurant.reviews_count)
);

const invalidRatings = ratings.filter(
  (rating) => Number.isNaN(rating)
);

const invalidReviewCounts = reviewCounts.filter(
  (count) => Number.isNaN(count)
);

console.log('\nNumeric field check:');

console.log('Invalid ratings:', invalidRatings.length);
console.log('Minimum rating:', Math.min(...ratings));
console.log('Maximum rating:', Math.max(...ratings));

console.log('Invalid review counts:', invalidReviewCounts.length);
console.log('Minimum review count:', Math.min(...reviewCounts));
console.log('Maximum review count:', Math.max(...reviewCounts));

//inspect categorical columns
const categoricalFields = [
  'food_type',
  'neighborhood',
  'price_range',
  'dining_style',
];

console.log('\nUnique values by categorical field:');

for (const field of categoricalFields) {
  const values = restaurantsInfo.map(
    (restaurant) => restaurant[field]
  );

  const uniqueValues = new Set(values);

  console.log(field, uniqueValues.size);
}

const priceRanges = [
  ...new Set(
    restaurantsInfo.map((restaurant) => restaurant.price_range)
  ),
].sort();

const diningStyles = [
  ...new Set(
    restaurantsInfo.map((restaurant) => restaurant.dining_style)
  ),
].sort();

console.log('\nPrice ranges:');
console.log(priceRanges);

console.log('\nDining styles:');
console.log(diningStyles);

//Count restaurants by cusine
function countValues(records, field) {
  const counts = new Map();

  for (const record of records) {
    const value = record[field];
    const currentCount = counts.get(value) ?? 0;

    counts.set(value, currentCount + 1);
  }

  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1]
  );
}

const foodTypeCounts = countValues(
  restaurantsInfo,
  'food_type'
);

console.log('\nTop 20 food types:');
console.log(foodTypeCounts.slice(0, 20));

const singleRestaurantFoodTypes = foodTypeCounts.filter(
  ([foodType, count]) => count === 1
);

console.log(
  '\nFood types represented by only one restaurant:',
  singleRestaurantFoodTypes.length
);

console.log(
  'Examples:',
  singleRestaurantFoodTypes.slice(0, 10)
);
//cusine values for case/whitespace dupliates

const normalizedFoodTypes = restaurantsInfo.map(
  (restaurant) => restaurant.food_type.trim().toLowerCase()
);

const uniqueNormalizedFoodTypes = new Set(normalizedFoodTypes);

console.log('\nCuisine normalization check:');
console.log('Original unique food types:', foodTypeCounts.length);
console.log(
  'Unique after trim + lowercase:',
  uniqueNormalizedFoodTypes.size
);
// understand the review count distribution
const sortedReviewCounts = restaurantsInfo
  .map((restaurant) => Number(restaurant.reviews_count))
  .sort((a, b) => a - b);

function percentile(values, p) {
  const index = Math.floor(
    (values.length - 1) * p
  );

  return values[index];
}

console.log('\nReview count distribution:');

console.log('P25:', percentile(sortedReviewCounts, 0.25));
console.log('P50:', percentile(sortedReviewCounts, 0.50));
console.log('P75:', percentile(sortedReviewCounts, 0.75));
console.log('P90:', percentile(sortedReviewCounts, 0.90));
console.log('P95:', percentile(sortedReviewCounts, 0.95));
console.log('P99:', percentile(sortedReviewCounts, 0.99));
console.log('Max:', sortedReviewCounts.at(-1));

// profile rating distribution
const ratingCounts = new Map();

for (const restaurant of restaurantsInfo) {
  const rating = Number(restaurant.stars_count);

  const currentCount = ratingCounts.get(rating) ?? 0;

  ratingCounts.set(rating, currentCount + 1);
}

const sortedRatingCounts = [...ratingCounts.entries()]
  .sort((a, b) => a[0] - b[0]);

console.log('\nRating distribution:');
console.log(sortedRatingCounts);

console.log(
  'Unique rating values:',
  sortedRatingCounts.length
);
// a visual
const maxRatingCount = Math.max(
  ...sortedRatingCounts.map(([, count]) => count)
);

console.log('\nRating histogram:\n');

for (const [rating, count] of sortedRatingCounts) {
  const barLength = Math.round(
    (count / maxRatingCount) * 40
  );

  const bar = '█'.repeat(barLength);

  console.log(
    `${rating.toFixed(1).padStart(3)} | ${bar} ${count}`
  );
}
//inspect higher reviewed restaurants
const highestRatedRestaurants = restaurantsInfo
  .filter(
    (restaurant) => Number(restaurant.stars_count) >= 4.9
  )
  .map((restaurant) => ({
    objectID: restaurant.objectID,
    rating: Number(restaurant.stars_count),
    reviews: Number(restaurant.reviews_count),
    foodType: restaurant.food_type,
  }))
  .sort((a, b) => a.reviews - b.reviews);

console.log('\nRestaurants rated 4.9 or 5.0:');

console.log(highestRatedRestaurants);

//5.0 restaurants with very few reviews.
const fiveStarRestaurants = restaurantsInfo.filter(
  (restaurant) => Number(restaurant.stars_count) === 5
);

const fiveStarReviewBuckets = {
  '1-10': 0,
  '11-50': 0,
  '51-100': 0,
  '101-500': 0,
  '500+': 0,
};

for (const restaurant of fiveStarRestaurants) {
  const reviews = Number(restaurant.reviews_count);

  if (reviews <= 10) {
    fiveStarReviewBuckets['1-10'] += 1;
  } else if (reviews <= 50) {
    fiveStarReviewBuckets['11-50'] += 1;
  } else if (reviews <= 100) {
    fiveStarReviewBuckets['51-100'] += 1;
  } else if (reviews <= 500) {
    fiveStarReviewBuckets['101-500'] += 1;
  } else {
    fiveStarReviewBuckets['500+'] += 1;
  }
}

console.log('\n5-star restaurants by review count:');
console.table(fiveStarReviewBuckets);

//Check whether the CSV categorical fields have basic formatting duplicates
function checkBasicNormalization(records, field) {
  const originalValues = new Set(
    records.map((record) => record[field])
  );

  const normalizedValues = new Set(
    records.map(
      (record) => record[field].trim().toLowerCase()
    )
  );

  console.log(
    field,
    'original:',
    originalValues.size,
    'normalized:',
    normalizedValues.size
  );
}

console.log('\nBasic categorical normalization:');

checkBasicNormalization(
  restaurantsInfo,
  'food_type'
);

checkBasicNormalization(
  restaurantsInfo,
  'neighborhood'
);

checkBasicNormalization(
  restaurantsInfo,
  'price_range'
);

checkBasicNormalization(
  restaurantsInfo,
  'dining_style'
);

//pretty print distributions
const priceRangeCounts = countValues(
  restaurantsInfo,
  'price_range'
);

const diningStyleCounts = countValues(
  restaurantsInfo,
  'dining_style'
);

console.log('\nPrice range distribution:');

console.table(
  priceRangeCounts.map(([priceRange, count]) => ({
    priceRange,
    count,
  }))
);

console.log('\nDining style distribution:');

console.table(
  diningStyleCounts.map(([diningStyle, count]) => ({
    diningStyle,
    count,
  }))
);
//Cross-tab price range vs. dining style
const priceDiningCounts = {};

for (const restaurant of restaurantsInfo) {
  const priceRange = restaurant.price_range;
  const diningStyle = restaurant.dining_style;

  if (!priceDiningCounts[diningStyle]) {
    priceDiningCounts[diningStyle] = {};
  }

  if (!priceDiningCounts[diningStyle][priceRange]) {
    priceDiningCounts[diningStyle][priceRange] = 0;
  }

  priceDiningCounts[diningStyle][priceRange] += 1;
}

const priceDiningTable = Object.entries(
  priceDiningCounts
).map(([diningStyle, prices]) => ({
  diningStyle,
  '$30 and under': prices['$30 and under'] ?? 0,
  '$31 to $50': prices['$31 to $50'] ?? 0,
  '$50 and over': prices['$50 and over'] ?? 0,
}));

console.log('\nDining style by price range:');

console.table(priceDiningTable);
//showing percentages
const priceDiningPercentTable = Object.entries(
  priceDiningCounts
).map(([diningStyle, prices]) => {
  const total = Object.values(prices).reduce(
    (sum, count) => sum + count,
    0
  );

  return {
    diningStyle,
    '$30 and under': (
      ((prices['$30 and under'] ?? 0) / total) * 100
    ).toFixed(1) + '%',

    '$31 to $50': (
      ((prices['$31 to $50'] ?? 0) / total) * 100
    ).toFixed(1) + '%',

    '$50 and over': (
      ((prices['$50 and over'] ?? 0) / total) * 100
    ).toFixed(1) + '%',
  };
});

console.log('\nDining style by price range (% within style):');

console.table(priceDiningPercentTable);