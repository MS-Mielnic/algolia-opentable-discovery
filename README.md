# OpenTable Search & Discovery Prototype

A restaurant search and discovery prototype built with **Algolia**, **Vanilla JavaScript**, **Vite**, and **Leaflet**.

The prototype is designed around two user journeys from the prospect discovery notes:

- **Known-item search:** help users who already know the restaurant they want find the correct restaurant quickly, even with typos, partial names, concatenated names, or branch/location context.
- **Open-ended discovery:** help users who are still deciding explore restaurants by cuisine, location, quality, price, dining style, payment method, and geographic context.

The experience follows a simple journey:

**DISCOVER → REFINE → EXPLORE → BOOK**
> Deployment: https://algolia-opentable-deployment-ifwxs2nrq-msm-se-test.vercel.app/
> Repository: https://github.com/MS-Mielnic/algolia-opentable-discovery

For the deeper data analysis, relevance experiments, Algolia-setting rationale, trade-offs, and validation evidence, see [`docs/project-summary.md`](docs/project-summary.md).

---

## What the prototype demonstrates

### Forgiving known-item search
Users can search by restaurant name even when the input is imperfect.

Examples tested during development include:

```text
Pappas Bros
pappasbrossteakhouse
Pappas Houston
Pappas Huston
Pappas in Houston
Pappas in Huston
Town Carbondale
```

The normal search remains focused on **restaurant identity and cuisine**. When a non-empty query returns no results, a controlled fallback allows lower-priority location attributes to participate so branch-disambiguation queries can still succeed.

### Cuisine discovery and refinement
Cuisine works in two complementary ways:

- as a searchable attribute for broad discovery, such as `Italian`
- as an exact searchable facet for explicit refinement

This keeps free-text discovery flexible while making selected cuisine filters precise.

### Local restaurant discovery — “Near Me”
For exploratory users, proximity becomes relevant only when they explicitly express local intent. **Near Me** applies the user's coordinates and a **25-mile radius** to the Algolia request using `aroundLatLng` and `aroundRadius`.

Geo is applied at query time rather than globally so proximity does not interfere with known-item relevance.

### Quality-aware discovery — “Recommended”
When users are exploring rather than looking for a specific restaurant, the default ordering should surface credible choices without relying only on raw star rating or popularity.

The prototype calculates a Bayesian rating that balances rating quality with review confidence and uses:

```text
customRanking:
desc(bayesian_rating)
```

The UI presents this in customer-friendly language as:

**Recommended · Rating + review confidence**

### Discovery of highly rated, less-established restaurants — “Hidden Gems”
Discovery should do more than narrow a large catalog. **Hidden Gems** is a business feature designed to surface restaurants with exceptional ratings but relatively low review volume, giving strong but less-established options additional visibility.

The discovery mode applies:

```text
stars_count >= 4.7
reviews_count <= 200
```

This produced **108 qualifying restaurants** in the provided dataset. It is implemented as an explicit discovery mode rather than changing the global ranking model.

### Structured refinement
Users can refine by:

- Cuisine
- Dining style
- Rating
- Price tier
- Payment method
- City, area, or neighborhood
- Near Me

### Geographic exploration — Map view
Large result sets can be difficult to understand as cards alone. The **Map** view gives exploratory users spatial context while preserving the same query and refinement intent as the List view.

Algolia remains responsible for retrieval and filtering; **Leaflet** renders the geographic visualization.

### Booking handoff
Restaurant cards and map popups provide a **Book table** action using the supplied OpenTable `reserve_url`.

The prototype intentionally hands off to OpenTable for live reservation availability rather than fabricating or scraping availability data that is not included in the assignment dataset.

---

# Architecture

```text
restaurants_list.json ─┐
                       ├── scripts/build-records.js
restaurants_info.csv ──┘
                              │
                              ▼
              generated/restaurants_cleaned.json
                              │
                              ▼
                    Algolia restaurant index
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
        Algolia Search API            Geo search parameters
                │                           │
                └─────────────┬─────────────┘
                              ▼
                    Vite browser application
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
               List view               Map view
                  │                       │
                  └───────────┬───────────┘
                              ▼
                         Book table
```

---

# Technology

| Layer | Technology | Role |
| --- | --- | --- |
| Search platform | Algolia | Retrieval, relevance, faceting, numeric filtering, geo search, custom ranking |
| Front end | Vanilla JavaScript | Application state, query construction, interaction logic |
| Build tooling | Vite | Development server and production build |
| Map | Leaflet | Restaurant geographic visualization |
| Map tiles | OpenStreetMap | Basemap for the prototype |
| Data processing | Node.js | Join, cleanup, enrichment, validation, and indexing scripts |

---
## Deployment

The production demo is deployed on Vercel:

**Live demo:** https://algolia-opentable-deployment-ifwxs2nrq-msm-se-test.vercel.app/

The deployed Vite application uses only the browser-safe Algolia configuration:

- `VITE_ALGOLIA_APP_ID`
- `VITE_ALGOLIA_SEARCH_API_KEY`
- `VITE_ALGOLIA_INDEX_NAME`

The Algolia write API key is used only by local administrative scripts and is not exposed to the deployed client.

# Quick start

## 1. Install dependencies

```bash
npm install
```

## 2. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Populate the required values:

```text
ALGOLIA_APP_ID=
ALGOLIA_WRITE_API_KEY=
ALGOLIA_INDEX_NAME=

VITE_ALGOLIA_APP_ID=
VITE_ALGOLIA_SEARCH_API_KEY=
VITE_ALGOLIA_INDEX_NAME=
```

Use a **search-only API key** for the browser-facing `VITE_` variable. Do not expose the write key to the client application.

## 3. Build the cleaned search records

```bash
node scripts/build-records.js
```

This joins the supplied JSON and CSV data by `objectID`, applies evidence-backed cleanup, creates search-specific derived fields, validates the output, and writes:

```text
generated/restaurants_cleaned.json
```

## 4. Index the records

```bash
node --env-file=.env.local scripts/algolia/index-records.js
```

## 5. Apply the final Algolia configuration

Dry-run first:

```bash
node --env-file=.env.local scripts/algolia/configure-search.js
```

Apply:

```bash
node --env-file=.env.local scripts/algolia/configure-search.js --apply
```

`configure-search.js` is the authoritative final index configuration.
`scripts/algolia/enable-location-filters.js` remains as an incremental development utility and is **not required** for a clean setup.

## 6. Run the application

```bash
npm run dev
```

Open the local URL printed by Vite, typically:

```text
http://localhost:5173
```

## 7. Validate the production build

```bash
npm run build
```

The deployable application is generated under:

```text
dist/
```

---

# Final Algolia configuration

## Searchable attributes

```text
1. unordered(name)
2. unordered(name_compact)
3. unordered(food_type)
4. city,neighborhood
5. area
6. state
```

| Attribute | Why it is searchable |
| --- | --- |
| `name` | Restaurant identity is the strongest known-item signal |
| `name_compact` | Supports restaurant names typed without spaces or punctuation |
| `food_type` | Supports cuisine-led discovery without outranking restaurant identity |
| `city,neighborhood` | Provides specific location context for disambiguation at the same priority level |
| `area` | Provides broader geographic context |
| `state` | Broadest location signal and therefore lowest priority |

`unordered(...)` is used for the first three attributes because word order should not become an additional relevance penalty for restaurant identity or cuisine matching.

## Faceting and filtering

```text
searchable(food_type)
dining_style
filterOnly(stars_count)
filterOnly(price_tier)
filterOnly(city)
filterOnly(state)
filterOnly(area)
filterOnly(neighborhood)
filterOnly(reviews_count)
payment_options
```

### Why different facet types are used

**`searchable(food_type)`**
Cuisine has a large taxonomy and is both a discovery concept and an exact refinement. A searchable facet lets users find facet values while preserving exact refinement semantics.

**`dining_style`**
Dining style has only a small number of values, so a regular facet is sufficient.

**`filterOnly(stars_count)` and `filterOnly(price_tier)`**
The UI applies numeric conditions but does not need Algolia to return facet-value lists for these fields.

**Location fields as `filterOnly(...)`**
City, state, area, and neighborhood are used as structured location constraints. Their value selection is handled by the location experience rather than the sidebar facet UI.

**`filterOnly(reviews_count)`**
Supports the Hidden Gems discovery rule without requiring review counts to be returned as facet values.

**`payment_options`**
Payment is a regular facet because the UI uses Algolia facet values and counts for payment-method refinement.

## Custom ranking

```text
desc(bayesian_rating)
```

Custom ranking acts as a quality tie-breaker after Algolia's core textual relevance criteria. It does not replace restaurant-name relevance.

---

# Request-time search behavior

Not every relevance decision belongs in static Algolia index settings. Some behavior depends on user intent and is therefore applied per request.

## Primary restaurant/cuisine search

The normal text request uses:

```text
restrictSearchableAttributes:
- name
- name_compact
- food_type
```

This prevents a query such as `Dallas` in the restaurant box from automatically becoming equivalent to selecting Dallas in the dedicated Location control.

## Known-item branch fallback

Users who know a restaurant may naturally type a branch context directly into the restaurant search box, for example:

```text
Pappas Bros Houston
Pappas in Huston
```

When the primary request returns zero results, the application retries using all configured searchable attributes.

The fallback also applies:

```text
removeStopWords: ['en']
```

so low-information words such as `in` do not prevent a branch-disambiguation query from resolving.

This fallback is intentionally narrow: normal successful queries are not broadened.

## Near Me

When the user explicitly selects Near Me, the request adds:

```text
aroundLatLng
aroundRadius
```

with a radius of **25 miles**.

Near Me is treated as a hard user-selected constraint. If no restaurants match the selected preferences within the radius, the experience shows an intent-aware zero-result state rather than silently broadening the geography.

---

# Data preparation

The source dataset contains approximately 5,000 restaurant records split across:

```text
restaurants_list.json
restaurants_info.csv
```

The build pipeline:

1. validates unique `objectID` values
2. performs a one-to-one join by `objectID`
3. normalizes whitespace
4. applies evidence-backed city and state corrections
5. normalizes selected cuisine taxonomy values
6. preserves raw/source values when useful for traceability
7. creates search-specific derived fields
8. validates the final 5,000-record output

Examples of derived search fields include:

- `name_compact` — alternate representation for concatenated restaurant-name queries
- `bayesian_rating` — confidence-aware quality signal used by custom ranking
- normalized price-tier fields used by the UI

Ambiguous source conflicts were not automatically overwritten when the available data did not establish an authoritative value.

See [`docs/project-summary.md`](docs/project-summary.md) for the profiling evidence, cleanup rationale, and accepted data-quality boundaries.

---

# Search behavior worth trying

## Known-item search

```text
Pappas Bros
pappasbrossteakhouse
Pappas Houston
Pappas Huston
Pappas in Houston
Pappas in Huston
Town Carbondale
```

## Broad discovery

```text
Italian
Steakhouse
Sushi
```

Then try:

- Cuisine refinement
- Fine Dining
- Top Rated / Exceptional
- `$$`, `$$$`, `$$$$`
- Cash Only
- Hidden Gems
- Near Me
- List → Map
- Book table

---

# Validation

Search behavior was tested iteratively against the indexed dataset rather than relying only on whether the UI returned results.

Representative validated observations include:

| Behavior | Observed result |
| --- | ---: |
| Exact Italian cuisine facet | 850 |
| Fine Dining | 641 |
| Rating 4.5+ | 1,590 |
| Rating 4.7+ | 332 |
| Price `$$` | 3,159 |
| Price `$$$` | 1,545 |
| Price `$$$$` | 296 |
| Hidden Gems | 108 |
| Cash Only | 7 |
| AMEX | 4,858 |
| New York + Italian + AMEX | 145 |

The repository includes targeted validation scripts under:

```text
scripts/algolia/
```

Examples include:

```bash
node --env-file=.env.local scripts/algolia/test-cuisine-facet.js
node --env-file=.env.local scripts/algolia/test-dining-style-facet.js
node --env-file=.env.local scripts/algolia/test-rating-filter.js
node --env-file=.env.local scripts/algolia/test-price-tier-filter.js
node --env-file=.env.local scripts/algolia/test-geo-known-item.js
```

The final application was also manually validated for:

- known-item and typo behavior
- branch disambiguation
- cuisine, dining style, rating, price, and payment refinement
- Near Me
- zero-result behavior
- Hidden Gems
- List/Map consistency
- booking from cards and map popups
- responsive layouts at representative mobile/tablet breakpoints
- successful Vite production build

---

# Project structure

```text
.
├── docs/
│   └── project-summary.md
├── generated/
│   └── restaurants_cleaned.json
├── scripts/
│   ├── build-records.js
│   ├── algolia/
│   │   ├── configure-search.js
│   │   ├── index-records.js
│   │   └── test-*.js
│   └── data_exploration/
├── src/
│   ├── algolia/
│   ├── search/
│   ├── state/
│   ├── ui/
│   ├── utils/
│   ├── main.js
│   └── style.css
├── .env.example
├── package.json
└── README.md
```

---

# Design boundaries and trade-offs

This prototype intentionally does not attempt to solve every possible production concern.

- **No arbitrary natural-language parser:** useful branch-query patterns are supported through Algolia relevance and a controlled fallback rather than custom NLP.
- **No fabricated live availability:** booking is handed off through the supplied OpenTable reservation URL.
- **No multiple user-controlled sort modes:** the prototype uses one explainable Recommended ordering instead of adding poorly justified alternatives.
- **No silent Near Me expansion:** explicit local intent is preserved even when it produces zero matches.
- **Map result cap:** Map can visualize up to 1,000 matching records in the prototype; large-scale production mapping would benefit from clustering or geographic loading strategies.
- **Source-image limitation:** the provided restaurant image URLs resolved to a common placeholder, so the prototype does not claim richer image data than the source provides.

---

# Deeper technical rationale

The implementation was developed through repeated profiling, baseline testing, relevance evaluation, and manual UX validation.

For the detailed analysis—including:

- dataset profiling and cleanup decisions
- field-by-field record design
- Algolia capability explanations
- searchable-attribute ordering
- `unordered` rationale
- facet-type selection
- custom-ranking experiments
- geo-search decisions
- known-item fallback design
- discovery-feature rationale
- UI and technology trade-offs
- accepted boundaries
- final test evidence

see:

**[`docs/project-summary.md`](docs/project-summary.md)**
