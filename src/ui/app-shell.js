import { POPULAR_CUISINES } from './filters.js'

const diningStyles = [
  'Casual Dining',
  'Casual Elegant',
  'Fine Dining',
  'Home Style',
]

function icon(name) {
  const paths = {
    search:
      '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>',
    location:
      '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle>',
    sliders:
      '<path d="M4 7h10"></path><path d="M18 7h2"></path><circle cx="16" cy="7" r="2"></circle><path d="M4 17h2"></path><path d="M10 17h10"></path><circle cx="8" cy="17" r="2"></circle>',
    chevron:
      '<path d="m9 18 6-6-6-6"></path>',
    close:
      '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    star:
      '<path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z"></path>',
    compass:
      '<circle cx="12" cy="12" r="9"></circle><path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z"></path>',
  }

  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`
}

function renderCuisineChips() {
  return POPULAR_CUISINES
    .map(
      (cuisine) => `
        <button
          class="discovery-chip"
          type="button"
          aria-pressed="false"
          data-discovery-chip
          data-cuisine="${cuisine}"
        >
          ${cuisine}
        </button>
      `,
    )
    .join('')
}

function renderInitialCuisineOptions() {
  return POPULAR_CUISINES
    .map(
      (cuisine) => `
        <label class="filter-option">
          <input type="checkbox" data-filter-cuisine value="${cuisine}" />
          <span>${cuisine}</span>
        </label>
      `,
    )
    .join('')
}

function renderDiningStyles() {
  return diningStyles
    .map(
      (style) => `
        <label class="filter-option">
          <input
            type="checkbox"
            data-filter-dining-style
            value="${style}"
          />
          <span>${style}</span>
        </label>
      `,
    )
    .join('')
}

function renderSkeletonCards() {
  return Array.from({ length: 6 }, () => `
    <article class="restaurant-card skeleton-card" aria-hidden="true">
      <div class="card-image skeleton-block"></div>
      <div class="card-body">
        <div class="skeleton-line skeleton-line-short"></div>
        <div class="skeleton-line skeleton-line-title"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-line-medium"></div>
        <div class="card-actions">
          <div class="skeleton-button"></div>
          <div class="skeleton-button skeleton-button-primary"></div>
        </div>
      </div>
    </article>
  `).join('')
}

function renderFilterPanel({ mobile = false } = {}) {
  return `
    <div class="filter-panel ${mobile ? 'filter-panel-mobile' : ''}">
      <div class="filter-group">
        <div class="filter-heading-row">
          <h3>Cuisine</h3>
          <button
            class="text-button"
            type="button"
            data-view-all-cuisines
          >
            View all
          </button>
        </div>

        <label class="facet-search">
          <span class="sr-only">Search cuisines</span>
          ${icon('search')}
          <input
            type="search"
            placeholder="Search cuisines"
            data-cuisine-search
            autocomplete="off"
          />
        </label>

        <div
          class="filter-options filter-options-scroll"
          data-cuisine-options
        >
          ${renderInitialCuisineOptions()}
        </div>
      </div>

      <div class="filter-group">
        <h3>Dining style</h3>
        <div class="filter-options">
          ${renderDiningStyles()}
        </div>
      </div>

      <div class="filter-group">
        <h3>Rating</h3>
        <div class="segmented-control" aria-label="Minimum rating">
          <button
            type="button"
            aria-pressed="false"
            data-filter-rating="4.5"
          >
            <span>Top rated</span>
            <small>4.5+</small>
          </button>

          <button
            type="button"
            aria-pressed="false"
            data-filter-rating="4.7"
          >
            <span>Exceptional</span>
            <small>4.7+</small>
          </button>
        </div>
      </div>

      <div class="filter-group">
        <h3>Price</h3>
        <div class="segmented-control price-control" aria-label="Price tier">
          <button type="button" aria-pressed="false" data-filter-price="2">$$</button>
          <button type="button" aria-pressed="false" data-filter-price="3">$$$</button>
          <button type="button" aria-pressed="false" data-filter-price="4">$$$$</button>
        </div>
      </div>

      <div class="filter-group">
        <h3>Payment method</h3>

        <div class="filter-options">
          <label class="filter-option">
            <input
              type="checkbox"
              data-filter-payment
              value="Visa"
            />
            <span>Visa</span>
          </label>

          <label class="filter-option">
            <input
              type="checkbox"
              data-filter-payment
              value="MasterCard"
            />
            <span>MasterCard</span>
          </label>

          <label class="filter-option">
            <input
              type="checkbox"
              data-filter-payment
              value="AMEX"
            />
            <span>AMEX</span>
          </label>

          <label class="filter-option">
            <input
              type="checkbox"
              data-filter-payment
              value="Discover"
            />
            <span>Discover</span>
          </label>

          <label class="filter-option">
            <input
              type="checkbox"
              data-filter-payment
              value="Cash Only"
            />
            <span>Cash Only</span>
          </label>
        </div>

        <details class="payment-more">
          <summary>More payment methods</summary>

          <div class="filter-options payment-more-options">
            <label class="filter-option">
              <input
                type="checkbox"
                data-filter-payment
                value="Diners Club"
              />
              <span>Diners Club</span>
            </label>

            <label class="filter-option">
              <input
                type="checkbox"
                data-filter-payment
                value="JCB"
              />
              <span>JCB</span>
            </label>

            <label class="filter-option">
              <input
                type="checkbox"
                data-filter-payment
                value="Carte Blanche"
              />
              <span>Carte Blanche</span>
            </label>

            <label class="filter-option">
              <input
                type="checkbox"
                data-filter-payment
                value="Pay with OpenTable"
              />
              <span>Pay with OpenTable</span>
            </label>
          </div>
        </details>
      </div>
      <button
        class="clear-filters"
        type="button"
        data-clear-filters
        disabled
      >
        Clear all filters
      </button>
    </div>
  `
}

export function renderAppShell() {
  return `
    <div class="app-shell">
      <header class="site-header">
        <a class="brand" href="/" aria-label="Restaurant discovery home">
          <span class="brand-mark" aria-hidden="true">${icon('compass')}</span>
          <span>
            <strong>OpenTable</strong>
            <small>Discovery prototype</small>
          </span>
        </a>
      </header>

      <main>
        <section class="hero-section" aria-labelledby="page-title">
          <div class="hero-copy">
            <p class="eyebrow">DISCOVER · REFINE · EXPLORE · BOOK</p>
            <h1 id="page-title">Find your next bite.</h1>
            <p>
              Search for a restaurant you know, or explore somewhere new by
              cuisine, location, rating, price and what matters to you.
            </p>
          </div>

          <form class="search-panel" role="search">
            <label class="search-field search-field-primary">
              <span class="sr-only">Search restaurants</span>
              ${icon('search')}
              <input
                id="search-input"
                type="search"
                autocomplete="off"
                placeholder="Search restaurants or cuisines"
              />
            </label>

            <div class="search-divider" aria-hidden="true"></div>

            <div class="location-combobox">
              <label class="location-field" for="location-input">
                ${icon('location')}
                <span>
                  <small>Location</small>
                  <input
                    id="location-input"
                    type="search"
                    autocomplete="off"
                    placeholder="City, area, or neighborhood"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="location-suggestions"
                    aria-expanded="false"
                  />
                </span>
              </label>

              <div
                id="location-suggestions"
                class="location-suggestions"
                role="listbox"
                hidden
              ></div>
            </div>

            <button class="search-submit" type="submit">Search</button>
          </form>

          <div class="search-support-row">
            <span id="location-status">
              Set a location to establish the discovery starting point, or use
              your current location.
            </span>
            <button
              class="text-button clear-location-button"
              type="button"
              data-clear-location
              hidden
            >
              Clear location
            </button>
          </div>
        </section>
        
        <section class="discovery-section" aria-labelledby="discovery-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">START EXPLORING</p>
              <h2 id="discovery-title">What are you in the mood for?</h2>
            </div>
            <p>Popular starting points from the restaurant catalog.</p>
          </div>

          <div class="discovery-chips">
            ${renderCuisineChips()}
            <button
              class="discovery-chip discovery-chip-more"
              type="button"
              data-more-cuisines
            >
              More cuisines
              ${icon('chevron')}
            </button>
          </div>

          <div class="featured-discovery-wrap">
            <button
              class="featured-discovery"
              type="button"
              aria-pressed="false"
              data-hidden-gems
            >
              <span class="featured-discovery-mark" aria-hidden="true">✦</span>

              <span class="featured-discovery-copy">
                <small>DISCOVER SOMETHING NEW</small>
                <strong id="hidden-gems-title">Hidden gems</strong>
                <span>Exceptional ratings · But still a secret</span>
              </span>

              <span class="featured-discovery-action">
                Explore →
              </span>
            </button>
          </div>
        </section>

        <section class="results-section" aria-labelledby="results-title">
          <div class="mobile-results-toolbar">
            <button
              id="open-filters"
              class="mobile-filter-button"
              type="button"
              aria-controls="filter-drawer"
              aria-expanded="false"
            >
              ${icon('sliders')}
              Filters
            </button>
          </div>

          <div
            class="active-filters-bar"
            data-active-filters
            hidden
            aria-label="Active refinements"
          ></div>

          <div class="results-layout">
            <aside class="desktop-filters" aria-label="Restaurant filters">
              <div class="filters-title-row">
                <h2>Refine</h2>
                <span data-active-filter-count>0 active</span>
              </div>
              ${renderFilterPanel()}
            </aside>

            <div class="results-content">
              <div class="results-header">
                <div>
                  <p class="eyebrow">RESULTS</p>
                  <h2 id="results-title">Restaurants to explore</h2>
                  <p class="results-summary" aria-live="polite">
                    Loading restaurant recommendations…
                  </p>
                </div>

                <div class="results-header-actions">
                <div
                  class="results-view-toggle"
                  role="group"
                  aria-label="Results view"
                >
                  <button
                    type="button"
                    aria-pressed="true"
                    data-results-view="list"
                  >
                    List
                  </button>

                  <button
                    type="button"
                    aria-pressed="false"
                    data-results-view="map"
                  >
                    Map
                  </button>
                </div>

                <div
                  class="results-context-label"
                  aria-label="Recommended ranking, balanced for rating and review confidence"
                >
                  <strong>Recommended</strong>
                  <span>Rating + review confidence</span>
                </div>
              </div>
            </div>  

            <div
              id="results-grid"
              class="results-grid"
              aria-busy="true"
              aria-live="polite"
            >
              ${renderSkeletonCards()}
            </div>
            <div
              id="results-map"
              class="results-map"
              aria-live="polite"
              hidden
            >
              <div class="map-placeholder">
                <strong>Map view</strong>
                <span>The matching restaurants will appear here geographically.</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <div id="filter-backdrop" class="filter-backdrop" hidden></div>

      <aside
        id="filter-drawer"
        class="filter-drawer"
        data-open="false"
        aria-label="Restaurant filters"
      >
        <div class="drawer-header">
          <div>
            <p class="eyebrow">REFINE RESULTS</p>
            <h2>
              Filters
              <small data-active-filter-count>0 active</small>
            </h2>
          </div>
          <button
            id="close-filters"
            class="icon-button"
            type="button"
            aria-label="Close filters"
          >
            ${icon('close')}
          </button>
        </div>

        <div class="drawer-content">
          ${renderFilterPanel({ mobile: true })}
        </div>

        <div class="drawer-footer">
          <button
            class="secondary-button"
            type="button"
            data-clear-filters
            disabled
          >
            Clear all
          </button>
          <button
            class="primary-button"
            type="button"
            data-show-results
          >
            Show restaurants
          </button>
        </div>
      </aside>
    </div>
  `
}
