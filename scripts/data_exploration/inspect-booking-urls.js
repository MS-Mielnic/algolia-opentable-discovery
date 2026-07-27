import { CLEANED_RECORDS_PATH } from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';

const INPUT = CLEANED_RECORDS_PATH;

const SAMPLE_SIZE = 100;
const CONCURRENCY = 10;
const TIMEOUT_MS = 10_000;

const restaurants = JSON.parse(
  await readFile(INPUT, 'utf8')
);

if (!Array.isArray(restaurants) || restaurants.length === 0) {
  throw new Error('Cleaned restaurant dataset is empty or invalid.');
}

/*
 * Select restaurants evenly across the full dataset rather than
 * simply taking the first 100 records.
 */
const sample = Array.from(
  { length: Math.min(SAMPLE_SIZE, restaurants.length) },
  (_, index) => {
    const denominator = Math.max(
      Math.min(SAMPLE_SIZE, restaurants.length) - 1,
      1
    );

    const restaurantIndex = Math.floor(
      (index * (restaurants.length - 1)) / denominator
    );

    return restaurants[restaurantIndex];
  }
);

console.log(
  `Testing ${sample.length} restaurants sampled across ` +
  `${restaurants.length} total records`
);

/*
 * Follow a booking URL and capture the final destination.
 *
 * We cancel the response body because we only need status and
 * redirect information, not the full HTML page.
 */
async function checkUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    await response.body?.cancel();

    let hostname = null;

    try {
      hostname = new URL(response.url).hostname;
    } catch {
      // Keep hostname null if the final URL can't be parsed.
    }

    return {
      source_url: url,
      final_url: response.url,
      status: response.status,
      hostname,
      error: null,
    };
  } catch (error) {
    return {
      source_url: url,
      final_url: null,
      status: null,
      hostname: null,
      error:
        error.name === 'TimeoutError'
          ? 'timeout'
          : error.message,
    };
  }
}

/*
 * Check desktop and mobile booking URLs for one restaurant.
 */
async function checkRestaurant(restaurant) {
  const [reserve, mobile] = await Promise.all([
    checkUrl(restaurant.reserve_url),
    checkUrl(restaurant.mobile_reserve_url),
  ]);

  return {
    objectID: restaurant.objectID,
    name: restaurant.name,
    reserve,
    mobile,

    same_final_url:
      reserve.final_url !== null &&
      mobile.final_url !== null &&
      reserve.final_url === mobile.final_url,
  };
}

/*
 * Run a limited number of restaurants concurrently so we don't
 * overload the remote service.
 */
async function runWithConcurrency(items, limit) {
  const results = new Array(items.length);

  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) {
        return;
      }

      results[index] = await checkRestaurant(items[index]);

      completed += 1;

      if (
        completed === 1 ||
        completed % 10 === 0 ||
        completed === items.length
      ) {
        console.log(
          `Checked ${completed}/${items.length} restaurants`
        );
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(limit, items.length),
      },
      () => worker()
    )
  );

  return results;
}

function isSuccessful(result) {
  return (
    result.error === null &&
    result.status !== null &&
    result.status >= 200 &&
    result.status < 400
  );
}

function countHosts(results, type) {
  const counts = new Map();

  for (const result of results) {
    const hostname = result[type].hostname;

    if (!hostname) {
      continue;
    }

    counts.set(
      hostname,
      (counts.get(hostname) ?? 0) + 1
    );
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1]);
}

const results = await runWithConcurrency(
  sample,
  CONCURRENCY
);

const reserveSuccessful = results.filter(
  (result) => isSuccessful(result.reserve)
);

const reserveFailed = results.filter(
  (result) => !isSuccessful(result.reserve)
);

const mobileSuccessful = results.filter(
  (result) => isSuccessful(result.mobile)
);

const mobileFailed = results.filter(
  (result) => !isSuccessful(result.mobile)
);

const sameFinalUrl = results.filter(
  (result) =>
    isSuccessful(result.reserve) &&
    isSuccessful(result.mobile) &&
    result.same_final_url
);

const differentFinalUrl = results.filter(
  (result) =>
    isSuccessful(result.reserve) &&
    isSuccessful(result.mobile) &&
    !result.same_final_url
);

console.log('\nBooking URL report');
console.log('------------------');

console.log(
  `Sampled restaurants: ${results.length}`
);

console.log('\nreserve_url');
console.log(
  `Successful: ${reserveSuccessful.length}`
);
console.log(
  `Failed / timeout: ${reserveFailed.length}`
);

console.log('\nmobile_reserve_url');
console.log(
  `Successful: ${mobileSuccessful.length}`
);
console.log(
  `Failed / timeout: ${mobileFailed.length}`
);

console.log('\nDestination comparison');
console.log(
  `Same final URL: ${sameFinalUrl.length}`
);
console.log(
  `Different final URLs: ${differentFinalUrl.length}`
);

console.log('\nreserve_url final hosts:');
console.log(
  countHosts(results, 'reserve')
);

console.log('\nmobile_reserve_url final hosts:');
console.log(
  countHosts(results, 'mobile')
);

if (reserveFailed.length > 0) {
  console.log(
    '\nExamples of reserve_url failures:'
  );

  console.dir(
    reserveFailed.slice(0, 10).map(
      (result) => ({
        objectID: result.objectID,
        name: result.name,
        source_url: result.reserve.source_url,
        status: result.reserve.status,
        error: result.reserve.error,
      })
    ),
    { depth: null }
  );
}

if (mobileFailed.length > 0) {
  console.log(
    '\nExamples of mobile_reserve_url failures:'
  );

  console.dir(
    mobileFailed.slice(0, 10).map(
      (result) => ({
        objectID: result.objectID,
        name: result.name,
        source_url: result.mobile.source_url,
        status: result.mobile.status,
        error: result.mobile.error,
      })
    ),
    { depth: null }
  );
}

if (differentFinalUrl.length > 0) {
  console.log(
    '\nExamples where desktop/mobile resolve differently:'
  );

  console.dir(
    differentFinalUrl.slice(0, 10).map(
      (result) => ({
        objectID: result.objectID,
        name: result.name,
        reserve_final: result.reserve.final_url,
        mobile_final: result.mobile.final_url,
      })
    ),
    { depth: null }
  );
}