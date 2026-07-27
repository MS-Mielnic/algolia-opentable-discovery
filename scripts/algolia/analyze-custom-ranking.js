import { readFile } from 'node:fs/promises';

import {
  CLEANED_RECORDS_PATH,
} from '../lib/project-paths.js';

const restaurants = JSON.parse(
  await readFile(CLEANED_RECORDS_PATH, 'utf8')
);

const validRestaurants = restaurants.filter((restaurant) => {
  return (
    Number.isFinite(restaurant.stars_count) &&
    Number.isFinite(restaurant.reviews_count) &&
    restaurant.reviews_count >= 0
  );
});

if (validRestaurants.length !== restaurants.length) {
  throw new Error(
    `Expected ${restaurants.length} valid ranking records, ` +
    `found ${validRestaurants.length}`
  );
}

function mean(values) {
  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

function percentile(sortedValues, probability) {
  if (sortedValues.length === 0) {
    throw new Error('Cannot calculate an empty percentile');
  }

  const position =
    (sortedValues.length - 1) * probability;

  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const weight = position - lowerIndex;

  return (
    sortedValues[lowerIndex] * (1 - weight) +
    sortedValues[upperIndex] * weight
  );
}

/*
 * Bayesian weighted rating:
 *
 * v = restaurant review count
 * R = restaurant average rating
 * m = minimum-review confidence threshold
 * C = dataset-wide average restaurant rating
 *
 * score =
 *   (v / (v + m)) * R +
 *   (m / (v + m)) * C
 */
function bayesianScore({
  rating,
  reviews,
  threshold,
  globalMean,
}) {
  return (
    (reviews / (reviews + threshold)) * rating +
    (threshold / (reviews + threshold)) * globalMean
  );
}

const ratings = validRestaurants.map(
  (restaurant) => restaurant.stars_count
);

const sortedReviewCounts = validRestaurants
  .map((restaurant) => restaurant.reviews_count)
  .sort((a, b) => a - b);

const globalMeanRating = mean(ratings);

const reviewPercentiles = {
  p25: percentile(sortedReviewCounts, 0.25),
  p50: percentile(sortedReviewCounts, 0.50),
  p75: percentile(sortedReviewCounts, 0.75),
  p90: percentile(sortedReviewCounts, 0.90),
};

const candidates = validRestaurants.map((restaurant) => {
  return {
    ...restaurant,

    bayesianLowerQuartile: bayesianScore({
      rating: restaurant.stars_count,
      reviews: restaurant.reviews_count,
      threshold: reviewPercentiles.p25,
      globalMean: globalMeanRating,
    }),

    bayesianMedian: bayesianScore({
      rating: restaurant.stars_count,
      reviews: restaurant.reviews_count,
      threshold: reviewPercentiles.p50,
      globalMean: globalMeanRating,
    }),

    bayesianUpperQuartile: bayesianScore({
      rating: restaurant.stars_count,
      reviews: restaurant.reviews_count,
      threshold: reviewPercentiles.p75,
      globalMean: globalMeanRating,
    }),
  };
});

function compareNames(a, b) {
  return a.name.localeCompare(b.name);
}

function showRanking(label, rankedRestaurants) {
  console.log('\n==================================================');
  console.log(label);
  console.log('==================================================');

  rankedRestaurants
    .slice(0, 10)
    .forEach((restaurant, index) => {
      console.log(
        `${index + 1}. ${restaurant.name} | ` +
        `${restaurant.food_type} | ` +
        `${restaurant.city}, ${restaurant.state} | ` +
        `${restaurant.stars_count} stars | ` +
        `${restaurant.reviews_count} reviews | ` +
        `Bayesian p25=${
          restaurant.bayesianLowerQuartile.toFixed(4)
        } | ` +
        `Bayesian p50=${restaurant.bayesianMedian.toFixed(4)} | ` +
        `Bayesian p75=${
          restaurant.bayesianUpperQuartile.toFixed(4)
        } | ` +
        `objectID=${restaurant.objectID}`
      );
    });
}

console.log('CUSTOM-RANKING SIGNAL ANALYSIS');
console.log('--------------------------------');
console.log(`Records: ${validRestaurants.length}`);
console.log(
  `Global mean rating: ${globalMeanRating.toFixed(4)}`
);

console.log('\nReview-count distribution:');
console.log(`  p25: ${reviewPercentiles.p25.toFixed(1)}`);
console.log(`  p50: ${reviewPercentiles.p50.toFixed(1)}`);
console.log(`  p75: ${reviewPercentiles.p75.toFixed(1)}`);
console.log(`  p90: ${reviewPercentiles.p90.toFixed(1)}`);

showRanking(
  'RAW RATING — REVIEWS AS TIE-BREAKER',
  [...candidates].sort((a, b) => {
    return (
      b.stars_count - a.stars_count ||
      b.reviews_count - a.reviews_count ||
      compareNames(a, b)
    );
  })
);

showRanking(
  'RAW REVIEW COUNT — RATING AS TIE-BREAKER',
  [...candidates].sort((a, b) => {
    return (
      b.reviews_count - a.reviews_count ||
      b.stars_count - a.stars_count ||
      compareNames(a, b)
    );
  })
);

showRanking(
  'BAYESIAN RATING — 25TH-PERCENTILE THRESHOLD',
  [...candidates].sort((a, b) => {
    return (
      b.bayesianLowerQuartile -
        a.bayesianLowerQuartile ||
      b.reviews_count - a.reviews_count ||
      compareNames(a, b)
    );
  })
);

showRanking(
  'BAYESIAN RATING — MEDIAN REVIEW THRESHOLD',
  [...candidates].sort((a, b) => {
    return (
      b.bayesianMedian - a.bayesianMedian ||
      b.reviews_count - a.reviews_count ||
      compareNames(a, b)
    );
  })
);

showRanking(
  'BAYESIAN RATING — 75TH-PERCENTILE THRESHOLD',
  [...candidates].sort((a, b) => {
    return (
      b.bayesianUpperQuartile -
        a.bayesianUpperQuartile ||
      b.reviews_count - a.reviews_count ||
      compareNames(a, b)
    );
  })
);
