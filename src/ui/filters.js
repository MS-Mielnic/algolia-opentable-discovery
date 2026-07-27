import { escapeHtml } from '../utils/escaping.js'

export const POPULAR_CUISINES = [
  'Italian',
  'American',
  'Steakhouse',
  'Seafood',
  'French',
  'Japanese',
]

function unique(values) {
  return [...new Set(values)]
}

function getCuisineCatalog(state) {
  return unique([
    ...POPULAR_CUISINES,
    ...state.facets.cuisines.map((item) => item.value),
    ...state.filters.cuisines,
  ]).sort((a, b) => a.localeCompare(b))
}

function renderCuisineCheckbox(value, state) {
  return `
    <label class="filter-option">
      <input
        type="checkbox"
        data-filter-cuisine
        value="${escapeHtml(value)}"
        ${state.filters.cuisines.includes(value) ? 'checked' : ''}
      />
      <span>${escapeHtml(value)}</span>
    </label>
  `
}

function renderCuisineOptions(state) {
  const selected = [...state.filters.cuisines].sort((a, b) =>
    a.localeCompare(b),
  )
  const catalog = getCuisineCatalog(state)
  const query = state.ui.cuisineQuery.trim().toLocaleLowerCase()

  let available = catalog.filter((value) => !selected.includes(value))

  if (query) {
    available = available.filter((value) =>
      value.toLocaleLowerCase().includes(query),
    )
  } else if (!state.ui.cuisineExpanded) {
    available = POPULAR_CUISINES.filter(
      (value) => !selected.includes(value),
    )
  }

  const selectedSection =
    selected.length > 0
      ? `
        <div class="facet-selection-section">
          <span class="facet-section-label">Selected</span>
          ${selected.map((value) => renderCuisineCheckbox(value, state)).join('')}
        </div>
      `
      : ''

  const availableSection =
    available.length > 0
      ? `
        <div class="facet-selection-section">
          ${
            selected.length > 0
              ? `<span class="facet-section-label">${
                  query ? 'Matches' : 'More cuisines'
                }</span>`
              : ''
          }
          ${available.map((value) => renderCuisineCheckbox(value, state)).join('')}
        </div>
      `
      : query
        ? '<p class="facet-empty">No additional cuisines match that search.</p>'
        : ''

  return selectedSection + availableSection
}

function filterCount(state) {
  return (
    state.filters.cuisines.length +
    state.filters.diningStyles.length +
    state.filters.priceTiers.length +
    state.filters.paymentMethods.length +
    (state.filters.minimumRating === null ? 0 : 1)
  )
}

function syncCuisineLists(state) {
  document.querySelectorAll('[data-cuisine-options]').forEach((container) => {
    container.innerHTML = renderCuisineOptions(state)
  })

  document.querySelectorAll('[data-cuisine-search]').forEach((input) => {
    if (input.value !== state.ui.cuisineQuery) {
      input.value = state.ui.cuisineQuery
    }
  })

  document.querySelectorAll('[data-view-all-cuisines]').forEach((button) => {
    button.textContent = state.ui.cuisineExpanded ? 'Show less' : 'View all'
  })
}

function syncDiningStyles(state) {
  document.querySelectorAll('[data-filter-dining-style]').forEach((input) => {
    input.checked = state.filters.diningStyles.includes(input.value)
  })
}
function syncPaymentMethods(state) {
  document.querySelectorAll('[data-filter-payment]').forEach((input) => {
    input.checked = state.filters.paymentMethods.includes(input.value)
  })
}

function syncRating(state) {
  document.querySelectorAll('[data-filter-rating]').forEach((button) => {
    const rating = Number(button.dataset.filterRating)
    button.setAttribute(
      'aria-pressed',
      String(state.filters.minimumRating === rating),
    )
  })
}

function syncPrice(state) {
  document.querySelectorAll('[data-filter-price]').forEach((button) => {
    const tier = Number(button.dataset.filterPrice)
    button.setAttribute(
      'aria-pressed',
      String(state.filters.priceTiers.includes(tier)),
    )
  })
}

function syncDiscoveryChips(state) {
  document.querySelectorAll('[data-discovery-chip]').forEach((button) => {
    button.setAttribute(
      'aria-pressed',
      String(state.filters.cuisines.includes(button.dataset.cuisine)),
    )
  })
}

function syncFeaturedDiscovery(state) {
  const button = document.querySelector('[data-hidden-gems]')

  if (!button) return

  const isActive =
    state.discoveryMode === 'hidden-gems'

  button.setAttribute(
    'aria-pressed',
    String(isActive),
  )
}

function syncFilterSummary(state) {
  const count = filterCount(state)

  document.querySelectorAll('[data-active-filter-count]').forEach((element) => {
    element.textContent = `${count} active`
  })

  document.querySelectorAll('[data-clear-filters]').forEach((button) => {
    button.disabled = count === 0
  })

  document.querySelectorAll('[data-show-results]').forEach((button) => {
    const countLabel = new Intl.NumberFormat('en-US').format(state.search.nbHits)
    button.textContent =
      state.search.status === 'success'
        ? `Show ${countLabel} restaurants`
        : 'Show restaurants'
  })
}

function activeFilterPill(label, attribute, value = '') {
  return `
    <button
      class="active-filter-pill"
      type="button"
      ${attribute}="${escapeHtml(value)}"
      aria-label="Remove ${escapeHtml(label)} filter"
    >
      <span>${escapeHtml(label)}</span>
      <span aria-hidden="true">×</span>
    </button>
  `
}

function syncActiveFilters(state) {
  const container = document.querySelector('[data-active-filters]')
  if (!container) return

  const pills = [
    ...state.filters.cuisines.map((value) =>
      activeFilterPill(value, 'data-remove-cuisine', value),
    ),
    ...state.filters.diningStyles.map((value) =>
      activeFilterPill(value, 'data-remove-dining-style', value),
    ),
    ...state.filters.paymentMethods.map((value) =>
      activeFilterPill(value, 'data-remove-payment', value),
    ),
    ...(state.filters.minimumRating === null
      ? []
      : [
          activeFilterPill(
            state.filters.minimumRating == 4.7
              ? 'Exceptional · 4.7+'
              : 'Top rated · 4.5+',
            'data-remove-rating',
            String(state.filters.minimumRating),
          ),
        ]),
    ...state.filters.priceTiers.map((value) =>
      activeFilterPill(
        '$'.repeat(value),
        'data-remove-price',
        String(value),
      ),
    ),
    ...(state.location.mode === 'near-me'
      ? [
          activeFilterPill(
            `Near me · ${state.location.radiusMiles} mi`,
            'data-clear-location',
            'true',
          ),
        ]
      : []),
  ]

  container.hidden = pills.length === 0
  container.innerHTML =
    pills.length === 0
      ? ''
      : `
        <span class="active-filter-label">Active</span>
        ${pills.join('')}
        ${
          filterCount(state) > 1
            ? '<button class="clear-active-filters" type="button" data-clear-filters>Clear refinements</button>'
            : ''
        }
      `
}


export function renderControlsState(state) {
  syncCuisineLists(state)
  syncDiningStyles(state)
  syncPaymentMethods(state)
  syncRating(state)
  syncPrice(state)
  syncDiscoveryChips(state)
  syncFeaturedDiscovery(state)
  syncFilterSummary(state)
  syncActiveFilters(state)
  
}
