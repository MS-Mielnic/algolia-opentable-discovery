import {
  RESTAURANTS_JSON_PATH,
  RESTAURANTS_CSV_PATH,
} from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

const jsonContents = await readFile(
  RESTAURANTS_JSON_PATH,
  'utf8'
);

const csvContents = await readFile(
  RESTAURANTS_CSV_PATH,
  'utf8'
);

const restaurants = JSON.parse(jsonContents);

const restaurantsInfo = parse(csvContents, {
  columns: true,
  delimiter: ';',
  skip_empty_lines: true,
});

const jsonIDs = new Set(
  restaurants.map((restaurant) => String(restaurant.objectID))
);

const csvIDs = new Set(
  restaurantsInfo.map((restaurant) => restaurant.objectID)
);

const missingFromCSV = [...jsonIDs].filter(
  (objectID) => !csvIDs.has(objectID)
);

const missingFromJSON = [...csvIDs].filter(
  (objectID) => !jsonIDs.has(objectID)
);

console.log('JSON records:', restaurants.length);
console.log('CSV records:', restaurantsInfo.length);

console.log('\nJoin coverage:');
console.log('JSON IDs missing from CSV:', missingFromCSV.length);
console.log('CSV IDs missing from JSON:', missingFromJSON.length);

//compare price fields from each source
const infoByID = new Map(
  restaurantsInfo.map((restaurant) => [
    restaurant.objectID,
    restaurant,
  ])
);

const priceMappings = new Map();

for (const restaurant of restaurants) {
  const info = infoByID.get(String(restaurant.objectID));

  const mapping = `${restaurant.price} -> ${info.price_range}`;

  const currentCount = priceMappings.get(mapping) ?? 0;

  priceMappings.set(mapping, currentCount + 1);
}

console.log('\nJSON price -> CSV price_range:');

console.log(
  [...priceMappings.entries()].sort(
    (a, b) => b[1] - a[1]
  )
);
//review missmatches between two price representations
const expectedPriceRanges = {
  2: '$30 and under',
  3: '$31 to $50',
  4: '$50 and over',
};

const priceMismatches = [];

for (const restaurant of restaurants) {
  const info = infoByID.get(String(restaurant.objectID));

  if (info.price_range !== expectedPriceRanges[restaurant.price]) {
    priceMismatches.push({
      objectID: restaurant.objectID,
      name: restaurant.name,
      city: restaurant.city,
      jsonPrice: restaurant.price,
      csvPriceRange: info.price_range,
    });
  }
}

console.log('\nPrice mismatches:', priceMismatches.length);

console.log('\nFirst 15 price mismatches:');
console.log(priceMismatches.slice(0, 15));

//inspect duplicted restaruant names by location
const restaurantsByName = new Map();

for (const restaurant of restaurants) {
  const currentRestaurants =
    restaurantsByName.get(restaurant.name) ?? [];

  currentRestaurants.push(restaurant);

  restaurantsByName.set(
    restaurant.name,
    currentRestaurants
  );
}

const duplicateNameLocations = [];

for (const [name, matchingRestaurants] of restaurantsByName) {
  if (matchingRestaurants.length > 1) {
    duplicateNameLocations.push({
      name,
      locations: matchingRestaurants.map((restaurant) => {
        const info = infoByID.get(String(restaurant.objectID));

        return {
          objectID: restaurant.objectID,
          city: restaurant.city,
          state: restaurant.state,
          neighborhood: info.neighborhood,
        };
      }),
    });
  }
}

console.log('\nDuplicate names with locations:');

console.dir(
  duplicateNameLocations,
  { depth: null }
);

//unique values area, city, and state  and how often city and neighborhood are  the same value

const uniqueAreas = new Set(
  restaurants.map((restaurant) => restaurant.area.trim())
);

const uniqueCities = new Set(
  restaurants.map((restaurant) => restaurant.city.trim())
);

const uniqueStates = new Set(
  restaurants.map((restaurant) => restaurant.state.trim())
);

let cityMatchesNeighborhood = 0;

for (const restaurant of restaurants) {
  const info = infoByID.get(String(restaurant.objectID));

  if (
    restaurant.city.trim().toLowerCase() ===
    info.neighborhood.trim().toLowerCase()
  ) {
    cityMatchesNeighborhood += 1;
  }
}

console.log('\nLocation profile:');
console.log('Unique areas:', uniqueAreas.size);
console.log('Unique cities:', uniqueCities.size);
console.log('Unique states:', uniqueStates.size);

console.log(
  'Restaurants where city equals neighborhood:',
  cityMatchesNeighborhood
);

console.log(
  'Restaurants where city differs from neighborhood:',
  restaurants.length - cityMatchesNeighborhood
);

//city vs neighborhood

const cityNeighborhoodDifferences = [];

for (const restaurant of restaurants) {
  const info = infoByID.get(String(restaurant.objectID));

  const city = restaurant.city.trim();
  const neighborhood = info.neighborhood.trim();

  if (city.toLowerCase() !== neighborhood.toLowerCase()) {
    cityNeighborhoodDifferences.push({
      name: restaurant.name,
      city,
      state: restaurant.state,
      neighborhood,
      area: restaurant.area.trim(),
    });
  }
}

console.log('\nExamples where city differs from neighborhood:');

console.log(
  cityNeighborhoodDifferences.slice(0, 20)
);

//check ambiguous neighborhood names
const citiesByNeighborhood = new Map();

for (const restaurant of restaurants) {
  const info = infoByID.get(String(restaurant.objectID));

  const neighborhood = info.neighborhood.trim();
  const cityState = `${restaurant.city.trim()}, ${restaurant.state.trim()}`;

  if (!citiesByNeighborhood.has(neighborhood)) {
    citiesByNeighborhood.set(neighborhood, new Set());
  }

  citiesByNeighborhood.get(neighborhood).add(cityState);
}

const ambiguousNeighborhoods = [...citiesByNeighborhood.entries()]
  .filter(([neighborhood, locations]) => locations.size > 1)
  .sort((a, b) => b[1].size - a[1].size);

console.log('\nAmbiguous neighborhood names:');

console.log(
  'Neighborhood names used in multiple city/state locations:',
  ambiguousNeighborhoods.length
);

console.log(
  'Top ambiguous neighborhoods:',
  ambiguousNeighborhoods.slice(0, 20).map(
    ([neighborhood, locations]) => ({
      neighborhood,
      locationCount: locations.size,
      locations: [...locations],
    })
  )
);
// compare phone fields
function normalizePhone(value) {
  const basePhone = value.split(/[xe]/i)[0];

  let digits = basePhone.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }

  return digits;
}

let matchingPhones = 0;
let differentPhones = 0;

const phoneDifferences = [];

for (const restaurant of restaurants) {
  const info = infoByID.get(String(restaurant.objectID));

  const jsonPhone = normalizePhone(restaurant.phone);
  const csvPhone = normalizePhone(info.phone_number);

  if (jsonPhone === csvPhone) {
    matchingPhones += 1;
  } else {
    differentPhones += 1;

    phoneDifferences.push({
      objectID: restaurant.objectID,
      name: restaurant.name,
      jsonPhone: restaurant.phone,
      csvPhone: info.phone_number,
    });
  }
}

console.log('\nPhone comparison:');
console.log('Matching phone numbers:', matchingPhones);
console.log('Different phone numbers:', differentPhones);

console.log('\nExamples of differences:');
console.log(phoneDifferences.slice(0, 10));