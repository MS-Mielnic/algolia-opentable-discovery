import { CLEANED_RECORDS_PATH } from '../lib/project-paths.js';
import { readFile } from 'node:fs/promises';

const INPUT = CLEANED_RECORDS_PATH;

const restaurants = JSON.parse(
  await readFile(INPUT, 'utf8')
);

const areaCounts = new Map();
const areaStates = new Map();
const areaCities = new Map();

for (const restaurant of restaurants) {
  const area = restaurant.area;

  areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);

  if (!areaStates.has(area)) areaStates.set(area, new Set());
  areaStates.get(area).add(restaurant.state);

  if (!areaCities.has(area)) areaCities.set(area, new Set());
  areaCities.get(area).add(restaurant.city);
}

const areas = [...areaCounts.entries()]
  .sort((a, b) => b[1] - a[1]);

console.log('Unique areas:', areas.length);

console.log('\nAreas by restaurant count:');
for (const [area, count] of areas) {
  console.log(
    `${area}: ${count} restaurants | ` +
    `${areaCities.get(area).size} cities | ` +
    `${areaStates.get(area).size} states`
  );
}
//lets check the timming of whitespaces to see if it is systemic or isolated
const whitespaceIssues = restaurants
  .filter((restaurant) => restaurant.area !== restaurant.area.trim())
  .map((restaurant) => ({
    objectID: restaurant.objectID,
    name: restaurant.name,
    area: JSON.stringify(restaurant.area),
    trimmed: JSON.stringify(restaurant.area.trim()),
  }));

console.log('Area values with leading/trailing whitespace:', whitespaceIssues.length);
console.log(whitespaceIssues.slice(0, 20));