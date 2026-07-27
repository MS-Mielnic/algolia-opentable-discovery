import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

import {
  RESTAURANTS_JSON_PATH,
  RESTAURANTS_CSV_PATH,
  GENERATED_DIR,
  CLEANED_RECORDS_PATH,
} from './lib/project-paths.js';


/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const JSON_SOURCE =
  RESTAURANTS_JSON_PATH;

const CSV_SOURCE =
  RESTAURANTS_CSV_PATH;

const OUTPUT_DIR =
  GENERATED_DIR;

const CLEANED_OUTPUT =
  CLEANED_RECORDS_PATH;


/*
 * ============================================================
 * CLEANING RULES
 * ============================================================
 *
 * Rules are intentionally explicit and limited to issues supported
 * by profiling. Ambiguous source values are preserved rather than guessed.
 */


/*
 * City casing
 *
 * Profiling found five case-only inconsistencies affecting seven records.
 * We do not apply generic title casing because valid city names can have
 * intentional capitalization patterns.
 */

/*
 * City label normalization
 *
 * Rules are explicit and supported by location alias/typo profiling.
 * We do not apply generic spelling, abbreviation, or formatting rules.
 *
 * Canonical forms are selected to avoid fragmenting the same user-facing
 * location across multiple city labels.
 */

const CITY_CANONICALIZATION = new Map([
  // Existing casing corrections
  ['Mcminnville', 'McMinnville'],
  ['LaFayette', 'Lafayette'],
  ['Mcmurray', 'McMurray'],
  ['Los Ranchos De Albuquerque', 'Los Ranchos de Albuquerque'],
  ['Mcallen', 'McAllen'],

  // Formatting / spacing
  ['Kailua Kona', 'Kailua-Kona'],
  ['Sugarland', 'Sugar Land'],
  ['Winterpark', 'Winter Park'],

  // Abbreviation variants
  ['Ft. Worth', 'Fort Worth'],
  ['Ft. Lauderdale', 'Fort Lauderdale'],
  ['Saint Augustine', 'St. Augustine'],
  ['Saint Helena', 'St. Helena'],
  ['Saint Paul', 'St. Paul'],

  // Strong typo evidence
  ['Portlando', 'Portland'],
  ['Southhold', 'Southold'],
]);

function canonicalizeCity(city) {
  if (typeof city !== 'string') {
    return city;
  }

  const trimmedCity = city.trim();

  return CITY_CANONICALIZATION.get(trimmedCity) ?? trimmedCity;
}
/*
 * Object-specific city hierarchy corrections
 *
 * Unlike alias normalization, these rules change the semantic location
 * hierarchy and therefore require record-level evidence.
 *
 * Bistro Les Amis:
 *   source city = SoHo
 *   neighborhood = SoHo
 *
 * Profiling found 43 other SoHo neighborhood records under New York, NY,
 * 100% dominant-parent agreement, ZIP5 overlap, and a 0.02-mile centroid
 * difference.
 *
 * We do NOT globally rewrite every city/neighborhood relationship.
 */

const CITY_CORRECTIONS = new Map([
  ['152377', 'New York'],
]);


function correctCity(objectID, city) {
  const canonicalCity =
    canonicalizeCity(city);

  return (
    CITY_CORRECTIONS.get(objectID) ??
    canonicalCity
  );
}

/*
 * State corrections
 *
 * These two corrections are tied to objectID because city, ZIP, area,
 * and coordinates independently support the correction.
 *
 * We do not infer state globally from city, ZIP, or coordinates.
 */

const STATE_CORRECTIONS = new Map([
  ['149527', 'CA'],
  ['138700', 'NY'],
]);

function correctState(objectID, state) {
  return STATE_CORRECTIONS.get(objectID) ?? state;
}


/*
 * Cuisine taxonomy
 *
 * Restaurant-level profiling supported semantic equivalence for:
 *
 *   Steak                 -> Steakhouse
 *   Global, International -> International
 *
 * The original source value is preserved in food_type_raw.
 *
 * Related but meaningfully distinct categories such as
 * Contemporary American or Brazilian Steakhouse remain unchanged.
 */

const FOOD_TYPE_CANONICALIZATION = new Map([
  ['Steak', 'Steakhouse'],
  ['Global, International', 'International'],
]);

function canonicalizeFoodType(foodType) {
  if (typeof foodType !== 'string') {
    return foodType;
  }

  const trimmedFoodType = foodType.trim();

  return (
    FOOD_TYPE_CANONICALIZATION.get(trimmedFoodType) ??
    trimmedFoodType
  );
}


/*
 * Price-domain validation
 *
 * The numeric JSON price is the industry-standard price tier.
 * The CSV price_range is a separate starting-price band.
 *
 * These fields are complementary and must not be compared as
 * equivalent representations.
 */

const VALID_PRICE_TIERS = new Set([
  2,
  3,
  4,
]);


/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

/*
 * Remove leading/trailing whitespace from every string value.
 *
 * This is structural cleanup, not semantic normalization:
 * internal spacing, capitalization, punctuation, and source meaning
 * are preserved.
 *
 * Arrays and nested objects are traversed so fields such as
 * payment_options are covered as well.
 */
function trimStringsDeep(value, stats) {
  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    if (trimmedValue !== value) {
      stats.trimmedStrings += 1;
    }

    return trimmedValue;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) => trimStringsDeep(item, stats)
    );
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(
        ([key, nestedValue]) => [
          key,
          trimStringsDeep(nestedValue, stats),
        ]
      )
    );
  }

  return value;
}


function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}


function compareStrings(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
/*
 * Find any string values that escaped whitespace normalization.
 * Used as a final record-contract assertion.
 */
function findUntrimmedStringPaths(
  value,
  path = 'record',
  issues = []
) {
  if (typeof value === 'string') {
    if (value !== value.trim()) {
      issues.push(path);
    }

    return issues;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findUntrimmedStringPaths(
        item,
        `${path}[${index}]`,
        issues
      );
    });

    return issues;
  }

  if (value !== null && typeof value === 'object') {
    for (const [key, nestedValue] of Object.entries(value)) {
      findUntrimmedStringPaths(
        nestedValue,
        `${path}.${key}`,
        issues
      );
    }
  }

  return issues;
}

/*
 * objectID is an identifier, not a numeric measure.
 *
 * JSON provides numeric IDs while CSV provides strings, so both are
 * normalized to strings before comparison and joining.
 */

function getNormalizedObjectID(record, sourceName, rowIndex) {
  if (
    record.objectID === undefined ||
    record.objectID === null ||
    String(record.objectID).trim() === ''
  ) {
    throw new Error(
      `${sourceName}: missing objectID at record ${rowIndex + 1}`
    );
  }

  return String(record.objectID).trim();
}


/*
 * Validate IDs before creating a Map.
 *
 * A Map would silently overwrite duplicate keys.
 */

function validateUniqueObjectIDs(records, sourceName) {
  const ids = new Set();
  const duplicateIDs = new Set();

  records.forEach((record, index) => {
    const objectID = getNormalizedObjectID(
      record,
      sourceName,
      index
    );

    if (ids.has(objectID)) {
      duplicateIDs.add(objectID);
    }

    ids.add(objectID);
  });

  if (duplicateIDs.size > 0) {
    const examples = [...duplicateIDs]
      .sort(compareStrings)
      .slice(0, 10);

    throw new Error(
      `${sourceName}: found ${duplicateIDs.size} duplicate objectID(s). ` +
      `Examples: ${examples.join(', ')}`
    );
  }

  return ids;
}


/*
 * Reject empty numeric fields before Number() conversion.
 *
 * Number('') === 0 in JavaScript, which could otherwise turn missing data
 * into apparently valid data.
 */

function toRequiredNumber(value, fieldName, objectID) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    throw new Error(
      `objectID ${objectID}: missing required ${fieldName}`
    );
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new Error(
      `objectID ${objectID}: invalid ${fieldName} value "${value}"`
    );
  }

  return parsedValue;
}


/*
 * Phone normalization is used only for comparison.
 *
 * Original values remain untouched.
 */

function normalizePhoneForComparison(phone) {
  if (!isNonEmptyString(phone)) {
    return null;
  }

  const withoutExtension = phone.replace(
    /\s*(?:ext(?:ension)?\.?|x)\s*\d+\s*$/i,
    ''
  );

  return withoutExtension.replace(/\D/g, '');
}


function assertRecordState(records, objectID, expectedState) {
  const record = records.find(
    (restaurant) => restaurant.objectID === objectID
  );

  // The restaurant may legitimately disappear from a future dataset.
  if (!record) {
    return;
  }

  if (record.state !== expectedState) {
    throw new Error(
      `State correction failed for objectID ${objectID}: ` +
      `expected ${expectedState}, received ${record.state}`
    );
  }
}


/*
 * ============================================================
 * FINAL RECORD CONTRACT
 * ============================================================
 *
 * Structural problems are errors and stop the pipeline.
 * Valid but ambiguous source data is preserved and reported later.
 */

function validateFinalRecord(record) {
  const errors = [];
  const untrimmedStringPaths =
    findUntrimmedStringPaths(record);

  if (untrimmedStringPaths.length > 0) {
    errors.push(
      'all string values must be trimmed; found: ' +
      untrimmedStringPaths.join(', ')
    );
  }
  const requiredStringFields = [
    'objectID',
    'name',
    'address',
    'area',
    'city',
    'country',
    'postal_code',
    'state',
    'image_url',
    'mobile_reserve_url',
    'reserve_url',
    'food_type_raw',
    'food_type',
    'neighborhood',
    'price_range',
    'dining_style',
    'city_raw'
  ];

  for (const field of requiredStringFields) {
    if (!isNonEmptyString(record[field])) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  // Ratings must remain inside the standard 1–5 range.
  if (
    !Number.isFinite(record.stars_count) ||
    record.stars_count < 1 ||
    record.stars_count > 5
  ) {
    errors.push(
      'stars_count must be a finite number between 1 and 5'
    );
  }

  /*
   * Zero reviews is allowed even though today's minimum is 1.
   * A new restaurant could legitimately have no reviews.
   */
  if (
    !Number.isFinite(record.reviews_count) ||
    !Number.isInteger(record.reviews_count) ||
    record.reviews_count < 0
  ) {
    errors.push(
      'reviews_count must be a non-negative integer'
    );
  }

  /*
   * New numeric price tiers are treated as drift rather than
   * automatically considered corrupt.
   */
  if (!Number.isFinite(record.price)) {
    errors.push('price must be a finite number');
  }

  const lat = record._geoloc?.lat;
  const lng = record._geoloc?.lng;

  if (
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90
  ) {
    errors.push(
      '_geoloc.lat must be between -90 and 90'
    );
  }

  if (
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    errors.push(
      '_geoloc.lng must be between -180 and 180'
    );
  }

  /*
   * Validate payment_options structure without hard-coding
   * the current payment taxonomy.
   */
  if (
    !Array.isArray(record.payment_options) ||
    record.payment_options.length === 0
  ) {
    errors.push(
      'payment_options must be a non-empty array'
    );
  } else if (
    record.payment_options.some(
      (option) => !isNonEmptyString(option)
    )
  ) {
    errors.push(
      'every payment_options value must be a non-empty string'
    );
  }

  return errors;
}


/*
 * ============================================================
 * STEP 1 — LOAD AND PARSE
 * ============================================================
 */

const jsonContents = await readFile(
  JSON_SOURCE,
  'utf8'
);

const csvContents = await readFile(
  CSV_SOURCE,
  'utf8'
);

const rawRestaurants = JSON.parse(jsonContents);

const rawRestaurantsInfo = parse(csvContents, {
  columns: true,
  delimiter: ';',
  skip_empty_lines: true,
});

const jsonWhitespaceStats = {
  trimmedStrings: 0,
};

const csvWhitespaceStats = {
  trimmedStrings: 0,
};

const restaurants = trimStringsDeep(
  rawRestaurants,
  jsonWhitespaceStats
);

const restaurantsInfo = trimStringsDeep(
  rawRestaurantsInfo,
  csvWhitespaceStats
);


/*
 * ============================================================
 * STEP 2 — VALIDATE SOURCE IDs
 * ============================================================
 *
 * We do not require exactly 5,000 records.
 * Record count is a current baseline, not a permanent invariant.
 */

const restaurantIDs = validateUniqueObjectIDs(
  restaurants,
  'restaurants_list.json'
);

const restaurantInfoIDs = validateUniqueObjectIDs(
  restaurantsInfo,
  'restaurants_info.csv'
);


/*
 * ============================================================
 * STEP 3 — VALIDATE JOIN INTEGRITY
 * ============================================================
 */

const missingFromCSV = [...restaurantIDs].filter(
  (objectID) => !restaurantInfoIDs.has(objectID)
);

const missingFromJSON = [...restaurantInfoIDs].filter(
  (objectID) => !restaurantIDs.has(objectID)
);

if (missingFromCSV.length > 0 || missingFromJSON.length > 0) {
  const errorDetails = [];

  if (missingFromCSV.length > 0) {
    errorDetails.push(
      `${missingFromCSV.length} JSON record(s) missing CSV enrichment. ` +
      `Examples: ${missingFromCSV
        .sort(compareStrings)
        .slice(0, 10)
        .join(', ')}`
    );
  }

  if (missingFromJSON.length > 0) {
    errorDetails.push(
      `${missingFromJSON.length} CSV record(s) have no JSON partner. ` +
      `Examples: ${missingFromJSON
        .sort(compareStrings)
        .slice(0, 10)
        .join(', ')}`
    );
  }

  throw new Error(
    `Join integrity validation failed:\n${errorDetails.join('\n')}`
  );
}

console.log('Source validation: OK');
console.log('JSON unique objectIDs:', restaurantIDs.size);
console.log('CSV unique objectIDs:', restaurantInfoIDs.size);
console.log('Join integrity: complete 1:1 match');


/*
 * ============================================================
 * STEP 4 — BUILD CSV LOOKUP
 * ============================================================
 */

const infoByID = new Map(
  restaurantsInfo.map((restaurant) => [
    String(restaurant.objectID).trim(),
    restaurant,
  ])
);


/*
 * ============================================================
 * STEP 5 — MERGE, TYPE, AND CLEAN
 * ============================================================
 *
 * Preserved:
 * - both phone fields
 * - both complementary price dimensions
 * - original cuisine in food_type_raw
 * - neighborhoods
 * - payment_options
 * - _geoloc
 */

const mergedRestaurants = restaurants.map((restaurant) => {
  const objectID = String(restaurant.objectID).trim();
  const info = infoByID.get(objectID);

  if (!info) {
    throw new Error(
      `Unexpected missing CSV enrichment for objectID ${objectID}`
    );
  }

  return {
    ...restaurant,

    objectID,

    
    // Preserve source city for traceability.
    city_raw: restaurant.city,

    // Expose the canonical city used by search/discovery.
    city: correctCity(
      objectID,
      restaurant.city
    ),

    state: correctState(
      objectID,
      restaurant.state
    ),


    // Preserve source taxonomy and expose normalized discovery taxonomy.
    food_type_raw: info.food_type,
    food_type: canonicalizeFoodType(info.food_type),

    stars_count: toRequiredNumber(
      info.stars_count,
      'stars_count',
      objectID
    ),

    reviews_count: toRequiredNumber(
      info.reviews_count,
      'reviews_count',
      objectID
    ),

    neighborhood: info.neighborhood,
    price_range: info.price_range,
    dining_style: info.dining_style,

    // Preserve CSV phone separately from JSON phone.
    phone_number: info.phone_number,
  };
});


/*
 * ============================================================
 * STEP 6 — COLLECT CLEANING TRANSFORMATIONS
 * ============================================================
 */

const cityCanonicalizationCounts = {};

restaurants.forEach((restaurant) => {
  const originalCity = restaurant.city;
  const canonicalCity = canonicalizeCity(originalCity);

  if (canonicalCity !== originalCity) {
    const correction =
      `${originalCity} -> ${canonicalCity}`;

    cityCanonicalizationCounts[correction] =
      (cityCanonicalizationCounts[correction] ?? 0) + 1;
  }
});

const cityCanonicalizations = Object.values(
  cityCanonicalizationCounts
).reduce(
  (total, count) => total + count,
  0
);

const cityHierarchyCorrectionDetails = [];

restaurants.forEach((restaurant) => {
  const objectID =
    String(
      restaurant.objectID
    ).trim();

  const canonicalCity =
    canonicalizeCity(
      restaurant.city
    );

  const correctedCity =
    correctCity(
      objectID,
      restaurant.city
    );

  if (
    correctedCity !==
    canonicalCity
  ) {
    cityHierarchyCorrectionDetails.push({
      objectID,
      from: canonicalCity,
      to: correctedCity,
    });
  }
});


const stateCorrectionDetails = [];

restaurants.forEach((restaurant) => {
  const objectID = String(restaurant.objectID).trim();

  const correctedState = correctState(
    objectID,
    restaurant.state
  );

  if (correctedState !== restaurant.state) {
    stateCorrectionDetails.push({
      objectID,
      from: restaurant.state,
      to: correctedState,
    });
  }
});


const foodTypeCanonicalizationCounts = {};

restaurantsInfo.forEach((info) => {
  const originalFoodType =
    typeof info.food_type === 'string'
      ? info.food_type.trim()
      : info.food_type;

  const canonicalFoodType =
    canonicalizeFoodType(info.food_type);

  if (canonicalFoodType !== originalFoodType) {
    const correction =
      `${originalFoodType} -> ${canonicalFoodType}`;

    foodTypeCanonicalizationCounts[correction] =
      (foodTypeCanonicalizationCounts[correction] ?? 0) + 1;
  }
});

const foodTypeCanonicalizations = Object.values(
  foodTypeCanonicalizationCounts
).reduce(
  (total, count) => total + count,
  0
);


/*
 * ============================================================
 * STEP 7 — REGRESSION CHECK EXPLICIT CORRECTIONS
 * ============================================================
 */

assertRecordState(
  mergedRestaurants,
  '149527',
  'CA'
);

assertRecordState(
  mergedRestaurants,
  '138700',
  'NY'
);

function assertRecordCity(
  records,
  objectID,
  expectedCity
) {
  const record =
    records.find(
      (restaurant) =>
        restaurant.objectID ===
        objectID
    );

  if (!record) {
    return;
  }

  if (
    record.city !==
    expectedCity
  ) {
    throw new Error(
      `City correction failed for objectID ${objectID}: ` +
      `expected ${expectedCity}, received ${record.city}`
    );
  }
}
assertRecordCity(
  mergedRestaurants,
  '152377',
  'New York'
);

/*
 * ============================================================
 * STEP 8 — VALIDATE FINAL RECORD CONTRACT
 * ============================================================
 */

const finalValidationErrors = [];

for (const restaurant of mergedRestaurants) {
  const errors = validateFinalRecord(restaurant);

  if (errors.length > 0) {
    finalValidationErrors.push({
      objectID: restaurant.objectID,
      errors,
    });
  }
}


const finalObjectIDs = mergedRestaurants.map(
  (restaurant) => restaurant.objectID
);

const uniqueFinalObjectIDs =
  new Set(finalObjectIDs);

if (
  uniqueFinalObjectIDs.size !==
  mergedRestaurants.length
) {
  throw new Error(
    'Final record validation failed: duplicate objectIDs in output'
  );
}


if (finalValidationErrors.length > 0) {
  console.error(
    '\nFinal record validation: FAILED'
  );

  console.error(
    'Invalid records:',
    finalValidationErrors.length
  );

  console.dir(
    finalValidationErrors.slice(0, 10),
    { depth: null }
  );

  throw new Error(
    `Final record contract failed for ` +
    `${finalValidationErrors.length} record(s)`
  );
}


/*
 * ============================================================
 * STEP 9 — NON-FATAL DATA-QUALITY OBSERVATIONS
 * ============================================================
 *
 * These conditions are intentionally not corrected.
 */


/*
 * Phone conflicts
 */

const phoneConflicts = mergedRestaurants.filter(
  (restaurant) => {
    const jsonPhone =
      normalizePhoneForComparison(
        restaurant.phone
      );

    const csvPhone =
      normalizePhoneForComparison(
        restaurant.phone_number
      );

    return (
      jsonPhone !== null &&
      csvPhone !== null &&
      jsonPhone !== csvPhone
    );
  }
);


const phoneComparisonUnavailable =
  mergedRestaurants.filter((restaurant) => {
    return (
      normalizePhoneForComparison(
        restaurant.phone
      ) === null ||
      normalizePhoneForComparison(
        restaurant.phone_number
      ) === null
    );
  });


/*
 * Price-domain drift
 *
 * price and price_range represent different business concepts,
 * so no cross-field conflict check is performed.
 */

const unexpectedPriceValues = [
  ...new Set(
    mergedRestaurants
      .map(
        (restaurant) => restaurant.price
      )
      .filter(
        (price) =>
          !VALID_PRICE_TIERS.has(price)
      )
  ),
].sort((a, b) => a - b);


/*
 * Repeated restaurant names
 *
 * Names are not record identity.
 */

const restaurantNameCounts = new Map();

for (const restaurant of mergedRestaurants) {
  restaurantNameCounts.set(
    restaurant.name,
    (restaurantNameCounts.get(restaurant.name) ?? 0) + 1
  );
}

const repeatedRestaurantNames = [
  ...restaurantNameCounts.entries(),
]
  .filter(([, count]) => count > 1)
  .sort(([nameA], [nameB]) =>
    compareStrings(nameA, nameB)
  );


/*
 * Category cardinality
 */

const sourceFoodTypeCount = new Set(
  restaurantsInfo.map(
    (info) =>
      typeof info.food_type === 'string'
        ? info.food_type.trim()
        : info.food_type
  )
).size;

const categoryCounts = {
  normalizedFoodTypes: new Set(
    mergedRestaurants.map(
      (restaurant) => restaurant.food_type
    )
  ).size,

  neighborhoods: new Set(
    mergedRestaurants.map(
      (restaurant) => restaurant.neighborhood
    )
  ).size,

  priceRanges: new Set(
    mergedRestaurants.map(
      (restaurant) => restaurant.price_range
    )
  ).size,

  diningStyles: new Set(
    mergedRestaurants.map(
      (restaurant) => restaurant.dining_style
    )
  ).size,
};


/*
 * ============================================================
 * STEP 10 — DETERMINISTIC OUTPUT
 * ============================================================
 *
 * Stable objectID ordering makes the generated output repeatable
 * and easy to diff.
 *
 * This has nothing to do with Algolia result ranking.
 */

const cleanedRestaurants = [
  ...mergedRestaurants,
].sort((a, b) =>
  compareStrings(a.objectID, b.objectID)
);


/*
 * ============================================================
 * STEP 11 — WRITE CLEANED DATASET
 * ============================================================
 */

await mkdir(
  OUTPUT_DIR,
  { recursive: true }
);

await writeFile(
  CLEANED_OUTPUT,
  `${JSON.stringify(cleanedRestaurants, null, 2)}\n`,
  'utf8'
);


/*
 * ============================================================
 * CONSOLE DATA-PREPARATION REPORT
 * ============================================================
 *
 * Runtime report:
 * - what changed
 * - what was preserved
 * - why
 */

console.log('\nCleaning transformations:');

const totalWhitespaceNormalizations =
  jsonWhitespaceStats.trimmedStrings +
  csvWhitespaceStats.trimmedStrings;

console.log(
  `Whitespace normalization: ` +
  `${totalWhitespaceNormalizations} string value(s)`
);

console.log(
  `  JSON source: ${jsonWhitespaceStats.trimmedStrings}`
);

console.log(
  `  CSV source: ${csvWhitespaceStats.trimmedStrings}`
);

console.log(
  '  Why: remove non-semantic leading/trailing whitespace ' +
  'across all source string values.'
);

console.log(
  `City label normalizations: ${cityCanonicalizations} records`
);

console.log(
  '  Why: profiling identified explicit casing, spacing, abbreviation, ' +
  'and typo variants representing the same city. No generic city ' +
  'normalization rule is applied.'
);

console.log(
  `\nCity hierarchy corrections: ` +
  `${cityHierarchyCorrectionDetails.length} records`
);

for (
  const correction
  of cityHierarchyCorrectionDetails
) {
  console.log(
    `  ${correction.objectID}: ` +
    `${correction.from} -> ${correction.to}`
  );
}

console.log(
  '  Why: record-level city, neighborhood, ZIP, area, frequency, ' +
  'and geolocation evidence support the correction.'
);

for (
  const [correction, count]
  of Object.entries(cityCanonicalizationCounts)
    .sort(([a], [b]) => compareStrings(a, b))
) {
  console.log(`  ${correction}: ${count}`);
}

console.log(
  '  Why: canonicalize only profiled casing inconsistencies; ' +
  'no broad city reformatting.'
);


console.log(
  `\nState corrections: ${stateCorrectionDetails.length} records`
);

for (const correction of stateCorrectionDetails) {
  console.log(
    `  ${correction.objectID}: ` +
    `${correction.from} -> ${correction.to}`
  );
}

console.log(
  '  Why: city, ZIP, area, and geolocation corroborate the corrections.'
);


console.log(
  `\nCuisine taxonomy normalization: ` +
  `${foodTypeCanonicalizations} records`
);

for (
  const [correction, count]
  of Object.entries(foodTypeCanonicalizationCounts)
    .sort(([a], [b]) => compareStrings(a, b))
) {
  console.log(`  ${correction}: ${count}`);
}

console.log(
  '  Why: restaurant-level profiling showed equivalent labels that would ' +
  'fragment cuisine discovery/filtering.'
);

console.log(
  '  Original source label preserved in food_type_raw.'
);


console.log(
  '\nFinal record validation: OK'
);

console.log(
  'Valid records:',
  mergedRestaurants.length
);

console.log(
  'Unique objectIDs:',
  uniqueFinalObjectIDs.size
);


console.log('\nData-quality observations:');


console.log(
  `Phone source conflicts preserved: ${phoneConflicts.length}`
);

console.log(
  '  Why: base numbers differ between JSON and CSV and neither source is ' +
  'demonstrably authoritative.'
);


console.log(
  '\nPrice dimensions preserved: industry tier and starting-price range'
);

console.log(
  '  Why: the two fields represent complementary concepts and are not ' +
  'expected to map one-to-one.'
);


console.log(
  `\nRepeated restaurant names, different locations: ` +
  `${repeatedRestaurantNames.length}`
);

console.log(
  '  Why: restaurant name is not record identity; objectID remains unique.'
);


if (phoneComparisonUnavailable.length > 0) {
  console.log(
    '\nPhone comparisons unavailable:',
    phoneComparisonUnavailable.length
  );
}


if (unexpectedPriceValues.length > 0) {
  console.log(
    '\nUnexpected numeric price values:',
    unexpectedPriceValues.join(', ')
  );
}


console.log('\nCategory cardinality:');

console.log(
  'Cuisine types:',
  `${sourceFoodTypeCount} source -> ` +
  `${categoryCounts.normalizedFoodTypes} normalized`
);

console.log(
  'Neighborhoods:',
  categoryCounts.neighborhoods
);

console.log(
  'Price ranges:',
  categoryCounts.priceRanges
);

console.log(
  'Dining styles:',
  categoryCounts.diningStyles
);


console.log('\nRun summary:');

console.log(
  'JSON source records:',
  restaurants.length
);

console.log(
  'CSV source records:',
  restaurantsInfo.length
);

console.log(
  'Cleaned valid records:',
  cleanedRestaurants.length
);

console.log(
  'Cleaned dataset:',
  CLEANED_OUTPUT
);