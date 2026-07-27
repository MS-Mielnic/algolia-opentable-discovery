import { RESTAURANTS_JSON_PATH } from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';

const fileContents = await readFile(
  RESTAURANTS_JSON_PATH,
  'utf8'
);

const restaurants = JSON.parse(fileContents);

console.log('Number of restaurants:', restaurants.length);
console.log('First restaurant:', restaurants[0]);
console.log('Available fields:', Object.keys(restaurants[0]));

console.log('\nField types:');

for (const [key, value] of Object.entries(restaurants[0])) {
  console.log(
    key,
    Array.isArray(value) ? 'array' : typeof value
  );
}

// Verify schema consistency
const expectedFields = Object.keys(restaurants[0]);

const recordsWithDifferentFields = restaurants.filter((restaurant) => {
  const fields = Object.keys(restaurant);

  return (
    fields.length !== expectedFields.length ||
    expectedFields.some((field) => !fields.includes(field))
  );
});

console.log(
  '\nRestaurants with a different set of fields:',
  recordsWithDifferentFields.length
);

//verify missing or null values

console.log('\nMissing or null values by field:');

for (const field of expectedFields) {
  const missingCount = restaurants.filter((restaurant) => {
    const value = restaurant[field];

    return value === null || value === undefined || value === '';
  }).length;

  console.log(field, missingCount);
}

//verify objectID is unique as restaurant identifier
const objectIDs = restaurants.map((restaurant) => restaurant.objectID);

const uniqueObjectIDs = new Set(objectIDs);

console.log('\nObjectID check:');
console.log('Total objectIDs:', objectIDs.length);
console.log('Unique objectIDs:', uniqueObjectIDs.size);
console.log(
  'Duplicate objectIDs:',
  objectIDs.length - uniqueObjectIDs.size
);
//inspect geo location fields
const invalidGeolocations = restaurants.filter((restaurant) => {
  const { lat, lng } = restaurant._geoloc;

  return (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  );
});

console.log('\nGeolocation check:');
console.log(
  'Restaurants with invalid geolocation:',
  invalidGeolocations.length
);
// lat long ranges
const latitudes = restaurants.map(
  (restaurant) => restaurant._geoloc.lat
);

const longitudes = restaurants.map(
  (restaurant) => restaurant._geoloc.lng
);

console.log('Latitude range:', {
  min: Math.min(...latitudes),
  max: Math.max(...latitudes),
});

console.log('Longitude range:', {
  min: Math.min(...longitudes),
  max: Math.max(...longitudes),
});
//inspect payment options
const restaurantsWithoutPaymentOptions = restaurants.filter(
  (restaurant) =>
    !Array.isArray(restaurant.payment_options) ||
    restaurant.payment_options.length === 0
);

const uniquePaymentOptions = [
  ...new Set(
    restaurants.flatMap(
      (restaurant) => restaurant.payment_options
    )
  ),
].sort();

console.log('\nPayment options check:');

console.log(
  'Restaurants without payment options:',
  restaurantsWithoutPaymentOptions.length
);

console.log(
  'Unique payment options:',
  uniquePaymentOptions
);
// restaurants unique names
const nameCounts = new Map();

for (const restaurant of restaurants) {
  const currentCount = nameCounts.get(restaurant.name) ?? 0;

  nameCounts.set(restaurant.name, currentCount + 1);
}

const duplicateNames = [...nameCounts.entries()]
  .filter(([name, count]) => count > 1)
  .sort((a, b) => b[1] - a[1]);

console.log('\nDuplicate restaurant names:');
console.log(
  'Names appearing more than once:',
  duplicateNames.length
);

console.log(
  'Top duplicate names:',
  duplicateNames.slice(0, 20)
);

//normalization check for city
const originalCities = new Set(
  restaurants.map((restaurant) => restaurant.city)
);

const normalizedCities = new Set(
  restaurants.map(
    (restaurant) =>
      restaurant.city.trim().toLowerCase()
  )
);

console.log('\nCity normalization check:');

console.log(
  'Original unique cities:',
  originalCities.size
);

console.log(
  'Unique after trim + lowercase:',
  normalizedCities.size
);

//identify city variants
const cityVariants = new Map();

for (const restaurant of restaurants) {
  const originalCity = restaurant.city;
  const normalizedCity = originalCity.trim().toLowerCase();

  if (!cityVariants.has(normalizedCity)) {
    cityVariants.set(normalizedCity, new Set());
  }

  cityVariants.get(normalizedCity).add(originalCity);
}

const duplicatedCityVariants = [...cityVariants.entries()]
  .filter(([normalizedCity, originals]) => originals.size > 1);

console.log('\nCity capitalization/whitespace variants:');

console.log(
  duplicatedCityVariants.map(
    ([normalizedCity, originals]) => ({
      normalizedCity,
      originals: [...originals],
    })
  )
);
// are these cities duplicates or real different cities across states
const statesByCity = new Map();

for (const restaurant of restaurants) {
  const normalizedCity =
    restaurant.city.trim().toLowerCase();

  const state = restaurant.state.trim();

  if (!statesByCity.has(normalizedCity)) {
    statesByCity.set(normalizedCity, new Set());
  }

  statesByCity.get(normalizedCity).add(state);
}

const ambiguousCities = [...statesByCity.entries()]
  .filter(([city, states]) => states.size > 1)
  .sort((a, b) => b[1].size - a[1].size);

console.log('\nCities appearing in multiple states:');

console.log(
  'Ambiguous city names:',
  ambiguousCities.length
);

console.log(
  'Examples:',
  ambiguousCities.slice(0, 20).map(
    ([city, states]) => ({
      city,
      stateCount: states.size,
      states: [...states],
    })
  )
);
//inspect suspicious cities
const suspiciousLocations = restaurants.filter((restaurant) => {
  const city = restaurant.city.trim().toLowerCase();
  const state = restaurant.state.trim();

  return (
    (city === 'new york' && state !== 'NY') ||
    (city === 'san francisco' && state !== 'CA')
  );
});

console.log('\nSuspicious city/state combinations:');

console.log(
  suspiciousLocations.map((restaurant) => ({
    objectID: restaurant.objectID,
    name: restaurant.name,
    address: restaurant.address,
    city: restaurant.city,
    state: restaurant.state,
    postal_code: restaurant.postal_code,
    area: restaurant.area,
    _geoloc: restaurant._geoloc,
  }))
);
// check country values
const countries = [
  ...new Set(
    restaurants.map(
      (restaurant) => restaurant.country.trim()
    )
  ),
].sort();

console.log('\nCountries:');
console.log(countries);