import { getSearchClient } from '../algolia/client.js'
import { buildSearchRequest } from '../algolia/query-builder.js'
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

      let usedGeoFallback = false

      // Near Me is an explicit proximity request. If the radius produces no
      // matches, keep the user's text and refinements but widen only geo.
      if (state.location.mode === 'near-me' && response.nbHits === 0) {
        response = await client.searchSingleIndex({
          indexName,
          searchParams: buildSearchRequest(state, { omitGeo: true }),
        })
        usedGeoFallback = true
      }

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
          nbHits: response.nbHits ?? 0,
          processingTimeMS: response.processingTimeMS ?? 0,
          error: null,
          usedGeoFallback,
        },
      }))
    } catch (error) {
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
