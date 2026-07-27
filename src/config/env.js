const browserEnv = {
  appId: import.meta.env.VITE_ALGOLIA_APP_ID?.trim(),
  searchApiKey: import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY?.trim(),
  indexName: import.meta.env.VITE_ALGOLIA_INDEX_NAME?.trim(),
}

export function getAlgoliaConfig() {
  const missingVariables = []

  if (!browserEnv.appId) missingVariables.push('VITE_ALGOLIA_APP_ID')
  if (!browserEnv.searchApiKey) {
    missingVariables.push('VITE_ALGOLIA_SEARCH_API_KEY')
  }
  if (!browserEnv.indexName) missingVariables.push('VITE_ALGOLIA_INDEX_NAME')

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing Algolia configuration: ${missingVariables.join(', ')}. ` +
        'Add the browser-safe values to .env.local and restart Vite.',
    )
  }

  return Object.freeze({ ...browserEnv })
}
