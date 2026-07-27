import fs from 'node:fs'
import path from 'node:path'

import {
  CLEANED_RECORDS_PATH,
  GENERATED_DIR,
} from '../lib/project-paths.js'


const TOP_RATED_THRESHOLD = 4.5
const EXCEPTIONAL_THRESHOLD = 4.7

/*
 * Candidate review-count ceilings evaluated before choosing
 * the Hidden Gems definition.
 */
const REVIEW_LIMITS = [100, 200, 208, 300]

/*
 * Final discovery rule selected from the observed distribution.
 */
const HIDDEN_GEMS_REVIEW_LIMIT = 200

const REPORT_PATH = path.join(
  GENERATED_DIR,
  'hidden-gems-analysis.md',
)


function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) {
    return null
  }

  const index = Math.floor(
    (sortedValues.length - 1) * percentileValue,
  )

  return sortedValues[index]
}


function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b)

  if (sorted.length === 0) {
    return {
      restaurants: 0,
      min: null,
      p10: null,
      p25: null,
      median: null,
      p75: null,
      p90: null,
      max: null,
    }
  }

  return {
    restaurants: sorted.length,
    min: sorted[0],
    p10: percentile(sorted, 0.10),
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.50),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.90),
    max: sorted[sorted.length - 1],
  }
}


function formatDistribution(stats) {
  return [
    `Restaurants: ${stats.restaurants}`,
    `Minimum reviews: ${stats.min}`,
    `P10: ${stats.p10}`,
    `P25: ${stats.p25}`,
    `Median: ${stats.median}`,
    `P75: ${stats.p75}`,
    `P90: ${stats.p90}`,
    `Maximum reviews: ${stats.max}`,
  ].join('\n')
}


function percentage(part, total) {
  if (!total) {
    return '0.0'
  }

  return ((part / total) * 100).toFixed(1)
}


function main() {
  if (!fs.existsSync(CLEANED_RECORDS_PATH)) {
    throw new Error(
      `Cleaned restaurant file not found: ${CLEANED_RECORDS_PATH}`,
    )
  }

  const records = JSON.parse(
    fs.readFileSync(CLEANED_RECORDS_PATH, 'utf8'),
  )

  if (!Array.isArray(records)) {
    throw new Error(
      'Expected cleaned restaurant data to contain an array.',
    )
  }


  /*
   * ----------------------------------------------------------
   * Top-rated population: 4.5+
   * ----------------------------------------------------------
   */

  const topRatedRecords = records.filter(
    (record) =>
      Number(record.stars_count) >= TOP_RATED_THRESHOLD,
  )

  const topRatedReviews = topRatedRecords.map(
    (record) => Number(record.reviews_count),
  )

  const topRatedDistribution = distribution(
    topRatedReviews,
  )


  /*
   * ----------------------------------------------------------
   * Exceptional population: 4.7+
   * ----------------------------------------------------------
   */

  const exceptionalRecords = records.filter(
    (record) =>
      Number(record.stars_count) >= EXCEPTIONAL_THRESHOLD,
  )

  const exceptionalReviews = exceptionalRecords.map(
    (record) => Number(record.reviews_count),
  )

  const exceptionalDistribution = distribution(
    exceptionalReviews,
  )


  /*
   * ----------------------------------------------------------
   * Candidate review ceilings
   * ----------------------------------------------------------
   */

  const candidateResults = REVIEW_LIMITS.map(
    (reviewLimit) => {
      const matches = exceptionalRecords.filter(
        (record) =>
          Number(record.reviews_count) <= reviewLimit,
      ).length

      return {
        reviewLimit,
        matches,
        share: percentage(
          matches,
          exceptionalRecords.length,
        ),
      }
    },
  )


  /*
   * ----------------------------------------------------------
   * Final Hidden Gems pool
   * ----------------------------------------------------------
   */

  const hiddenGems = exceptionalRecords.filter(
    (record) =>
      Number(record.reviews_count) <=
      HIDDEN_GEMS_REVIEW_LIMIT,
  )

  const hiddenGemShare = percentage(
    hiddenGems.length,
    exceptionalRecords.length,
  )


  /*
   * ----------------------------------------------------------
   * Console evidence
   * ----------------------------------------------------------
   */

  console.log('\n==========================================')
  console.log('HIDDEN GEMS DISCOVERY ANALYSIS')
  console.log('==========================================')

  console.log('\nDataset')
  console.log(`Restaurants: ${records.length}`)

  console.log(
    `\nTop-rated population (${TOP_RATED_THRESHOLD}+ stars)`,
  )

  console.log(
    formatDistribution(topRatedDistribution),
  )

  console.log(
    `\nExceptional population (${EXCEPTIONAL_THRESHOLD}+ stars)`,
  )

  console.log(
    formatDistribution(exceptionalDistribution),
  )

  console.log(
    '\nExceptional restaurants by review-count ceiling',
  )

  candidateResults.forEach(
    ({ reviewLimit, matches, share }) => {
      console.log(
        `Reviews <= ${reviewLimit}: ` +
        `${matches} restaurants (${share}% of 4.7+ population)`,
      )
    },
  )

  console.log('\nSelected Hidden Gems rule')
  console.log(
    `stars_count >= ${EXCEPTIONAL_THRESHOLD}`,
  )
  console.log(
    `reviews_count <= ${HIDDEN_GEMS_REVIEW_LIMIT}`,
  )

  console.log(
    `Matching restaurants: ${hiddenGems.length}`,
  )

  console.log(
    `Share of exceptional restaurants: ${hiddenGemShare}%`,
  )


  /*
   * ----------------------------------------------------------
   * Saved analysis report
   * ----------------------------------------------------------
   */

  const candidateTable = candidateResults
    .map(
      ({ reviewLimit, matches, share }) =>
        `| <= ${reviewLimit} | ${matches} | ${share}% |`,
    )
    .join('\n')

  const report = `# Hidden Gems Discovery Analysis

## Purpose

Evaluate whether the restaurant dataset supports a discovery mechanism
for highly rated restaurants that have accumulated less review exposure.

This mechanism is intentionally separate from the normal Recommended
ranking.

The standard result ordering continues to use Bayesian quality and review
confidence. Hidden Gems provides an additional discovery path for restaurants
that may not rank as highly under that default because they have fewer reviews.

---

## Dataset

Cleaned restaurant records analyzed: **${records.length}**

Source:

\`${CLEANED_RECORDS_PATH}\`

---

## Top-rated restaurant population

Definition:

\`stars_count >= ${TOP_RATED_THRESHOLD}\`

Restaurants: **${topRatedDistribution.restaurants}**

| Review-count statistic | Value |
|---|---:|
| Minimum | ${topRatedDistribution.min} |
| P10 | ${topRatedDistribution.p10} |
| P25 | ${topRatedDistribution.p25} |
| Median | ${topRatedDistribution.median} |
| P75 | ${topRatedDistribution.p75} |
| P90 | ${topRatedDistribution.p90} |
| Maximum | ${topRatedDistribution.max} |

The 25th percentile is approximately **${topRatedDistribution.p25} reviews**.

This provides evidence that a review ceiling near 200 represents relatively
low accumulated review exposure among otherwise highly rated restaurants.

---

## Exceptional restaurant population

Definition:

\`stars_count >= ${EXCEPTIONAL_THRESHOLD}\`

Restaurants: **${exceptionalDistribution.restaurants}**

| Review-count statistic | Value |
|---|---:|
| Minimum | ${exceptionalDistribution.min} |
| P10 | ${exceptionalDistribution.p10} |
| P25 | ${exceptionalDistribution.p25} |
| Median | ${exceptionalDistribution.median} |
| P75 | ${exceptionalDistribution.p75} |
| P90 | ${exceptionalDistribution.p90} |
| Maximum | ${exceptionalDistribution.max} |

The median exceptional restaurant has **${exceptionalDistribution.median} reviews**.

---

## Review ceiling evaluation

The following thresholds were tested against restaurants rated
${EXCEPTIONAL_THRESHOLD}+:

| Review ceiling | Matching restaurants | Share of exceptional population |
|---|---:|---:|
${candidateTable}

---

## Decision

The initial **Hidden Gems** definition is:

\`\`\`
stars_count >= ${EXCEPTIONAL_THRESHOLD}
AND
reviews_count <= ${HIDDEN_GEMS_REVIEW_LIMIT}
\`\`\`

This produces:

**${hiddenGems.length} restaurants**

or approximately:

**${hiddenGemShare}% of the exceptional-rated population**

### Why this threshold was selected

The decision is based on the observed dataset rather than an arbitrary review
count.

- ${TOP_RATED_THRESHOLD}+ restaurants have a P25 review count of approximately
  ${topRatedDistribution.p25}.
- The median ${EXCEPTIONAL_THRESHOLD}+ restaurant has
  ${exceptionalDistribution.median} reviews.
- A ceiling of ${HIDDEN_GEMS_REVIEW_LIMIT} is therefore clearly below typical
  review exposure while remaining close to the lower quartile observed in the
  broader highly rated population.
- It produces ${hiddenGems.length} candidates, which is large enough to support
  cuisine, location, price, and other refinements without making the discovery
  pool too broad.

---

## Product interpretation

Hidden Gems should not replace the default Recommended ranking.

### Recommended

Uses the existing Bayesian ranking to prioritize restaurants using both rating
quality and accumulated review confidence.

### Hidden Gems

Creates a separate discovery entry point for restaurants with exceptional raw
ratings but comparatively less accumulated review exposure.

The initial rule is data-driven:

\`\`\`
stars_count >= ${EXCEPTIONAL_THRESHOLD}
reviews_count <= ${HIDDEN_GEMS_REVIEW_LIMIT}
\`\`\`

The same discovery surface could later support explicitly curated campaigns
such as cuisine spotlights, seasonal events, or neighborhood promotions.
Those would be merchandising decisions rather than rules inferred from this
dataset.

---

## Reproducibility

This report is generated by:

\`scripts/data_exploration/profile-hidden-gems.js\`

Re-running the profiler recalculates all distributions and candidate counts
from the current cleaned dataset and overwrites this report.
`

  fs.mkdirSync(GENERATED_DIR, {
    recursive: true,
  })

  fs.writeFileSync(
    REPORT_PATH,
    report,
    'utf8',
  )

  console.log('\nAnalysis report saved:')
  console.log(REPORT_PATH)
  console.log()
}


try {
  main()
} catch (error) {
  console.error(
    '\nHidden Gems profiling failed:',
    error instanceof Error
      ? error.message
      : error,
  )

  process.exitCode = 1
}