import { getSearchClient } from '../algolia/client.js'
import { getAlgoliaConfig } from '../config/env.js'


/*
 * Fields retrieved from restaurant records when resolving
 * location suggestions.
 */
const LOCATION_ATTRIBUTES = [
  'city',
  'state',
  'area',
  'neighborhood',
]


/*
 * The Location input has a different purpose from the main
 * restaurant/cuisine input.
 *
 * Restricting the query to location attributes prevents restaurant
 * names or cuisines from consuming location-autocomplete hits.
 */
const LOCATION_SEARCH_ATTRIBUTES = [
  'city',
  'area',
  'neighborhood',
  'state',
]


function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
}


/*
 * Used only for comparing location values.
 *
 * This does not modify the indexed data.
 */
function sameLocationValue(left, right) {
  const normalizedLeft = normalize(left)
  const normalizedRight = normalize(right)

  return (
    normalizedLeft !== '' &&
    normalizedLeft === normalizedRight
  )
}


/*
 * Return a simple match rank for a location value.
 *
 * 0 = exact
 * 1 = starts with the query
 * 2 = query occurs at a word/location boundary
 *
 * null = no useful match
 */
function locationMatchRank(value, query) {
  const candidate = normalize(value)
  const needle = normalize(query)

  if (!candidate || !needle) {
    return null
  }

  if (candidate === needle) {
    return 0
  }

  if (candidate.startsWith(needle)) {
    return 1
  }

  if (
    candidate.includes(` ${needle}`) ||
    candidate.includes(`/${needle}`) ||
    candidate.includes(`/ ${needle}`) ||
    candidate.includes(`- ${needle}`)
  ) {
    return 2
  }

  return null
}


function addCandidate(map, candidate) {
  /*
   * Location identity is based on type + geographic context,
   * not on the restaurant that produced the hit.
   *
   * Normalizing the key also prevents harmless case differences
   * from producing duplicate suggestions.
   */
  const key = [
    normalize(candidate.type),
    normalize(candidate.value),
    normalize(candidate.stateCode),
    normalize(candidate.city),
  ].join('|')

  const existing = map.get(key)

  if (existing) {
    existing.count += 1

    if (
      candidate.matchRank <
      existing.matchRank
    ) {
      existing.matchRank =
        candidate.matchRank
    }

    return
  }

  map.set(key, {
    ...candidate,
    count: 1,
  })
}


function suggestionsFromHits(hits, query) {
  const candidates = new Map()

  hits.forEach((hit) => {
    const city =
      String(hit.city ?? '').trim()

    const stateCode =
      String(hit.state ?? '').trim()

    const area =
      String(hit.area ?? '').trim()

    const neighborhood =
      String(hit.neighborhood ?? '').trim()


    /*
     * ----------------------------------------------------------
     * CITY
     * ----------------------------------------------------------
     */

    const cityMatchRank =
      locationMatchRank(city, query)

    if (cityMatchRank !== null) {
      addCandidate(candidates, {
        type: 'city',
        value: city,
        stateCode,
        city,
        label: stateCode
          ? `${city}, ${stateCode}`
          : city,
        meta: 'City',
        matchRank: cityMatchRank,
      })
    }


    /*
     * ----------------------------------------------------------
     * AREA
     * ----------------------------------------------------------
     */

    const areaMatchRank =
      locationMatchRank(area, query)

    if (areaMatchRank !== null) {
      addCandidate(candidates, {
        type: 'area',
        value: area,
        stateCode: null,
        city: null,
        label: area,
        meta: 'Area',
        matchRank: areaMatchRank,
      })
    }


    /*
     * ----------------------------------------------------------
     * NEIGHBORHOOD
     * ----------------------------------------------------------
     *
     * Many records use the city name again as the neighborhood.
     *
     * Example:
     *
     *   city: Scottsdale
     *   neighborhood: Scottsdale
     *
     * That does not provide the user with a second meaningful
     * geographic choice, so it should not become:
     *
     *   Scottsdale, AZ
     *   Scottsdale · Scottsdale, AZ
     *
     * This is a presentation rule only. The restaurant record
     * itself is not modified.
     */

    const redundantNeighborhood =
      sameLocationValue(
        neighborhood,
        city
      )

    if (!redundantNeighborhood) {
      const neighborhoodMatchRank =
        locationMatchRank(
          neighborhood,
          query
        )

      if (
        neighborhoodMatchRank !== null
      ) {
        addCandidate(candidates, {
          type: 'neighborhood',
          value: neighborhood,
          stateCode,
          city,
          label: city
            ? (
              `${neighborhood} · ` +
              `${city}` +
              `${stateCode
                ? `, ${stateCode}`
                : ''}`
            )
            : neighborhood,
          meta: 'Neighborhood',
          matchRank:
            neighborhoodMatchRank,
        })
      }
    }
  })


  /*
   * Broad geographic scopes appear before narrower ones.
   *
   * Within the same type:
   *   1. better text match
   *   2. locations represented by more restaurant records
   *   3. alphabetical tie-breaker
   */
  const typePriority = {
    city: 0,
    area: 1,
    neighborhood: 2,
  }


  return [...candidates.values()]
    .sort((a, b) => {
      const typeDiff =
        typePriority[a.type] -
        typePriority[b.type]

      if (typeDiff !== 0) {
        return typeDiff
      }

      const matchDiff =
        a.matchRank -
        b.matchRank

      if (matchDiff !== 0) {
        return matchDiff
      }

      const countDiff =
        b.count -
        a.count

      if (countDiff !== 0) {
        return countDiff
      }

      return a.label.localeCompare(
        b.label
      )
    })
    .slice(0, 8)
}


export function createLocationController(store) {
  let requestSequence = 0


  async function searchLocations(query) {
    const trimmed =
      String(query ?? '').trim()

    const sequence =
      ++requestSequence


    /*
     * Avoid sending extremely broad single-character
     * location searches.
     */
    if (trimmed.length < 2) {
      store.setState((state) => ({
        ...state,

        location: {
          ...state.location,
          status: 'idle',
          suggestions: [],
          error: null,
        },
      }))

      return
    }


    store.setState((state) => ({
      ...state,

      location: {
        ...state.location,
        status: 'searching',
        error: null,
      },
    }))


    try {
      const client =
        getSearchClient()

      const { indexName } =
        getAlgoliaConfig()


      const response =
        await client.searchSingleIndex({
          indexName,

          searchParams: {
            query: trimmed,

            /*
             * We are still using the restaurant index, but the
             * autocomplete query is limited to location fields.
             */
            restrictSearchableAttributes:
              LOCATION_SEARCH_ATTRIBUTES,

            hitsPerPage: 100,

            attributesToRetrieve:
              LOCATION_ATTRIBUTES,

            /*
             * Keep location candidate generation conservative.
             * The cleaned dataset already resolves the known
             * spelling/alias inconsistencies.
             */
            typoTolerance: false,
          },
        })


      /*
       * Ignore stale responses when the user types again before
       * the previous Algolia request completes.
       */
      if (
        sequence !== requestSequence
      ) {
        return
      }


      store.setState((state) => ({
        ...state,

        location: {
          ...state.location,
          status: 'idle',

          suggestions:
            suggestionsFromHits(
              response.hits ?? [],
              trimmed
            ),

          error: null,
        },
      }))
    } catch (error) {
      if (
        sequence !== requestSequence
      ) {
        return
      }


      store.setState((state) => ({
        ...state,

        location: {
          ...state.location,
          status: 'error',
          suggestions: [],

          error:
            error instanceof Error
              ? error.message
              : (
                'Location suggestions ' +
                'could not be loaded.'
              ),
        },
      }))
    }
  }


  return {
    searchLocations,
  }
}