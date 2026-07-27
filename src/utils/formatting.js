const integerFormatter = new Intl.NumberFormat('en-US')

export function formatInteger(value) {
  const number = Number(value)
  return Number.isFinite(number) ? integerFormatter.format(number) : '0'
}

export function formatRating(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(1) : '—'
}

export function formatLocation(hit) {
  return [hit.neighborhood, hit.city, hit.state].filter(Boolean).join(' · ')
}

export function formatDistance(meters) {
  const numericMeters = Number(meters)
  if (!Number.isFinite(numericMeters)) return null

  const miles = numericMeters / 1609.344
  return miles < 0.1 ? 'Less than 0.1 mi' : `${miles.toFixed(1)} mi`
}
