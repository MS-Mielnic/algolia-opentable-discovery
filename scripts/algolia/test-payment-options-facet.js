import { algoliasearch } from 'algoliasearch'

const appId = process.env.ALGOLIA_APP_ID
const apiKey = process.env.ALGOLIA_WRITE_API_KEY
const indexName = process.env.ALGOLIA_INDEX_NAME

if (!appId || !apiKey || !indexName) {
  throw new Error('Missing Algolia environment variables.')
}

const client = algoliasearch(appId, apiKey)

const response = await client.searchSingleIndex({
  indexName,
  searchParams: {
    query: '',
    hitsPerPage: 0,
    facets: ['payment_options'],
    maxValuesPerFacet: 100,
  },
})

const paymentCounts = response.facets?.payment_options ?? {}

console.log('\nPAYMENT OPTIONS')
console.log('='.repeat(50))

Object.entries(paymentCounts)
  .sort(([a], [b]) => a.localeCompare(b))
  .forEach(([method, count]) => {
    console.log(`${method}: ${count}`)
  })

console.log('='.repeat(50))
console.log(`Unique payment methods: ${Object.keys(paymentCounts).length}`)

const expectedMethods = [
  'AMEX',
  'Carte Blanche',
  'Cash Only',
  'Diners Club',
  'Discover',
  'JCB',
  'MasterCard',
  'Pay with OpenTable',
  'Visa',
]

const actualMethods = Object.keys(paymentCounts).sort()
const expectedSorted = [...expectedMethods].sort()

const matchesExpected =
  JSON.stringify(actualMethods) === JSON.stringify(expectedSorted)

console.log(
  `Expected payment taxonomy: ${matchesExpected ? 'OK' : 'MISMATCH'}`,
)

if (!matchesExpected) {
  console.log('\nExpected:')
  console.log(expectedSorted)

  console.log('\nActual:')
  console.log(actualMethods)

  process.exitCode = 1
}