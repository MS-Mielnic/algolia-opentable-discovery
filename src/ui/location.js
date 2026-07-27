import { escapeHtml } from '../utils/escaping.js'

function renderSuggestion(suggestion) {
  return `
    <button
      class="location-suggestion"
      type="button"
      role="option"
      data-location-suggestion
      data-location-type="${escapeHtml(suggestion.type)}"
      data-location-value="${escapeHtml(suggestion.value)}"
      data-location-label="${escapeHtml(suggestion.label)}"
      data-location-state="${escapeHtml(suggestion.stateCode ?? '')}"
      data-location-city="${escapeHtml(suggestion.city ?? '')}"
    >
      <span class="location-suggestion-copy">
        <strong>${escapeHtml(suggestion.label)}</strong>
        <small>${escapeHtml(suggestion.meta)}</small>
      </span>
    </button>
  `
}

function nearMeOption(state) {
  const locating = state.location.status === 'locating'

  return `
    <button
      class="location-suggestion location-near-me"
      type="button"
      role="option"
      data-near-me
      ${locating ? 'disabled' : ''}
    >
      <span class="location-near-me-icon" aria-hidden="true">◎</span>
      <span class="location-suggestion-copy">
        <strong>${locating ? 'Finding your location…' : 'Use my current location'}</strong>
        <small>Search within ${state.location.radiusMiles} miles</small>
      </span>
    </button>
  `
}

export function renderLocationState(state) {
  const input = document.querySelector('#location-input')
  const suggestions = document.querySelector('#location-suggestions')
  const status = document.querySelector('#location-status')
  const clearButton = document.querySelector(
    '.search-support-row [data-clear-location]',
  )

  if (!input || !suggestions || !status || !clearButton) return

  const isSelected =
    state.location.mode === 'selected' ||
    state.location.mode === 'near-me'

  clearButton.hidden = !isSelected

  if (document.activeElement !== input) {
    const expectedValue =
      state.location.mode === 'near-me'
        ? 'Near me'
        : state.location.mode === 'selected'
          ? state.location.label
          : state.location.inputValue

    if (input.value !== expectedValue) {
      input.value = expectedValue
    }
  }

  input.classList.toggle('has-location', isSelected)
  input.setAttribute(
    'aria-expanded',
    String(state.ui.locationOpen),
  )

  const shouldShow =
    state.ui.locationOpen &&
    state.location.mode !== 'selected' &&
    state.location.mode !== 'near-me'

  suggestions.hidden = !shouldShow

  if (shouldShow) {
    const body =
      state.location.status === 'searching'
        ? '<p class="location-suggestions-status">Finding locations…</p>'
        : state.location.suggestions.length > 0
          ? state.location.suggestions.map(renderSuggestion).join('')
          : state.location.inputValue.trim().length >= 2
            ? '<p class="location-suggestions-status">No matching location suggestions yet.</p>'
            : '<p class="location-suggestions-status">Type a city, area, or neighborhood.</p>'

    suggestions.innerHTML = `
      ${nearMeOption(state)}
      <div class="location-suggestion-divider"></div>
      ${body}
    `
  }

  if (state.location.status === 'error') {
    status.textContent =
      `${state.location.error} You can still search without a location.`
    return
  }

  if (state.location.mode === 'near-me') {
    status.textContent =
      `Starting point: your current location · within ${state.location.radiusMiles} miles.`
    return
  }

  if (state.location.mode === 'selected') {
    status.textContent = `Starting point: ${state.location.label}.`
    return
  }

  status.textContent =
    'Set a location to establish the discovery starting point, or use your current location.'
}
