import { getSearchClient } from '../algolia/client.js'
import {
  buildMapSearchRequest,
  buildSearchRequest,
} from '../algolia/query-builder.js'
import { getAlgoliaConfig } from '../config/env.js'

function mergeCuisineCatalog(existingCatalog, response) {
  const counts = response.facets?.food_type ?? {}
  const merged = new Map(
    existingCatalog.map((item) => [item.value, item.count ?? 0]),
  )

  Object.entries(counts).forEach(([value, count]) => {
    merged.set(value, Math.max(merged.get(value) ?? 0, count))
  })

  return [...merged.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value))
}

export function createSearchController(store) {
  let requestSequence = 0

  async function executeSearch() {
    const sequence = ++requestSequence

    store.setState((state) => ({
      ...state,
      search: {
        ...state.search,
        status: 'loading',
        error: null,
        usedGeoFallback: false,
        usedTextFallback: false,
      },
    }))

    try {
      const state = store.getState()
      const client = getSearchClient()
      const { indexName } = getAlgoliaConfig()

      let response = await client.searchSingleIndex({
        indexName,
        searchParams: buildSearchRequest(state),
      })

      if (sequence !== requestSequence) return

      let usedTextFallback = false

      if (
        state.query.trim().length > 0 &&
        (response.nbHits ?? 0) === 0
      ) {
        const fallbackResponse = await client.searchSingleIndex({
          indexName,
          searchParams: buildSearchRequest(state, {
            useAllSearchableAttributes: true,
          }),
        })

        if (sequence !== requestSequence) return

        if ((fallbackResponse.nbHits ?? 0) > 0) {
          response = fallbackResponse
          usedTextFallback = true
        }
      }

      const usedGeoFallback = false

      const mapResponse = await client.searchSingleIndex({
        indexName,
        searchParams: buildMapSearchRequest(state, {
          omitGeo: usedGeoFallback,
          useAllSearchableAttributes: usedTextFallback,
        }),
      })
      //test
      //console.log(
      //  `List hits: ${response.hits?.length ?? 0} | Map hits: ${mapResponse.hits?.length ?? 0} | Total matches: ${response.nbHits ?? 0}`,
      //) 
      if (sequence !== requestSequence) return

      store.setState((currentState) => ({
        ...currentState,
        facets: {
          ...currentState.facets,
          cuisines: mergeCuisineCatalog(
            currentState.facets.cuisines,
            response,
          ),
        },
        search: {
          status: 'success',
          hits: response.hits ?? [],
          mapHits: mapResponse.hits ?? [],//broader geogrphic results while state.search.hits still have the 12 top listed cards
          nbHits: response.nbHits ?? 0,
          processingTimeMS: response.processingTimeMS ?? 0,
          error: null,
          usedGeoFallback,
          usedTextFallback,
        },
      }))
    } catch (error) {
      //console.error('Search execution failed:', error)
      if (sequence !== requestSequence) return

      store.setState((state) => ({
        ...state,
        search: {
          ...state.search,
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'The restaurant search could not be completed.',
        },
      }))
    }
  }

  return {
    executeSearch,
  }
}
