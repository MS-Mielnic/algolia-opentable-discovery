const initialState = {
  query: '',
  filters: {
    cuisines: [],
    diningStyles: [],
    minimumRating: null,
    priceTiers: [],
    paymentMethods: [],
  },
  
  location: {
    mode: 'none', // none | selected | near-me
    status: 'idle', // idle | searching | locating | active | error
    type: null, // city | area | neighborhood
    value: null,
    stateCode: null,
    city: null,
    label: '',
    inputValue: '',
    suggestions: [],
    latitude: null,
    longitude: null,
    radiusMiles: 25,
    error: null,
  },
  facets: {
    cuisines: [],
  },
  ui: {
    cuisineQuery: '',
    cuisineExpanded: false,
    locationOpen: false,
    resultsView: 'List', //list | map
  },
  search: {
    status: 'idle',
    hits: [],
    nbHits: 0,
    processingTimeMS: 0,
    error: null,
    usedGeoFallback: false,
  },
}

export function createAppStore() {
  let state = structuredClone(initialState)
  const listeners = new Set()

  function getState() {
    return state
  }

  function setState(updater) {
    const nextState =
      typeof updater === 'function' ? updater(state) : { ...state, ...updater }

    state = nextState
    listeners.forEach((listener) => listener(state))
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    getState,
    setState,
    subscribe,
  }
}
