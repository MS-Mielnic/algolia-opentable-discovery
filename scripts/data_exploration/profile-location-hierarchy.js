import path from 'node:path';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';

import {
  CLEANED_RECORDS_PATH,
  GENERATED_DIR,
} from '../lib/project-paths.js';


/*
 * Location hierarchy profiler
 *
 * Purpose:
 * Diagnose semantic inconsistencies across:
 *
 * - city
 * - neighborhood
 * - area
 * - state
 * - postal_code
 * - _geoloc
 *
 * Input:
 * generated/restaurants_cleaned.json
 *
 * This script DOES NOT modify records.
 */

const REPORT_OUTPUT = path.join(
  GENERATED_DIR,
  'location-hierarchy-profile.json'
);


/*
 * ============================================================
 * NORMALIZATION HELPERS
 * ============================================================
 */

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US');
}


/*
 * Compare US ZIP codes at ZIP5 level.
 *
 * Examples:
 *
 * 92014-2510 -> 92014
 * 10012      -> 10012
 *
 * This is for analysis only.
 */

function normalizePostalCode(value) {
  const text = String(value ?? '').trim();

  const match = text.match(/^(\d{5})/);

  return match
    ? match[1]
    : null;
}


function compareStrings(a, b) {
  return String(a).localeCompare(
    String(b),
    'en-US'
  );
}


function increment(map, key) {
  map.set(
    key,
    (map.get(key) ?? 0) + 1
  );
}


function mapToSortedEntries(map) {
  return [...map.entries()]
    .sort(
      ([aKey, aCount], [bKey, bCount]) =>
        bCount - aCount ||
        compareStrings(aKey, bKey)
    )
    .map(([value, count]) => ({
      value,
      count,
    }));
}


function groupBy(records, keyFn) {
  const groups = new Map();

  for (const record of records) {
    const key = keyFn(record);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(record);
  }

  return groups;
}


function postalCodeCounts(records) {
  const counts = new Map();

  for (const record of records) {
    const zip5 =
      normalizePostalCode(
        record.postal_code
      );

    if (zip5) {
      increment(
        counts,
        zip5
      );
    }
  }

  return counts;
}


function postalCodeSet(records) {
  return new Set(
    records
      .map(
        (record) =>
          normalizePostalCode(
            record.postal_code
          )
      )
      .filter(Boolean)
  );
}


function intersection(setA, setB) {
  return new Set(
    [...setA].filter(
      (value) =>
        setB.has(value)
    )
  );
}


function postalRecordOverlapShare(
  records,
  comparisonZipSet
) {
  const postalCodes =
    records
      .map(
        (record) =>
          normalizePostalCode(
            record.postal_code
          )
      )
      .filter(Boolean);

  if (postalCodes.length === 0) {
    return null;
  }

  const matching =
    postalCodes.filter(
      (zip5) =>
        comparisonZipSet.has(zip5)
    ).length;

  return matching /
    postalCodes.length;
}


/*
 * ============================================================
 * GEO HELPERS
 * ============================================================
 */

function distanceMiles(a, b) {
  const toRadians = (degrees) =>
    degrees * Math.PI / 180;

  const earthRadiusMiles =
    3958.7613;

  const lat1 =
    toRadians(a.lat);

  const lat2 =
    toRadians(b.lat);

  const deltaLat =
    toRadians(
      b.lat - a.lat
    );

  const deltaLng =
    toRadians(
      b.lng - a.lng
    );

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) ** 2;

  return (
    2 *
    earthRadiusMiles *
    Math.asin(
      Math.sqrt(haversine)
    )
  );
}


function centroid(records) {
  const validRecords =
    records.filter(
      (record) =>
        Number.isFinite(
          record._geoloc?.lat
        ) &&
        Number.isFinite(
          record._geoloc?.lng
        )
    );

  if (
    validRecords.length === 0
  ) {
    return null;
  }

  const lat =
    validRecords.reduce(
      (sum, record) =>
        sum +
        record._geoloc.lat,
      0
    ) /
    validRecords.length;

  const lng =
    validRecords.reduce(
      (sum, record) =>
        sum +
        record._geoloc.lng,
      0
    ) /
    validRecords.length;

  return {
    lat,
    lng,
  };
}


function compactRecord(record) {
  return {
    objectID:
      record.objectID,

    name:
      record.name,

    address:
      record.address,

    postal_code:
      record.postal_code,

    postal_code_5:
      normalizePostalCode(
        record.postal_code
      ),

    city:
      record.city,

    neighborhood:
      record.neighborhood,

    area:
      record.area,

    state:
      record.state,

    _geoloc:
      record._geoloc,
  };
}


/*
 * ============================================================
 * LOAD GENERATED JOINED DATASET
 * ============================================================
 */

const contents =
  await readFile(
    CLEANED_RECORDS_PATH,
    'utf8'
  );

const records =
  JSON.parse(contents);


if (!Array.isArray(records)) {
  throw new Error(
    'Expected restaurants_cleaned.json to contain an array.'
  );
}


/*
 * ============================================================
 * BASELINE
 * ============================================================
 */

const cityValues =
  new Set(
    records.map(
      (record) =>
        record.city
    )
  );

const neighborhoodValues =
  new Set(
    records.map(
      (record) =>
        record.neighborhood
    )
  );

const areaValues =
  new Set(
    records.map(
      (record) =>
        record.area
    )
  );

const stateValues =
  new Set(
    records.map(
      (record) =>
        record.state
    )
  );


/*
 * ============================================================
 * CITY == NEIGHBORHOOD
 * ============================================================
 */

const cityEqualsNeighborhood =
  records.filter(
    (record) =>
      normalizeKey(
        record.city
      ) ===
      normalizeKey(
        record.neighborhood
      )
  );


const redundantLocationContexts =
  new Map();


for (
  const record
  of cityEqualsNeighborhood
) {
  const context =
    `${record.city}, ${record.state}`;

  increment(
    redundantLocationContexts,
    context
  );
}


/*
 * ============================================================
 * NEIGHBORHOOD CONTEXT ANALYSIS
 * ============================================================
 */

const neighborhoodContexts =
  new Map();


for (const record of records) {
  const key =
    normalizeKey(
      record.neighborhood
    );

  if (
    !neighborhoodContexts.has(
      key
    )
  ) {
    neighborhoodContexts.set(
      key,
      {
        displayValue:
          record.neighborhood,

        contexts:
          new Map(),

        records: [],
      }
    );
  }


  const entry =
    neighborhoodContexts.get(
      key
    );

  const context =
    `${record.city}, ${record.state}`;

  increment(
    entry.contexts,
    context
  );

  entry.records.push(
    record
  );
}


const neighborhoodsAcrossMultipleContexts =
  [...neighborhoodContexts.values()]
    .filter(
      (entry) =>
        entry.contexts.size > 1
    )
    .map(
      (entry) => ({
        neighborhood:
          entry.displayValue,

        totalRecords:
          entry.records.length,

        contexts:
          mapToSortedEntries(
            entry.contexts
          ),
      })
    )
    .sort(
      (a, b) =>
        b.contexts.length -
          a.contexts.length ||

        b.totalRecords -
          a.totalRecords ||

        compareStrings(
          a.neighborhood,
          b.neighborhood
        )
    );


/*
 * ============================================================
 * CROSS-ROLE ANALYSIS
 *
 * Find labels that occur:
 *
 * - as a city
 * - as a neighborhood under another city
 *
 * Example:
 *
 * city = SoHo
 *
 * versus:
 *
 * neighborhood = SoHo
 * city = New York
 *
 * These are REVIEW candidates only.
 * ============================================================
 */

const cityGroups =
  groupBy(
    records,
    (record) =>
      normalizeKey(
        record.city
      )
  );


const neighborhoodGroups =
  groupBy(
    records,
    (record) =>
      normalizeKey(
        record.neighborhood
      )
  );


const crossRoleCandidates = [];


for (
  const [
    normalizedValue,
    cityRecords,
  ]
  of cityGroups.entries()
) {
  const neighborhoodRecords =
    neighborhoodGroups.get(
      normalizedValue
    );


  if (!neighborhoodRecords) {
    continue;
  }


  /*
   * Ignore neighborhood uses where:
   *
   * city == neighborhood
   *
   * We want uses under a DIFFERENT city.
   */

  const neighborhoodRecordsUnderOtherCities =
    neighborhoodRecords.filter(
      (record) =>
        normalizeKey(
          record.city
        ) !==
        normalizedValue
    );


  if (
    neighborhoodRecordsUnderOtherCities.length ===
    0
  ) {
    continue;
  }


  /*
   * Parent contexts
   */

  const parentContexts =
    new Map();


  for (
    const record
    of neighborhoodRecordsUnderOtherCities
  ) {
    const parent =
      `${record.city}, ${record.state}`;

    increment(
      parentContexts,
      parent
    );
  }


  const sortedParentContexts =
    mapToSortedEntries(
      parentContexts
    );


  const dominantParent =
    sortedParentContexts[0] ??
    null;


  const dominantParentShare =
    dominantParent
      ? dominantParent.count /
        neighborhoodRecordsUnderOtherCities.length
      : 0;


  /*
   * Relative evidence:
   *
   * SoHo:
   *
   * 1 city occurrence
   * 43 neighborhood occurrences under another city
   *
   * parentSupportRatio =
   * 43 / (43 + 1)
   *
   * This differentiates SoHo from places such as:
   *
   * Del Mar
   * 14 city occurrences
   * 9 alternative neighborhood occurrences
   */

  const parentSupportRatio =
    neighborhoodRecordsUnderOtherCities.length /
    (
      neighborhoodRecordsUnderOtherCities.length +
      cityRecords.length
    );


  /*
   * Dominant parent records
   */

  const dominantParentRecords =
    dominantParent
      ? neighborhoodRecordsUnderOtherCities
          .filter(
            (record) =>
              `${record.city}, ${record.state}` ===
              dominantParent.value
          )
      : [];


  /*
   * ========================================================
   * POSTAL CODE EVIDENCE
   * ========================================================
   */

  const candidateZip5Set =
    postalCodeSet(
      cityRecords
    );


  const parentZip5Set =
    postalCodeSet(
      dominantParentRecords
    );


  const overlappingZip5Set =
    intersection(
      candidateZip5Set,
      parentZip5Set
    );


  /*
   * Share of candidate records whose ZIP5 exists among
   * dominant-parent records.
   */

  const candidateZipOverlapShare =
    postalRecordOverlapShare(
      cityRecords,
      parentZip5Set
    );


  /*
   * Share of dominant-parent records whose ZIP5 exists
   * among candidate-city records.
   */

  const parentZipOverlapShare =
    postalRecordOverlapShare(
      dominantParentRecords,
      candidateZip5Set
    );


  /*
   * ========================================================
   * GEOGRAPHIC EVIDENCE
   * ========================================================
   */

  const cityCentroid =
    centroid(
      cityRecords
    );


  const parentCentroid =
    centroid(
      dominantParentRecords
    );


  const centroidDistanceMiles =
    cityCentroid &&
    parentCentroid
      ? distanceMiles(
          cityCentroid,
          parentCentroid
        )
      : null;


  /*
   * ========================================================
   * STATE / AREA / ZIP COUNTS
   * ========================================================
   */

  const cityStateCounts =
    new Map();

  const cityAreaCounts =
    new Map();


  for (
    const record
    of cityRecords
  ) {
    increment(
      cityStateCounts,
      record.state
    );

    increment(
      cityAreaCounts,
      record.area
    );
  }


  const dominantParentState =
    dominantParent
      ? dominantParent.value
          .split(', ')
          .at(-1)
      : null;


  const cityStateMatchesParent =
    dominantParentState
      ? cityRecords.every(
          (record) =>
            record.state ===
            dominantParentState
        )
      : false;


  /*
   * ========================================================
   * REVIEW PRIORITY
   *
   * This is NOT an automatic correction rule.
   *
   * HIGH means the dataset contains unusually strong,
   * internally consistent evidence worth manual inspection.
   * ========================================================
   */

  let reviewPriority =
    'review';


  const hasZipOverlap =
    overlappingZip5Set.size > 0;


  if (
    parentSupportRatio >= 0.8 &&
    dominantParentShare >= 0.9 &&
    candidateZipOverlapShare !== null &&
    candidateZipOverlapShare >= 0.8 &&
    centroidDistanceMiles !== null &&
    centroidDistanceMiles <= 1 &&
    cityStateMatchesParent
  ) {
    reviewPriority =
      'high';
  } else if (
    parentSupportRatio >= 0.5 &&
    dominantParentShare >= 0.8 &&
    hasZipOverlap &&
    centroidDistanceMiles !== null &&
    centroidDistanceMiles <= 5 &&
    cityStateMatchesParent
  ) {
    reviewPriority =
      'medium';
  }


  crossRoleCandidates.push({
    value:
      cityRecords[0].city,

    reviewPriority,


    /*
     * Frequency evidence
     */

    cityOccurrences:
      cityRecords.length,

    neighborhoodOccurrences:
      neighborhoodRecords.length,

    neighborhoodOccurrencesUnderOtherCities:
      neighborhoodRecordsUnderOtherCities.length,

    parentSupportRatio:
      Number(
        parentSupportRatio.toFixed(4)
      ),


    /*
     * Parent evidence
     */

    parentContexts:
      sortedParentContexts,

    dominantParentShare:
      Number(
        dominantParentShare.toFixed(4)
      ),


    /*
     * Geo evidence
     */

    centroidDistanceMiles:
      centroidDistanceMiles === null
        ? null
        : Number(
            centroidDistanceMiles.toFixed(2)
          ),


    /*
     * Postal evidence
     */

    postalEvidence: {
      candidateZip5Counts:
        mapToSortedEntries(
          postalCodeCounts(
            cityRecords
          )
        ),

      dominantParentZip5Counts:
        mapToSortedEntries(
          postalCodeCounts(
            dominantParentRecords
          )
        ),

      overlappingZip5:
        [...overlappingZip5Set]
          .sort(
            compareStrings
          ),

      hasExactZipOverlap:
        hasZipOverlap,

      candidateRecordOverlapShare:
        candidateZipOverlapShare === null
          ? null
          : Number(
              candidateZipOverlapShare
                .toFixed(4)
            ),

      dominantParentRecordOverlapShare:
        parentZipOverlapShare === null
          ? null
          : Number(
              parentZipOverlapShare
                .toFixed(4)
            ),
    },


    /*
     * Other context
     */

    cityStates:
      mapToSortedEntries(
        cityStateCounts
      ),

    cityAreas:
      mapToSortedEntries(
        cityAreaCounts
      ),


    /*
     * Examples
     */

    cityExamples:
      cityRecords
        .slice(0, 10)
        .map(
          compactRecord
        ),

    neighborhoodExamples:
      dominantParentRecords
        .slice(0, 10)
        .map(
          compactRecord
        ),
  });
}


/*
 * ============================================================
 * SORT REVIEW CANDIDATES
 *
 * Priority first, then asymmetric parent evidence.
 * ============================================================
 */

const priorityOrder = {
  high: 0,
  medium: 1,
  review: 2,
};


crossRoleCandidates.sort(
  (a, b) =>
    priorityOrder[
      a.reviewPriority
    ] -
      priorityOrder[
        b.reviewPriority
      ] ||

    b.parentSupportRatio -
      a.parentSupportRatio ||

    b.neighborhoodOccurrencesUnderOtherCities -
      a.neighborhoodOccurrencesUnderOtherCities ||

    compareStrings(
      a.value,
      b.value
    )
);


/*
 * ============================================================
 * SOHO FOCUS
 * ============================================================
 */

const sohoKey =
  normalizeKey('SoHo');


const sohoCityRecords =
  cityGroups.get(
    sohoKey
  ) ?? [];


const sohoNeighborhoodRecords =
  neighborhoodGroups.get(
    sohoKey
  ) ?? [];


const sohoCandidate =
  crossRoleCandidates.find(
    (candidate) =>
      normalizeKey(
        candidate.value
      ) ===
      sohoKey
  ) ?? null;


/*
 * ============================================================
 * REPORT
 * ============================================================
 */

const report = {
  generatedAt:
    new Date().toISOString(),

  source:
    CLEANED_RECORDS_PATH,


  baseline: {
    records:
      records.length,

    uniqueCities:
      cityValues.size,

    uniqueNeighborhoods:
      neighborhoodValues.size,

    uniqueAreas:
      areaValues.size,

    uniqueStates:
      stateValues.size,

    cityEqualsNeighborhoodRecords:
      cityEqualsNeighborhood.length,

    cityDiffersFromNeighborhoodRecords:
      records.length -
      cityEqualsNeighborhood.length,

    neighborhoodNamesAcrossMultipleCityStateContexts:
      neighborhoodsAcrossMultipleContexts.length,

    valuesUsedAsCityAndNeighborhoodUnderAnotherCity:
      crossRoleCandidates.length,

    highPriorityReviewCandidates:
      crossRoleCandidates.filter(
        (candidate) =>
          candidate.reviewPriority ===
          'high'
      ).length,

    mediumPriorityReviewCandidates:
      crossRoleCandidates.filter(
        (candidate) =>
          candidate.reviewPriority ===
          'medium'
      ).length,
  },


  interpretationNotes: [
    'The profiler reads restaurants_cleaned.json and does not rejoin the raw sources.',

    'No location values are changed by this script.',

    'ZIP+4 values are normalized to ZIP5 only for comparison.',

    'Postal-code overlap is supporting evidence, not an authority for determining municipal hierarchy.',

    'city == neighborhood is treated as a UI redundancy signal, not automatically as a data error.',

    'parentSupportRatio compares neighborhood-under-other-city occurrences against city occurrences for the same label.',

    'reviewPriority is only a way to prioritize manual analysis. It must not be used as an automatic correction rule.',
  ],


  redundantCityNeighborhood: {
    totalRecords:
      cityEqualsNeighborhood.length,

    topContexts:
      mapToSortedEntries(
        redundantLocationContexts
      ).slice(
        0,
        100
      ),
  },


  neighborhoodsAcrossMultipleContexts:
    neighborhoodsAcrossMultipleContexts
      .slice(
        0,
        200
      ),


  crossRoleCandidates,


  focus: {
    SoHo: {
      cityOccurrences:
        sohoCityRecords.length,

      neighborhoodOccurrences:
        sohoNeighborhoodRecords.length,

      candidate:
        sohoCandidate,

      cityRecords:
        sohoCityRecords.map(
          compactRecord
        ),

      neighborhoodRecords:
        sohoNeighborhoodRecords.map(
          compactRecord
        ),
    },
  },
};


/*
 * ============================================================
 * WRITE REPORT
 * ============================================================
 */

await mkdir(
  GENERATED_DIR,
  {
    recursive: true,
  }
);


await writeFile(
  REPORT_OUTPUT,
  `${JSON.stringify(
    report,
    null,
    2
  )}\n`,
  'utf8'
);


/*
 * ============================================================
 * CONSOLE
 * ============================================================
 */

console.log(
  '\nLOCATION HIERARCHY PROFILE'
);

console.log(
  '=========================='
);

console.log(
  `Input: ${CLEANED_RECORDS_PATH}`
);

console.log(
  `Records: ${report.baseline.records}`
);

console.log(
  `Unique cities: ${report.baseline.uniqueCities}`
);

console.log(
  `Unique neighborhoods: ${report.baseline.uniqueNeighborhoods}`
);

console.log(
  `Unique areas: ${report.baseline.uniqueAreas}`
);

console.log(
  `city == neighborhood: ` +
  `${report.baseline.cityEqualsNeighborhoodRecords}`
);

console.log(
  `Neighborhood names in multiple city/state contexts: ` +
  `${report.baseline.neighborhoodNamesAcrossMultipleCityStateContexts}`
);

console.log(
  `Cross-role candidates: ` +
  `${report.baseline.valuesUsedAsCityAndNeighborhoodUnderAnotherCity}`
);

console.log(
  `High-priority review candidates: ` +
  `${report.baseline.highPriorityReviewCandidates}`
);

console.log(
  `Medium-priority review candidates: ` +
  `${report.baseline.mediumPriorityReviewCandidates}`
);


/*
 * SoHo
 */

console.log(
  '\nSoHo focus'
);

console.log(
  '----------'
);


if (sohoCandidate) {
  console.log(
    `City occurrences: ` +
    `${sohoCandidate.cityOccurrences}`
  );

  console.log(
    `Neighborhood occurrences under other cities: ` +
    `${sohoCandidate.neighborhoodOccurrencesUnderOtherCities}`
  );

  console.log(
    `Parent support ratio: ` +
    `${Math.round(
      sohoCandidate.parentSupportRatio *
      100
    )}%`
  );

  console.log(
    `Dominant parent: ` +
    `${sohoCandidate.parentContexts[0]?.value}`
  );

  console.log(
    `Dominant parent share: ` +
    `${Math.round(
      sohoCandidate.dominantParentShare *
      100
    )}%`
  );

  console.log(
    `Centroid distance: ` +
    `${sohoCandidate.centroidDistanceMiles} miles`
  );

  console.log(
    `Candidate ZIP5: ` +
    `${sohoCandidate.postalEvidence
      .candidateZip5Counts
      .map(
        (entry) =>
          entry.value
      )
      .join(', ')}`
  );

  console.log(
    `Dominant parent ZIP5: ` +
    `${sohoCandidate.postalEvidence
      .dominantParentZip5Counts
      .map(
        (entry) =>
          entry.value
      )
      .join(', ')}`
  );

  console.log(
    `Overlapping ZIP5: ` +
    `${sohoCandidate.postalEvidence
      .overlappingZip5
      .join(', ')}`
  );

  console.log(
    `Candidate ZIP overlap share: ` +
    `${Math.round(
      (
        sohoCandidate.postalEvidence
          .candidateRecordOverlapShare ??
        0
      ) *
      100
    )}%`
  );

  console.log(
    `Review priority: ` +
    `${sohoCandidate.reviewPriority}`
  );
}


/*
 * Top candidates
 */

console.log(
  '\nTop review candidates'
);

console.log(
  '---------------------'
);


for (
  const candidate
  of crossRoleCandidates.slice(
    0,
    25
  )
) {
  const parent =
    candidate.parentContexts[0];

  const zipOverlap =
    candidate.postalEvidence
      .overlappingZip5
      .join(', ') ||
    'none';

  console.log(
    `${candidate.value}: ` +
    `priority=${candidate.reviewPriority}, ` +
    `city=${candidate.cityOccurrences}, ` +
    `other-city-neighborhood=${candidate.neighborhoodOccurrencesUnderOtherCities}, ` +
    `parent-support=${Math.round(candidate.parentSupportRatio * 100)}%, ` +
    `dominant-parent=${parent?.value ?? 'n/a'}, ` +
    `parent-share=${Math.round(candidate.dominantParentShare * 100)}%, ` +
    `ZIP-overlap=${zipOverlap}, ` +
    `distance=${candidate.centroidDistanceMiles ?? 'n/a'} mi`
  );
}


console.log(
  '\nFull report written to:'
);

console.log(
  REPORT_OUTPUT
);