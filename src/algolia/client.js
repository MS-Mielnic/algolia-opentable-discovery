import { algoliasearch } from 'algoliasearch'
import { getAlgoliaConfig } from '../config/env.js'

let searchClient

export function getSearchClient() {
  if (!searchClient) {
    const { appId, searchApiKey } = getAlgoliaConfig()
    searchClient = algoliasearch(appId, searchApiKey)
  }

  return searchClient
}
