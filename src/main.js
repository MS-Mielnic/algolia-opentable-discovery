import './style.css'
import { createSearchController } from './search/search-controller.js'
import { createLocationController } from './search/location-controller.js'
import { requestBrowserLocation } from './search/geolocation.js'
import { createAppStore } from './state/app-state.js'
import { renderAppShell } from './ui/app-shell.js'
import { renderControlsState } from './ui/filters.js'
import { renderLocationState } from './ui/location.js'
import { renderSearchState } from './ui/results.js'
import { debounce } from './utils/debounce.js'

const app = document.querySelector('#app')

if (!app) {
  throw new Error('Application root element "#app" was not found.')
}

app.innerHTML = renderAppShell()

const store = createAppStore()
const searchController = createSearchController(store)
const locationController = createLocationController(store)

store.subscribe((state) => {
  renderSearchState(state)
  renderControlsState(state)
  renderLocationState(state)
})

const searchForm = document.querySelector('.search-panel')
const searchInput = document.querySelector('#search-input')
const locationInput = document.querySelector('#location-input')
const filterDrawer = document.querySelector('#filter-drawer')
const filterBackdrop = document.querySelector('#filter-backdrop')
const openFiltersButton = document.querySelector('#open-filters')
const closeFiltersButton = document.querySelector('#close-filters')

function setFilterDrawer(open) {
  if (!filterDrawer || !filterBackdrop || !openFiltersButton) return

  filterDrawer.dataset.open = String(open)
  filterBackdrop.hidden = !open
  openFiltersButton.setAttribute('aria-expanded', String(open))
  document.body.classList.toggle('drawer-open', open)

  if (open) {
    closeFiltersButton?.focus()
  } else {
    openFiltersButton.focus()
  }
}

function setQuery(query) {
  store.setState((state) => ({
    ...state,
    query,
  }))
}

function toggleArrayValue(values, value) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value]
}

function runSearch() {
  searchController.executeSearch()
}

function clearFilters() {
  store.setState((state) => ({
    ...state,
    filters: {
      cuisines: [],
      diningStyles: [],
      minimumRating: null,
      priceTiers: [],
      paymentMethods: [],
    },
    ui: {
      ...state.ui,
      cuisineQuery: '',
    },
  }))
  runSearch()
}

function clearLocation({ focus = false } = {}) {
  store.setState((state) => ({
    ...state,
    location: {
      ...state.location,
      mode: 'none',
      status: 'idle',
      type: null,
      value: null,
      stateCode: null,
      city: null,
      label: '',
      inputValue: '',
      suggestions: [],
      latitude: null,
      longitude: null,
      error: null,
    },
    ui: {
      ...state.ui,
      locationOpen: false,
    },
  }))

  if (locationInput) locationInput.value = ''
  runSearch()

  if (focus) locationInput?.focus()
}

function selectLocation(button) {
  const type = button.dataset.locationType
  const value = button.dataset.locationValue
  const label = button.dataset.locationLabel
  const stateCode = button.dataset.locationState || null
  const city = button.dataset.locationCity || null

  store.setState((state) => ({
    ...state,
    location: {
      ...state.location,
      mode: 'selected',
      status: 'active',
      type,
      value,
      stateCode,
      city,
      label,
      inputValue: label,
      suggestions: [],
      latitude: null,
      longitude: null,
      error: null,
    },
    ui: {
      ...state.ui,
      locationOpen: false,
    },
  }))

  if (locationInput) locationInput.value = label
  runSearch()
}

async function activateNearMe() {
  const currentState = store.getState()

  if (currentState.location.status === 'locating') return

  store.setState((state) => ({
    ...state,
    location: {
      ...state.location,
      status: 'locating',
      error: null,
    },
    ui: {
      ...state.ui,
      locationOpen: true,
    },
  }))

  try {
    const { latitude, longitude } = await requestBrowserLocation()

    store.setState((state) => ({
      ...state,
      location: {
        ...state.location,
        mode: 'near-me',
        status: 'active',
        type: null,
        value: null,
        stateCode: null,
        city: null,
        label: 'Near me',
        inputValue: 'Near me',
        suggestions: [],
        latitude,
        longitude,
        error: null,
      },
      ui: {
        ...state.ui,
        locationOpen: false,
      },
    }))

    if (locationInput) locationInput.value = 'Near me'
    runSearch()
  } catch (error) {
    store.setState((state) => ({
      ...state,
      location: {
        ...state.location,
        mode: 'none',
        status: 'error',
        latitude: null,
        longitude: null,
        error:
          error instanceof Error
            ? error.message
            : 'Your location could not be determined.',
      },
      ui: {
        ...state.ui,
        locationOpen: true,
      },
    }))
  }
}

const runDebouncedSearch = debounce(runSearch, 250)
const runDebouncedLocationSearch = debounce(
  (query) => locationController.searchLocations(query),
  180,
)

searchInput?.addEventListener('input', (event) => {
  setQuery(event.currentTarget.value)
  runDebouncedSearch()
})

locationInput?.addEventListener('focus', () => {
  const current = store.getState()

  // Focusing an already-selected location keeps the selection intact until
  // the user actually edits the text.
  store.setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      locationOpen:
        state.location.mode === 'none',
    },
  }))

  if (current.location.mode === 'none') {
    runDebouncedLocationSearch(locationInput.value)
  }
})

locationInput?.addEventListener('input', (event) => {
  const value = event.currentTarget.value

  store.setState((state) => ({
    ...state,
    location: {
      ...state.location,
      mode: 'none',
      status: 'idle',
      type: null,
      value: null,
      stateCode: null,
      city: null,
      label: '',
      inputValue: value,
      suggestions: [],
      latitude: null,
      longitude: null,
      error: null,
    },
    ui: {
      ...state.ui,
      locationOpen: true,
    },
  }))

  runDebouncedLocationSearch(value)
})

searchForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  setQuery(searchInput?.value ?? '')
  runSearch()
})

document.addEventListener('change', (event) => {
  const target = event.target

  if (!(target instanceof HTMLInputElement)) return

  if (target.matches('[data-filter-cuisine]')) {
    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        cuisines: toggleArrayValue(
          state.filters.cuisines,
          target.value,
        ),
      },
    }))
    runSearch()
    return
  }

  if (target.matches('[data-filter-dining-style]')) {
    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        diningStyles: toggleArrayValue(
          state.filters.diningStyles,
          target.value,
        ),
      },
    }))
    runSearch()
    return
  }

  if (target.matches('[data-filter-payment]')) {
    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        paymentMethods: toggleArrayValue(
          state.filters.paymentMethods,
          target.value,
        ),
      },
    }))

    runSearch()
    return
  }
})

document.addEventListener('input', (event) => {
  const target = event.target

  if (
    target instanceof HTMLInputElement &&
    target.matches('[data-cuisine-search]')
  ) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        cuisineQuery: target.value,
        cuisineExpanded: true,
      },
    }))
  }
})

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const locationSuggestion = target.closest('[data-location-suggestion]')
  if (locationSuggestion) {
    selectLocation(locationSuggestion)
    return
  }

  if (target.closest('[data-near-me]')) {
    activateNearMe()
    return
  }

  if (target.closest('[data-clear-location]')) {
    clearLocation({ focus: false })
    return
  }

  const resultsViewButton =
    target.closest('[data-results-view]')

  if (resultsViewButton) {
    const resultsView =
      resultsViewButton.dataset.resultsView

    if (
      resultsView !== 'list' &&
      resultsView !== 'map'
    ) {
      return
    }

    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        resultsView,
      },
    }))

    return
  }
  const hiddenGemsButton =
  target.closest('[data-hidden-gems]')

if (hiddenGemsButton) {
  store.setState((state) => ({
    ...state,

    discoveryMode:
      state.discoveryMode === 'hidden-gems'
        ? null
        : 'hidden-gems',
  }))

  runSearch()
  return
}

  const discoveryChip = target.closest('[data-discovery-chip]')
  if (discoveryChip) {
    const cuisine = discoveryChip.dataset.cuisine

    store.setState((state) => ({
      ...state,
      query: '',
      filters: {
        ...state.filters,
        cuisines: toggleArrayValue(state.filters.cuisines, cuisine),
      },
    }))

    if (searchInput) searchInput.value = ''
    runSearch()
    return
  }

  const ratingButton = target.closest('[data-filter-rating]')
  if (ratingButton) {
    const rating = Number(ratingButton.dataset.filterRating)

    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        minimumRating:
          state.filters.minimumRating === rating ? null : rating,
      },
    }))

    runSearch()
    return
  }

  const priceButton = target.closest('[data-filter-price]')
  if (priceButton) {
    const tier = Number(priceButton.dataset.filterPrice)

    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        priceTiers: toggleArrayValue(state.filters.priceTiers, tier),
      },
    }))

    runSearch()
    return
  }

  const removeCuisine = target.closest('[data-remove-cuisine]')
  if (removeCuisine) {
    const cuisine = removeCuisine.dataset.removeCuisine
    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        cuisines: state.filters.cuisines.filter(
          (value) => value !== cuisine,
        ),
      },
    }))
    runSearch()
    return
  }

  const removeDiningStyle = target.closest('[data-remove-dining-style]')
  if (removeDiningStyle) {
    const diningStyle = removeDiningStyle.dataset.removeDiningStyle
    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        diningStyles: state.filters.diningStyles.filter(
          (value) => value !== diningStyle,
        ),
      },
    }))
    runSearch()
    return
  }

  const removePayment =
  target.closest('[data-remove-payment]')

  if (removePayment) {
    const paymentMethod =
      removePayment.dataset.removePayment

    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        paymentMethods:
          state.filters.paymentMethods.filter(
            (value) => value !== paymentMethod,
          ),
      },
    }))

    runSearch()
    return
  }
  if (target.closest('[data-remove-rating]')) {
    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        minimumRating: null,
      },
    }))
    runSearch()
    return
  }

  const removePrice = target.closest('[data-remove-price]')
  if (removePrice) {
    const tier = Number(removePrice.dataset.removePrice)
    store.setState((state) => ({
      ...state,
      filters: {
        ...state.filters,
        priceTiers: state.filters.priceTiers.filter(
          (value) => value !== tier,
        ),
      },
    }))
    runSearch()
    return
  }

  if (target.closest('[data-clear-filters]')) {
    clearFilters()
    return
  }

  if (target.closest('[data-view-all-cuisines]')) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        cuisineExpanded: !state.ui.cuisineExpanded,
        cuisineQuery: state.ui.cuisineExpanded ? '' : state.ui.cuisineQuery,
      },
    }))
    return
  }

  if (target.closest('[data-more-cuisines]')) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        cuisineExpanded: true,
      },
    }))

    if (window.matchMedia('(max-width: 820px)').matches) {
      setFilterDrawer(true)
    } else {
      document
        .querySelector('.desktop-filters')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      document.querySelector('.desktop-filters [data-cuisine-search]')?.focus()
    }
    return
  }

  if (target.closest('[data-show-results]')) {
    setFilterDrawer(false)
  }

  if (
    !target.closest('.location-combobox') &&
    store.getState().ui.locationOpen
  ) {
    store.setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        locationOpen: false,
      },
    }))
  }
})

openFiltersButton?.addEventListener('click', () => setFilterDrawer(true))
closeFiltersButton?.addEventListener('click', () => setFilterDrawer(false))
filterBackdrop?.addEventListener('click', () => setFilterDrawer(false))

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (filterDrawer?.dataset.open === 'true') {
      setFilterDrawer(false)
    }

    if (store.getState().ui.locationOpen) {
      store.setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          locationOpen: false,
        },
      }))
    }
  }
})

renderControlsState(store.getState())
renderLocationState(store.getState())
searchController.executeSearch()
