const ATTRIBUTES_TO_RETRIEVE = [
  'objectID',
  'name',
  'name_compact',
  'food_type',
  'city',
  'state',
  'area',
  'neighborhood',
  'dining_style',
  'payment_options',
  'price_tier',
  'price_tier_label',
  'starting_price_range',
  'stars_count',
  'reviews_count',
  'bayesian_rating',
  '_geoloc',
  'address',
  'postal_code',
  'image_url',
  'reserve_url',
  'mobile_reserve_url',
]

const RESTAURANT_SEARCH_ATTRIBUTES = [
  'name',
  'name_compact',
  'food_type',
]

const MAP_ATTRIBUTES_TO_RETRIEVE = [
  'objectID',
  'name',
  'food_type',
  'city',
  'state',
  'neighborhood',
  'dining_style',
  'price_tier_label',
  'stars_count',
  'reviews_count',
  '_geoloc',
  'reserve_url',
]

const METERS_PER_MILE = 1609.344

function buildFacetFilters(filters, location) {
  const facetFilters = []

  if (filters.cuisines.length > 0) {
    facetFilters.push(
      filters.cuisines.map((cuisine) => `food_type:${cuisine}`),
    )
  }

  if (filters.diningStyles.length > 0) {
    facetFilters.push(
      filters.diningStyles.map((style) => `dining_style:${style}`),
    )
  }
  if (filters.paymentMethods.length > 0) {
  facetFilters.push(
    filters.paymentMethods.map(
      (method) => `payment_options:${method}`,
    ),
  )
}

  if (location.mode === 'selected') {
    if (location.type === 'city') {
      facetFilters.push(`city:${location.value}`)
      if (location.stateCode) {
        facetFilters.push(`state:${location.stateCode}`)
      }
    }

    if (location.type === 'area') {
      facetFilters.push(`area:${location.value}`)
    }

    if (location.type === 'neighborhood') {
      facetFilters.push(`neighborhood:${location.value}`)
      if (location.city) {
        facetFilters.push(`city:${location.city}`)
      }
      if (location.stateCode) {
        facetFilters.push(`state:${location.stateCode}`)
      }
    }
  }

  return facetFilters
}

function buildNumericFilters(filters, discoveryMode) {
  const numericFilters = []

  if (filters.minimumRating !== null) {
    numericFilters.push(`stars_count >= ${filters.minimumRating}`)
  }

  if (filters.priceTiers.length > 0) {
    numericFilters.push(
      filters.priceTiers.map((tier) => `price_tier = ${tier}`),
    )
  }
    if (discoveryMode === 'hidden-gems') {
    numericFilters.push('stars_count >= 4.7')
    numericFilters.push('reviews_count <= 200')
  }
  return numericFilters
}

function addGeoParameters(searchParams, location) {
  const hasCoordinates =
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)

  if (!hasCoordinates || location.mode !== 'near-me') return searchParams

  return {
    ...searchParams,
    aroundLatLng: `${location.latitude}, ${location.longitude}`,
    aroundRadius: Math.round(location.radiusMiles * METERS_PER_MILE),
    getRankingInfo: true,
  }
}

export function buildSearchRequest(
  state,
  {
    omitGeo = false,
    useAllSearchableAttributes = false,
  } = {},
) {
  const facetFilters = buildFacetFilters(state.filters, state.location)
  const numericFilters = buildNumericFilters(state.filters, state.discoveryMode)

  let searchParams = {
    query: state.query.trim(),
    hitsPerPage: 12,
    attributesToRetrieve: ATTRIBUTES_TO_RETRIEVE,
    facets: ['food_type', 'dining_style', 'payment_options'],
    maxValuesPerFacet: 1000,
  }
  if (!useAllSearchableAttributes) {
    searchParams.restrictSearchableAttributes =
    RESTAURANT_SEARCH_ATTRIBUTES
  }
  if (useAllSearchableAttributes) {
    searchParams.removeStopWords = ['en']
  }

  if (facetFilters.length > 0) searchParams.facetFilters = facetFilters
  if (numericFilters.length > 0) searchParams.numericFilters = numericFilters

  if (!omitGeo) {
    searchParams = addGeoParameters(searchParams, state.location)
  }

  return searchParams
}

export function buildMapSearchRequest(
  state,
  {
    omitGeo = false,
    useAllSearchableAttributes = false,
  } = {},
) {
  const {
    facets,
    maxValuesPerFacet,
    ...searchParams
  } = buildSearchRequest(state, {
  omitGeo,
  useAllSearchableAttributes,
  })   //reuse this so map inherits all logic not creating a second filtering system

  return {
    ...searchParams,
    hitsPerPage: 1000,
    attributesToRetrieve: MAP_ATTRIBUTES_TO_RETRIEVE,
  }
}