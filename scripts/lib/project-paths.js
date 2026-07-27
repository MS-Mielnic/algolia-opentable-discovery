import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

/*
 * Resolve all project paths from this file's location rather than
 * from process.cwd(). This keeps scripts portable regardless of
 * where the evaluator launches them from.
 */
export const PROJECT_ROOT = path.resolve(
  currentDirectory,
  '../..'
);

export const DATASET_DIR = path.join(
  PROJECT_ROOT,
  'resources',
  'dataset'
);

export const RESTAURANTS_JSON_PATH = path.join(
  DATASET_DIR,
  'restaurants_list.json'
);

export const RESTAURANTS_CSV_PATH = path.join(
  DATASET_DIR,
  'restaurants_info.csv'
);

export const GENERATED_DIR = path.join(
  PROJECT_ROOT,
  'generated'
);

export const CLEANED_RECORDS_PATH = path.join(
  GENERATED_DIR,
  'restaurants_cleaned.json'
);