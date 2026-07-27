import { escapeHtml } from '../utils/escaping.js'
import {
  formatDistance,
  formatInteger,
  formatLocation,
  formatRating,
} from '../utils/formatting.js'
import { renderRestaurantMap } from './map.js'

function renderSkeletonCards(count = 6) {
  return Array.from({ length: count }, () => `
    <article class="restaurant-card skeleton-card" aria-hidden="true">
      <div class="card-image skeleton-block"></div>
      <div class="card-body">
        <div class="skeleton-line skeleton-line-short"></div>
        <div class="skeleton-line skeleton-line-title"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-line-medium"></div>
        <div class="card-actions">
        <div class="skeleton-button skeleton-button-primary"></div>
        </div>
      </div>
    </article>
  `).join('')
}

function renderRestaurantCard(hit) {
  const name = escapeHtml(hit.name || 'Restaurant')
  const cuisine = escapeHtml(hit.food_type || 'Restaurant')
  const diningStyle = escapeHtml(hit.dining_style || '')
  const location = escapeHtml(formatLocation(hit))
  const address = escapeHtml(hit.address || '')
  const priceTier = escapeHtml(hit.price_tier_label || '')
  const startingPrice = escapeHtml(hit.starting_price_range || '')
  const rating = formatRating(hit.stars_count)
  const reviews = formatInteger(hit.reviews_count)
  const distance = formatDistance(hit._rankingInfo?.geoDistance)
  const monogram = escapeHtml((hit.name || 'R').trim().charAt(0).toUpperCase())
  const reserveUrl = escapeHtml(hit.reserve_url || '')

  return `
    <article class="restaurant-card result-card" data-object-id="${escapeHtml(hit.objectID)}">
      <div class="restaurant-visual" aria-hidden="true">
        <span>${monogram}</span>
        <small>${cuisine}</small>
      </div>

      <div class="card-body">
        <div class="card-kicker-row">
          <span class="cuisine-label">${cuisine}</span>
          ${priceTier ? `<span class="price-label">${priceTier}</span>` : ''}
        </div>

        <h3>${name}</h3>

        <div class="rating-row" aria-label="${rating} stars from ${reviews} reviews">
          <span class="rating-star" aria-hidden="true">★</span>
          <strong>${rating}</strong>
          <span aria-hidden="true">·</span>
          <span>${reviews} reviews</span>
        </div>

        <p class="restaurant-location">${location || 'Location not available'}</p>
        ${address ? `<p class="restaurant-address">${address}</p>` : ''}

        <div class="restaurant-meta">
          ${diningStyle ? `<span>${diningStyle}</span>` : ''}
          ${startingPrice ? `<span>Starts at ${startingPrice}</span>` : ''}
          ${distance ? `<span>${escapeHtml(distance)} away</span>` : ''}
        </div>

        <div class="card-actions">
          ${
            reserveUrl
              ? `
                <a
                  class="primary-card-button booking-button"
                  href="${reserveUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Book a table at ${name}"
                >
                  Book table
                </a>
              `
              : `
                <button
                  class="primary-card-button booking-button"
                  type="button"
                  disabled
                >
                  Booking unavailable
                </button>
              `
          }
        </div>
      </div>
    </article>
  `
}

function hasFilters(filters) {
  return (
    filters.cuisines.length > 0 ||
    filters.diningStyles.length > 0 ||
    filters.minimumRating !== null ||
    filters.priceTiers.length > 0 ||
    filters.paymentMethods.length > 0
  )
}

function buildResultsSummary(state) {
  const {
    query,
    filters,
    location,
    search,
    discoveryMode,
  } = state

  const count = formatInteger(search.nbHits)
  const text = query.trim()
  const hiddenGems =
    discoveryMode === 'hidden-gems'

  const singleCuisine =
    filters.cuisines.length === 1
      ? filters.cuisines[0]
      : null

  if (search.usedGeoFallback) {
    return `No matches were found within ${location.radiusMiles} miles. Showing ${count} broader results with the same search and refinements.`
  }

  if (location.mode === 'near-me') {
    if (text) {
      return hiddenGems
        ? `${count} nearby hidden gems for “${text}” within ${location.radiusMiles} miles.`
        : `${count} nearby results for “${text}” within ${location.radiusMiles} miles.`
    }

    return hiddenGems
      ? `${count} hidden gems within ${location.radiusMiles} miles of your location.`
      : `${count} restaurants match within ${location.radiusMiles} miles of your location.`
  }

  if (location.mode === 'selected') {
    if (text) {
      return hiddenGems
        ? `${count} hidden gems for “${text}” in ${location.label}.`
        : `${count} results for “${text}” in ${location.label}.`
    }

    if (hiddenGems) {
      return singleCuisine
        ? `${count} ${singleCuisine} hidden gems in ${location.label}.`
        : `${count} hidden gems in ${location.label}.`
    }

    return `${count} restaurants in ${location.label}.`
  }

  if (text) {
    return hiddenGems
      ? `${count} hidden gems for “${text}”.`
      : `${count} results for “${text}” in ${search.processingTimeMS} ms.`
  }

  if (hiddenGems) {
    return singleCuisine
      ? `${count} ${singleCuisine} hidden gems to explore.`
      : `${count} hidden gems to explore.`
  }

  if (hasFilters(filters)) {
    return `${count} restaurants match your active refinements.`
  }

  return `${count} restaurants to explore.`
}

function buildEmptyState(state) {
  const query = state.query.trim()
  const { filters, location, discoveryMode } = state

  const singleCuisine =
    filters.cuisines.length === 1
      ? filters.cuisines[0]
      : null

  if (
    discoveryMode === 'hidden-gems' &&
    location.mode === 'near-me'
  ) {
    return {
      title: 'No hidden gems nearby',
      summary: singleCuisine
        ? `We couldn’t find ${singleCuisine} hidden gems within ${location.radiusMiles} miles.`
        : `We couldn’t find hidden gems within ${location.radiusMiles} miles.`,
      message: singleCuisine
        ? `Try all ${singleCuisine} restaurants nearby or explore another cuisine.`
        : 'Try all restaurants nearby or explore another cuisine.',
    }
  }

  if (
    discoveryMode === 'hidden-gems' &&
    location.mode === 'selected'
  ) {
    return {
      title: `No hidden gems in ${location.label}`,
      summary: singleCuisine
        ? `We couldn’t find ${singleCuisine} hidden gems matching these preferences in ${location.label}.`
        : `We couldn’t find hidden gems matching these preferences in ${location.label}.`,
      message: singleCuisine
        ? `Try all ${singleCuisine} restaurants in ${location.label} or adjust another preference.`
        : `Try all restaurants in ${location.label} or adjust another preference.`,
    }
  }

  if (location.mode === 'near-me') {
    return {
      title: 'Nothing matched nearby',
      summary: `We couldn’t find restaurants matching these preferences within ${location.radiusMiles} miles.`,
      message:
        'Try a different cuisine, price, rating, dining style, or payment option.',
    }
  }

  if (query) {
    return {
      title: `We couldn’t find “${query}”`,
      summary:
        'Check the spelling or try another restaurant or cuisine.',
      message:
        'You can also change the location or adjust your preferences.',
    }
  }

  if (location.mode === 'selected') {
    return {
      title: `No restaurants matched in ${location.label}`,
      summary: `We couldn’t find restaurants matching these preferences in ${location.label}.`,
      message:
        'Try changing the cuisine, price, rating, dining style, or payment option.',
    }
  }

  return {
    title: 'No restaurants matched these preferences',
    summary:
      'We couldn’t find restaurants matching everything you selected.',
    message:
      'Try changing the cuisine, price, rating, dining style, or payment option.',
  }
}

export function renderSearchState(state) {
  const grid = document.querySelector('#results-grid')
  const map = document.querySelector('#results-map')
  const summary = document.querySelector('.results-summary')
  const resultsTitle = document.querySelector('#results-title')
  const viewButtons =
    document.querySelectorAll('[data-results-view]')

  if (!grid || !map || !summary || !resultsTitle) return

  const mapActive =
    state.ui.resultsView === 'map'

  grid.hidden = mapActive
  map.hidden = !mapActive
  
  if (mapActive) {
  renderRestaurantMap(state)
  }

  viewButtons.forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(
        button.dataset.resultsView ===
          state.ui.resultsView,
      ),
    )
  })

  grid.setAttribute('aria-busy', String(state.search.status === 'loading'))

  if (state.search.status === 'loading' && state.search.hits.length === 0) {
    summary.textContent = 'Loading restaurant recommendations…'
    grid.innerHTML = renderSkeletonCards()
    return
  }

  if (state.search.status === 'error') {
    resultsTitle.textContent = 'Search setup needed'
    summary.textContent = 'The restaurant index could not be reached.'
    grid.innerHTML = `
      <div class="results-message results-error" role="alert">
        <h3>Search could not be completed</h3>
        <p>${escapeHtml(state.search.error)}</p>
      </div>
    `
    return
  }

  if (state.search.status === 'success' && state.search.hits.length === 0) {
    const emptyState = buildEmptyState(state)

    resultsTitle.textContent = emptyState.title
    summary.textContent = emptyState.summary

    grid.innerHTML = `
      <div class="results-message">
        <h3>${escapeHtml(emptyState.title)}</h3>
        <p>${escapeHtml(emptyState.message)}</p>
      </div>
    `

    return
  }

  if (state.search.status === 'success') {
    resultsTitle.textContent = state.query.trim()
      ? 'Search results'
      : 'Restaurants to explore'

    const baseSummary = buildResultsSummary(state)

    const mapCoverageMessage =
      mapActive &&
      state.search.nbHits > state.search.mapHits.length
        ? ` Map showing ${formatInteger(
            state.search.mapHits.length,
          )} of ${formatInteger(
            state.search.nbHits,
          )} matching restaurants.`
        : ''

    summary.textContent =
      `${baseSummary}${mapCoverageMessage}`

    grid.innerHTML = state.search.hits
      .map(renderRestaurantCard)
      .join('')
  }
}
