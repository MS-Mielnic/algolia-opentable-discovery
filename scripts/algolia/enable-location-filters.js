import { algoliasearch } from 'algoliasearch'

const appId = process.env.ALGOLIA_APP_ID
const apiKey = process.env.ALGOLIA_WRITE_API_KEY
const indexName = process.env.ALGOLIA_INDEX_NAME

const missing = [
  ['ALGOLIA_APP_ID', appId],
  ['ALGOLIA_WRITE_API_KEY', apiKey],
  ['ALGOLIA_INDEX_NAME', indexName],
]
  .filter(([, value]) => !value)
  .map(([name]) => name)

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`,
  )
}

const client = algoliasearch(appId, apiKey)

const currentSettings = await client.getSettings({
  indexName,
  getVersion: 2,
})

const currentFacets = (
  currentSettings.attributesForFaceting ?? []
).filter(
  (entry) => entry !== 'filterOnly(payment_options)',
)

const additions = [
  'filterOnly(city)',
  'filterOnly(state)',
  'filterOnly(area)',
  'filterOnly(neighborhood)',
  'filterOnly(reviews_count)',
  'payment_options',
]

const nextFacets = [...currentFacets]

for (const addition of additions) {
  const bareAttribute = addition
    .replace(/^filterOnly\(/, '')
    .replace(/\)$/, '')

  const alreadyConfigured = nextFacets.some((entry) => {
    const configuredAttribute = String(entry)
      .replace(/^searchable\(/, '')
      .replace(/^filterOnly\(/, '')
      .replace(/^afterDistinct\(/, '')
      .replace(/\)+$/, '')

    return configuredAttribute === bareAttribute
  })

  if (!alreadyConfigured) {
    nextFacets.push(addition)
  }
}

console.log('Current attributesForFaceting:')
console.log(currentFacets)

console.log('\nApplying attributesForFaceting:')
console.log(nextFacets)

const response = await client.setSettings({
  indexName,
  indexSettings: {
    attributesForFaceting: nextFacets,
  },
})

console.log('\nSettings update submitted.')
console.log(`Task ID: ${response.taskID}`)
console.log(
  'No searchableAttributes or customRanking settings were changed.',
)
