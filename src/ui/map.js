import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { escapeHtml } from '../utils/escaping.js'
import {
  formatInteger,
  formatRating,
} from '../utils/formatting.js'

let mapInstance = null
let markerLayer = null
let lastMapHits = null

function createMap(container) {
  container.innerHTML = ''

  const map = L.map(container, {
    zoomControl: true,
  })

  L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  ).addTo(map)

  markerLayer = L.layerGroup().addTo(map)

  // Temporary fallback view when there are no matching restaurants.
  map.setView([39.5, -98.35], 4)

  return map
}

function hasValidCoordinates(hit) {
  return (
    Number.isFinite(hit?._geoloc?.lat) &&
    Number.isFinite(hit?._geoloc?.lng)
  )
}

function renderMarkerPopup(hit) {
  const name = escapeHtml(hit.name || 'Restaurant')
  const cuisine = escapeHtml(hit.food_type || 'Restaurant')
  const location = escapeHtml(
    [hit.neighborhood, hit.city, hit.state]
      .filter(Boolean)
      .join(' · '),
  )
  const price = escapeHtml(hit.price_tier_label || '')
  const rating = formatRating(hit.stars_count)
  const reviews = formatInteger(hit.reviews_count)
  const reserveUrl = escapeHtml(hit.reserve_url || '')

  return `
    <div class="map-restaurant-popup">
      <strong>${name}</strong>

      <span>
        ${cuisine}
        ${price ? ` · ${price}` : ''}
      </span>

      <span>
        ★ ${rating} · ${reviews} reviews
      </span>

      ${location ? `<span>${location}</span>` : ''}

      ${
        reserveUrl
          ? `
            <a
              class="map-booking-button"
              href="${reserveUrl}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Book table
            </a>
          `
          : ''
      }
    </div>
  `
}

function renderMarkers(hits) {
  if (!mapInstance || !markerLayer) return

  markerLayer.clearLayers()

  const coordinates = []

  hits.forEach((hit) => {
    if (!hasValidCoordinates(hit)) return

    const { lat, lng } = hit._geoloc
    coordinates.push([lat, lng])

    const marker = L.circleMarker([lat, lng], {
      radius: 6,
      weight: 1,
      fillOpacity: 0.8,
      className: 'restaurant-map-marker',
    })

    marker.bindTooltip(
      escapeHtml(hit.name || 'Restaurant'),
      {
        direction: 'top',
        offset: [0, -4],
      },
    )
    marker.bindPopup(renderMarkerPopup(hit), {
        maxWidth: 280,
        })

    marker.addTo(markerLayer)
  })

  if (coordinates.length === 0) return

  const bounds = L.latLngBounds(coordinates)

  mapInstance.fitBounds(bounds, {
    padding: [30, 30],
    maxZoom: 13,
  })
}

export function renderRestaurantMap(state) {
  const container = document.querySelector('#results-map')

  if (!container || state.ui.resultsView !== 'map') return

  if (!mapInstance) {
    mapInstance = createMap(container)
  }

  requestAnimationFrame(() => {
    mapInstance?.invalidateSize()
  })

  const hits = state.search.mapHits ?? []

  // Avoid rebuilding hundreds of markers when unrelated UI state changes.
  if (hits === lastMapHits) return

  lastMapHits = hits
  renderMarkers(hits)
}