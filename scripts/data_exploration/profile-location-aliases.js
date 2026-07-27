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
 * City alias / typo profiler
 *
 * Purpose:
 * Identify likely alternate representations of the SAME city.
 *
 * Examples of the kinds of patterns being investigated:
 *
 *   St. Paul        <-> Saint Paul
 *   Fort Lauderdale <-> Ft. Lauderdale
 *   Winter Park     <-> Winterpark
 *   Southold        <-> Southhold
 *   Portland        <-> Portlando
 *
 * Evidence used:
 *
 *   - same state
 *   - normalized name similarity
 *   - common abbreviation equivalence
 *   - ZIP5 overlap
 *   - geolocation proximity
 *   - area overlap
 *
 * This script DOES NOT modify any records.
 */

const REPORT_OUTPUT = path.join(
  GENERATED_DIR,
  'location-alias-typo-profile.json'
);


/*
 * ============================================================
 * TEXT NORMALIZATION
 * ============================================================
 */

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function compactText(value) {
  return normalizeText(value)
    .replace(/\s+/g, '');
}


/*
 * Normalize a small number of common geographic abbreviations.
 *
 * This does NOT mean one spelling is preferred over another.
 * It is only used to identify candidate pairs.
 */

const TOKEN_ALIASES = new Map([
  ['saint', 'st'],
  ['st', 'st'],

  ['fort', 'ft'],
  ['ft', 'ft'],

  ['mount', 'mt'],
  ['mt', 'mt'],
]);


function aliasSignature(value) {
  return normalizeText(value)
    .split(' ')
    .map(
      (token) =>
        TOKEN_ALIASES.get(token) ??
        token
    )
    .join(' ');
}


/*
 * ============================================================
 * ZIP HELPERS
 * ============================================================
 */

function normalizePostalCode(value) {
  const text =
    String(value ?? '').trim();

  const match =
    text.match(/^(\d{5})/);

  return match
    ? match[1]
    : null;
}


function increment(map, key) {
  map.set(
    key,
    (map.get(key) ?? 0) + 1
  );
}


function postalCodeCounts(records) {
  const counts =
    new Map();

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
  comparisonSet
) {
  const zipValues =
    records
      .map(
        (record) =>
          normalizePostalCode(
            record.postal_code
          )
      )
      .filter(Boolean);

  if (zipValues.length === 0) {
    return null;
  }

  const matching =
    zipValues.filter(
      (zip5) =>
        comparisonSet.has(zip5)
    ).length;

  return matching /
    zipValues.length;
}


/*
 * ============================================================
 * STRING DISTANCE
 * ============================================================
 */

function levenshteinDistance(a, b) {
  const left =
    String(a);

  const right =
    String(b);

  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous =
    Array.from(
      { length: right.length + 1 },
      (_, index) => index
    );

  const current =
    new Array(
      right.length + 1
    );


  for (
    let i = 1;
    i <= left.length;
    i += 1
  ) {
    current[0] = i;

    for (
      let j = 1;
      j <= right.length;
      j += 1
    ) {
      const substitutionCost =
        left[i - 1] ===
        right[j - 1]
          ? 0
          : 1;

      current[j] =
        Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] +
            substitutionCost
        );
    }

    for (
      let j = 0;
      j <= right.length;
      j += 1
    ) {
      previous[j] =
        current[j];
    }
  }

  return previous[
    right.length
  ];
}


function similarityScore(a, b) {
  const left =
    compactText(a);

  const right =
    compactText(b);

  const maxLength =
    Math.max(
      left.length,
      right.length
    );

  if (maxLength === 0) {
    return 1;
  }

  const distance =
    levenshteinDistance(
      left,
      right
    );

  return (
    1 -
    distance / maxLength
  );
}


/*
 * ============================================================
 * NAME RELATIONSHIP
 *
 * The result describes WHY two city labels were considered
 * similar enough to review.
 * ============================================================
 */

function nameRelationship(
  leftName,
  rightName
) {
  const leftNormalized =
    normalizeText(
      leftName
    );

  const rightNormalized =
    normalizeText(
      rightName
    );

  const leftCompact =
    compactText(
      leftName
    );

  const rightCompact =
    compactText(
      rightName
    );

  const leftAlias =
    aliasSignature(
      leftName
    );

  const rightAlias =
    aliasSignature(
      rightName
    );


  /*
   * Different source strings, but punctuation/casing
   * normalization produces the same value.
   */

  if (
    leftNormalized ===
    rightNormalized
  ) {
    return {
      type:
        'formatting-equivalent',

      editDistance:
        0,

      similarity:
        1,
    };
  }


  /*
   * Examples:
   *
   * Winter Park / Winterpark
   * Sugar Land  / Sugarland
   */

  if (
    leftCompact ===
    rightCompact
  ) {
    return {
      type:
        'spacing-equivalent',

      editDistance:
        0,

      similarity:
        1,
    };
  }


  /*
   * Examples:
   *
   * Saint Paul / St. Paul
   * Fort Worth / Ft. Worth
   */

  if (
    leftAlias ===
    rightAlias
  ) {
    return {
      type:
        'abbreviation-equivalent',

      editDistance:
        levenshteinDistance(
          leftCompact,
          rightCompact
        ),

      similarity:
        similarityScore(
          leftName,
          rightName
        ),
    };
  }


  const editDistance =
    levenshteinDistance(
      leftCompact,
      rightCompact
    );

  const similarity =
    similarityScore(
      leftName,
      rightName
    );


  /*
   * Examples this may catch:
   *
   * Southold / Southhold
   * Portland / Portlando
   */

  if (
    editDistance === 1 &&
    similarity >= 0.84
  ) {
    return {
      type:
        'one-edit-neighbor',

      editDistance,
      similarity,
    };
  }


  /*
   * A slightly wider net for manual review.
   */

  if (
    editDistance === 2 &&
    similarity >= 0.88
  ) {
    return {
      type:
        'two-edit-neighbor',

      editDistance,
      similarity,
    };
  }


  return null;
}


/*
 * ============================================================
 * GEO HELPERS
 * ============================================================
 */

function distanceMiles(a, b) {
  const toRadians =
    (degrees) =>
      degrees *
      Math.PI /
      180;

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
    Math.sin(
      deltaLat / 2
    ) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(
        deltaLng / 2
      ) ** 2;

  return (
    2 *
    earthRadiusMiles *
    Math.asin(
      Math.sqrt(
        haversine
      )
    )
  );
}


function centroid(records) {
  const valid =
    records.filter(
      (record) =>
        Number.isFinite(
          record._geoloc?.lat
        ) &&
        Number.isFinite(
          record._geoloc?.lng
        )
    );


  if (valid.length === 0) {
    return null;
  }


  return {
    lat:
      valid.reduce(
        (sum, record) =>
          sum +
          record._geoloc.lat,
        0
      ) /
      valid.length,

    lng:
      valid.reduce(
        (sum, record) =>
          sum +
          record._geoloc.lng,
        0
      ) /
      valid.length,
  };
}


/*
 * ============================================================
 * GENERAL HELPERS
 * ============================================================
 */

function compareStrings(a, b) {
  return String(a)
    .localeCompare(
      String(b),
      'en-US'
    );
}


function mapToSortedEntries(map) {
  return [...map.entries()]
    .sort(
      (
        [aKey, aCount],
        [bKey, bCount]
      ) =>
        bCount - aCount ||
        compareStrings(
          aKey,
          bKey
        )
    )
    .map(
      ([value, count]) => ({
        value,
        count,
      })
    );
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
 * LOAD DATASET
 * ============================================================
 */

const contents =
  await readFile(
    CLEANED_RECORDS_PATH,
    'utf8'
  );


const records =
  JSON.parse(
    contents
  );


if (!Array.isArray(records)) {
  throw new Error(
    'Expected restaurants_cleaned.json to contain an array.'
  );
}


/*
 * ============================================================
 * BUILD CITY / STATE ENTITIES
 *
 * A city name is only compared with other city names in the
 * SAME state.
 *
 * This avoids false similarities such as:
 *
 * Highlands, NJ
 * Highlands neighborhood in Denver, CO
 * ============================================================
 */

const cityEntities =
  new Map();


for (const record of records) {
  const city =
    String(
      record.city ?? ''
    ).trim();

  const state =
    String(
      record.state ?? ''
    ).trim();


  if (!city || !state) {
    continue;
  }


  const key =
    `${state}\u0000${city}`;


  if (
    !cityEntities.has(
      key
    )
  ) {
    cityEntities.set(
      key,
      {
        city,
        state,
        records: [],
      }
    );
  }


  cityEntities
    .get(key)
    .records
    .push(record);
}


const entitiesByState =
  new Map();


for (
  const entity
  of cityEntities.values()
) {
  if (
    !entitiesByState.has(
      entity.state
    )
  ) {
    entitiesByState.set(
      entity.state,
      []
    );
  }


  entitiesByState
    .get(entity.state)
    .push(entity);
}


/*
 * ============================================================
 * CANDIDATE GENERATION
 * ============================================================
 */

const candidates = [];


for (
  const [
    state,
    stateEntities,
  ]
  of entitiesByState.entries()
) {
  for (
    let i = 0;
    i < stateEntities.length;
    i += 1
  ) {
    for (
      let j = i + 1;
      j < stateEntities.length;
      j += 1
    ) {
      const left =
        stateEntities[i];

      const right =
        stateEntities[j];


      const relationship =
        nameRelationship(
          left.city,
          right.city
        );


      if (!relationship) {
        continue;
      }


      /*
       * Postal evidence
       */

      const leftZipSet =
        postalCodeSet(
          left.records
        );

      const rightZipSet =
        postalCodeSet(
          right.records
        );

      const overlappingZipSet =
        intersection(
          leftZipSet,
          rightZipSet
        );


      const leftZipOverlapShare =
        postalRecordOverlapShare(
          left.records,
          rightZipSet
        );


      const rightZipOverlapShare =
        postalRecordOverlapShare(
          right.records,
          leftZipSet
        );


      /*
       * Geographic evidence
       */

      const leftCentroid =
        centroid(
          left.records
        );

      const rightCentroid =
        centroid(
          right.records
        );


      const centroidDistanceMiles =
        leftCentroid &&
        rightCentroid
          ? distanceMiles(
              leftCentroid,
              rightCentroid
            )
          : null;


      /*
       * Area evidence
       */

      const leftAreas =
        new Set(
          left.records
            .map(
              (record) =>
                record.area
            )
            .filter(Boolean)
        );


      const rightAreas =
        new Set(
          right.records
            .map(
              (record) =>
                record.area
            )
            .filter(Boolean)
        );


      const overlappingAreas =
        intersection(
          leftAreas,
          rightAreas
        );


      const hasZipOverlap =
        overlappingZipSet.size > 0;

      const hasAreaOverlap =
        overlappingAreas.size > 0;


      /*
       * ======================================================
       * REVIEW PRIORITY
       *
       * This is NOT a correction rule.
       *
       * "high" means:
       * the name relationship is strong AND geographic/postal
       * context provides supporting evidence.
       * ======================================================
       */

      let reviewPriority =
        'review';


      const strongNameRelationship =
        [
          'formatting-equivalent',
          'spacing-equivalent',
          'abbreviation-equivalent',
        ].includes(
          relationship.type
        );


      const probableTypoRelationship =
        relationship.type ===
          'one-edit-neighbor';


      if (
        hasAreaOverlap &&
        (
          hasZipOverlap ||
          (
            centroidDistanceMiles !==
              null &&
            centroidDistanceMiles <=
              2
          )
        ) &&
        (
          strongNameRelationship ||
          probableTypoRelationship
        )
      ) {
        reviewPriority =
          'high';
      } else if (
        hasAreaOverlap &&
        (
          hasZipOverlap ||
          (
            centroidDistanceMiles !==
              null &&
            centroidDistanceMiles <=
              10
          )
        )
      ) {
        reviewPriority =
          'medium';
      }


      candidates.push({
        state,

        reviewPriority,

        relationship: {
          type:
            relationship.type,

          editDistance:
            relationship.editDistance,

          similarity:
            Number(
              relationship
                .similarity
                .toFixed(4)
            ),

          leftNormalized:
            normalizeText(
              left.city
            ),

          rightNormalized:
            normalizeText(
              right.city
            ),

          leftAliasSignature:
            aliasSignature(
              left.city
            ),

          rightAliasSignature:
            aliasSignature(
              right.city
            ),
        },


        left: {
          city:
            left.city,

          records:
            left.records.length,

          zip5Counts:
            mapToSortedEntries(
              postalCodeCounts(
                left.records
              )
            ),

          areas:
            [...leftAreas]
              .sort(
                compareStrings
              ),

          examples:
            left.records
              .slice(0, 5)
              .map(
                compactRecord
              ),
        },


        right: {
          city:
            right.city,

          records:
            right.records.length,

          zip5Counts:
            mapToSortedEntries(
              postalCodeCounts(
                right.records
              )
            ),

          areas:
            [...rightAreas]
              .sort(
                compareStrings
              ),

          examples:
            right.records
              .slice(0, 5)
              .map(
                compactRecord
              ),
        },


        evidence: {
          overlappingZip5:
            [...overlappingZipSet]
              .sort(
                compareStrings
              ),

          hasExactZipOverlap:
            hasZipOverlap,

          leftRecordZipOverlapShare:
            leftZipOverlapShare ===
              null
              ? null
              : Number(
                  leftZipOverlapShare
                    .toFixed(4)
                ),

          rightRecordZipOverlapShare:
            rightZipOverlapShare ===
              null
              ? null
              : Number(
                  rightZipOverlapShare
                    .toFixed(4)
                ),

          centroidDistanceMiles:
            centroidDistanceMiles ===
              null
              ? null
              : Number(
                  centroidDistanceMiles
                    .toFixed(2)
                ),

          overlappingAreas:
            [...overlappingAreas]
              .sort(
                compareStrings
              ),

          hasAreaOverlap,
        },
      });
    }
  }
}


/*
 * ============================================================
 * SORT CANDIDATES
 * ============================================================
 */

const priorityOrder = {
  high: 0,
  medium: 1,
  review: 2,
};


const relationshipOrder = {
  'formatting-equivalent': 0,
  'spacing-equivalent': 1,
  'abbreviation-equivalent': 2,
  'one-edit-neighbor': 3,
  'two-edit-neighbor': 4,
};


candidates.sort(
  (a, b) =>
    priorityOrder[
      a.reviewPriority
    ] -
      priorityOrder[
        b.reviewPriority
      ] ||

    relationshipOrder[
      a.relationship.type
    ] -
      relationshipOrder[
        b.relationship.type
      ] ||

    a.relationship.editDistance -
      b.relationship.editDistance ||

    (
      a.evidence
        .centroidDistanceMiles ??
      Number.POSITIVE_INFINITY
    ) -
      (
        b.evidence
          .centroidDistanceMiles ??
        Number.POSITIVE_INFINITY
      ) ||

    compareStrings(
      a.left.city,
      b.left.city
    )
);


/*
 * ============================================================
 * SUMMARY COUNTS
 * ============================================================
 */

const relationshipCounts =
  new Map();


for (const candidate of candidates) {
  increment(
    relationshipCounts,
    candidate.relationship.type
  );
}



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

    uniqueCityStateEntities:
      cityEntities.size,

    states:
      entitiesByState.size,

    candidatePairs:
      candidates.length,

    highPriorityCandidates:
      candidates.filter(
        (candidate) =>
          candidate.reviewPriority ===
          'high'
      ).length,

    mediumPriorityCandidates:
      candidates.filter(
        (candidate) =>
          candidate.reviewPriority ===
          'medium'
      ).length,

    reviewOnlyCandidates:
      candidates.filter(
        (candidate) =>
          candidate.reviewPriority ===
          'review'
      ).length,

    candidatesByRelationship:
      mapToSortedEntries(
        relationshipCounts
      ),
  },


  interpretationNotes: [
    'The profiler compares city labels only within the same state.',

    'The script does not modify any records.',

    'ZIP+4 values are reduced to ZIP5 only for comparison.',

    'Common geographic abbreviations such as Saint/St., Fort/Ft., and Mount/Mt. are normalized only to generate review candidates.',

    'Spacing-equivalent candidates include patterns such as Winter Park versus Winterpark.',

    'One-edit and two-edit candidates are intended to expose probable spelling errors such as Southold versus Southhold or Portland versus Portlando.',

    'ZIP overlap, area agreement, and geographic proximity are supporting evidence only.',

    'reviewPriority must not be used as an automatic canonicalization rule.',

    'The profiler deliberately does not choose which member of a pair should become the canonical city value.',
  ],


  candidates,
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
 * CONSOLE SUMMARY
 * ============================================================
 */

console.log(
  '\nLOCATION ALIAS / TYPO PROFILE'
);

console.log(
  '============================='
);

console.log(
  `Input: ${CLEANED_RECORDS_PATH}`
);

console.log(
  `Records: ${report.baseline.records}`
);

console.log(
  `Unique city/state entities: ` +
  `${report.baseline.uniqueCityStateEntities}`
);

console.log(
  `Candidate pairs: ` +
  `${report.baseline.candidatePairs}`
);

console.log(
  `High-priority candidates: ` +
  `${report.baseline.highPriorityCandidates}`
);

console.log(
  `Medium-priority candidates: ` +
  `${report.baseline.mediumPriorityCandidates}`
);

console.log(
  `Review-only candidates: ` +
  `${report.baseline.reviewOnlyCandidates}`
);


console.log(
  '\nCandidates by relationship'
);

console.log(
  '--------------------------'
);


for (
  const item
  of report.baseline
    .candidatesByRelationship
) {
  console.log(
    `${item.value}: ${item.count}`
  );
}


/*
 * ============================================================
 * HIGH + MEDIUM REVIEW OUTPUT
 * ============================================================
 */

console.log(
  '\nHigh / medium review candidates'
);

console.log(
  '-------------------------------'
);


const importantCandidates =
  candidates.filter(
    (candidate) =>
      candidate.reviewPriority !==
      'review'
  );


for (
  const candidate
  of importantCandidates
) {
  const zipOverlap =
    candidate.evidence
      .overlappingZip5
      .join(', ') ||
    'none';

  const areaOverlap =
    candidate.evidence
      .overlappingAreas
      .join(', ') ||
    'none';

  console.log(
    `${candidate.left.city} <-> ${candidate.right.city} | ` +
    `state=${candidate.state} | ` +
    `priority=${candidate.reviewPriority} | ` +
    `relationship=${candidate.relationship.type} | ` +
    `records=${candidate.left.records}/${candidate.right.records} | ` +
    `edit-distance=${candidate.relationship.editDistance} | ` +
    `similarity=${Math.round(candidate.relationship.similarity * 100)}% | ` +
    `ZIP-overlap=${zipOverlap} | ` +
    `distance=${candidate.evidence.centroidDistanceMiles ?? 'n/a'} mi | ` +
    `area=${areaOverlap}`
  );
}


/*
 * ============================================================
 * TOP REVIEW-ONLY CASES
 * ============================================================
 */

console.log(
  '\nTop review-only name similarities'
);

console.log(
  '---------------------------------'
);


for (
  const candidate
  of candidates
    .filter(
      (candidate) =>
        candidate.reviewPriority ===
        'review'
    )
    .slice(0, 20)
) {
  console.log(
    `${candidate.left.city} <-> ${candidate.right.city} | ` +
    `state=${candidate.state} | ` +
    `relationship=${candidate.relationship.type} | ` +
    `ZIP-overlap=${candidate.evidence.overlappingZip5.join(', ') || 'none'} | ` +
    `distance=${candidate.evidence.centroidDistanceMiles ?? 'n/a'} mi`
  );
}


console.log(
  '\nFull report written to:'
);

console.log(
  REPORT_OUTPUT
);