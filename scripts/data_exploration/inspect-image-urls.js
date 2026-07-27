import { CLEANED_RECORDS_PATH } from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';

const INPUT = CLEANED_RECORDS_PATH;

const CONCURRENCY = 10;
const TIMEOUT_MS = 10_000;

const restaurants = JSON.parse(
  await readFile(INPUT, 'utf8')
);

function isDefaultPlaceholder(url) {
  if (!url) return false;

  try {
    return (
      new URL(url).pathname ===
      '/legacy-cw/default2-original.png'
    );
  } catch {
    return false;
  }
}

async function checkImage(restaurant) {
  try {
    const response = await fetch(restaurant.image_url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Accept: 'image/*',
      },
    });

    // We only need headers + final redirect URL.
    // Don't download the complete image.
    await response.body?.cancel();

    return {
      objectID: restaurant.objectID,
      name: restaurant.name,
      source_url: restaurant.image_url,
      final_url: response.url,
      status: response.status,
      content_type: response.headers.get('content-type'),
      is_placeholder: isDefaultPlaceholder(response.url),
      error: null,
    };
  } catch (error) {
    return {
      objectID: restaurant.objectID,
      name: restaurant.name,
      source_url: restaurant.image_url,
      final_url: null,
      status: null,
      content_type: null,
      is_placeholder: false,
      error: error.name === 'TimeoutError'
        ? 'timeout'
        : error.message,
    };
  }
}

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

      results[index] = await checkImage(items[index]);

      completed += 1;

      // Progress is based on completed requests,
      // so we see output immediately.
      if (
        completed === 1 ||
        completed % 50 === 0 ||
        completed === items.length
      ) {
        console.log(
          `Checked ${completed}/${items.length}`
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

const results = await runWithConcurrency(
  restaurants,
  CONCURRENCY
);

const placeholder = results.filter(
  (result) => result.is_placeholder
);

const usable = results.filter(
  (result) =>
    !result.is_placeholder &&
    result.status >= 200 &&
    result.status < 400
);

const errors = results.filter(
  (result) =>
    result.error ||
    result.status === null ||
    result.status >= 400
);

const uniqueFinalUrls = new Map();

for (const result of results) {
  if (!result.final_url) continue;

  uniqueFinalUrls.set(
    result.final_url,
    (uniqueFinalUrls.get(result.final_url) ?? 0) + 1
  );
}

console.log('\nImage URL report');
console.log('----------------');
console.log(
  `Total restaurants: ${results.length}`
);
console.log(
  `Default placeholder: ${placeholder.length}`
);
console.log(
  `Potentially usable images: ${usable.length}`
);
console.log(
  `Errors / timeouts: ${errors.length}`
);
console.log(
  `Unique final URLs: ${uniqueFinalUrls.size}`
);

if (usable.length > 0) {
  console.log(
    '\nExamples of potentially usable images:'
  );

  console.dir(
    usable.slice(0, 10),
    { depth: null }
  );
}

if (errors.length > 0) {
  console.log('\nExamples of failures:');

  console.dir(
    errors.slice(0, 10),
    { depth: null }
  );
}

console.log('\nMost common final URLs:');

console.log(
  [...uniqueFinalUrls.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
);