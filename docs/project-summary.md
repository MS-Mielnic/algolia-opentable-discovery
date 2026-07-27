# OpenTable Search & Discovery Prototype — Project Summary

## Purpose

This document explains the reasoning behind the OpenTable search and discovery prototype built for the Algolia Solutions Engineer assignment.

It is intentionally different from the root `README.md`.

- `README.md` is the fast path for a reviewer who wants to run the project and understand what it demonstrates.
- This document records the deeper reasoning: what was observed in the data, what was tested, which Algolia capabilities were selected, why they were configured this way, what was implemented in the application layer instead of the index, and which trade-offs were accepted.

The analysis is grounded in the provided dataset and in observed Algolia behavior. It does **not** claim production impact on conversion because there is no production traffic, analytics baseline, or experiment data in the assignment.

The final product journey is:

**DISCOVER → REFINE → EXPLORE → BOOK**

---

# 1. Prospect problem and evaluation frame

The prospect context describes an OpenTable search experience built on an older in-house Elasticsearch implementation. The business objective is not simply to return restaurant records; it is to improve search quality, modernize discovery, increase platform usage, and help more search or browsing sessions progress toward a booking.

Two user personas guided the design.

## Persona 1 — users who know the restaurant they want

These users already have a restaurant in mind. Their main risks are friction and search failure.

Relevant behaviors include:

- exact restaurant names;
- partial names;
- misspellings;
- punctuation differences;
- names typed without spaces;
- brands with multiple locations;
- restaurant name plus location context.

The product objective is:

> **Make known-item search fast, forgiving, and precise without letting broad location or discovery signals override restaurant identity.**

## Persona 2 — users who are still exploring

These users have not chosen a restaurant yet. They need ways to browse, narrow, compare visually, and get inspired.

Relevant behaviors include:

- broad cuisine search;
- filtering by dining style, rating, price, and payment method;
- choosing a city, area, or neighborhood;
- finding restaurants near their current location;
- seeing useful ordering on empty or broad queries;
- exploring spatially through a map;
- discovering options they might not already know.

The product objective is:

> **Turn a 5,000-record catalog into a guided discovery experience that can move from inspiration to booking.**

---

# 2. End-to-end architecture

```text
restaurants_list.json ─┐
                       ├── scripts/build-records.js
restaurants_info.csv ──┘
                              │
                              ▼
              generated/restaurants_cleaned.json
                              │
                              ▼
                  Algolia indexing projection
                              │
                              ▼
                    Algolia restaurant index
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
       index-level relevance          request-time intent
       and filter configuration       and contextual parameters
                │                           │
                └─────────────┬─────────────┘
                              ▼
                    Vanilla JS + Vite app
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
               List view               Map view
                  │                       │
                  └───────────┬───────────┘
                              ▼
                         Book table
```

A key architectural principle was to separate three concerns:

1. **Data cleaning** — correcting or normalizing source data only when there is evidence.
2. **Search projection** — adding derived fields that help search without rewriting canonical source meaning.
3. **Query-time behavior** — applying context such as Near Me or known-item fallback only when the user's intent requires it.

This separation avoided solving every problem by permanently changing the index configuration.

---

# 3. Data foundation

## 3.1 Join integrity and record identity

Before tuning search, the two source files had to be validated as a reliable data foundation.

Observed:

| Measure | Result |
| --- | ---: |
| JSON records | 5,000 |
| CSV records | 5,000 |
| Unique JSON `objectID` values | 5,000 |
| Unique CSV `objectID` values | 5,000 |
| IDs missing across the join | 0 |
| Duplicate IDs | 0 |
| Final merged records | 5,000 |

### Decision

`objectID` is the record identity and the join key.

Restaurant name is **not** used as identity because profiling found **21 repeated restaurant-name groups** at different locations.

This directly informed the later search design: repeated restaurant names should remain separate records, and location should be used for disambiguation rather than deduplicating by name.

---

# 4. Cleaning philosophy

The rule used throughout the data pipeline was:

> **Correct what the data supports. Preserve ambiguity when the data does not establish which value is authoritative.**

This is important in a customer-data project because aggressive cleanup can create false confidence.

The pipeline deliberately avoided:

- deduplicating by restaurant name;
- arbitrarily choosing between conflicting phone values;
- forcing the two price dimensions into a single field;
- lowercasing user-facing values;
- inventing a large cuisine hierarchy;
- applying generic title-casing rules to all cities.

## 4.1 Repeatable builder

`scripts/build-records.js` performs:

```text
load source files
      ↓
parse JSON + semicolon-delimited CSV
      ↓
validate objectID presence
      ↓
validate uniqueness
      ↓
validate complete 1:1 join
      ↓
normalize types
      ↓
merge
      ↓
apply explicit cleaning rules
      ↓
validate final record contract
      ↓
report unresolved observations
      ↓
deterministic sort
      ↓
write cleaned output
```

The builder validates structural invariants rather than assuming the source must always contain exactly 5,000 records.

---

# 5. Evidence-backed transformations

## 5.1 Whitespace cleanup

**Observed:** 24 source string values contained non-semantic leading or trailing whitespace.

**Decision:** normalize whitespace because it does not change business meaning and can fragment filters or exact comparisons.

**Final transformation:** 24 values normalized.

---

## 5.2 City-label normalization

Location profiling identified explicit spelling, spacing, abbreviation, formatting, or casing variants that represented the same city.

Examples included:

```text
Ft. Worth            → Fort Worth
Ft. Lauderdale       → Fort Lauderdale
Kailua Kona          → Kailua-Kona
LaFayette            → Lafayette
Mcallen              → McAllen
Portlando            → Portland
Saint Augustine      → St. Augustine
Saint Helena         → St. Helena
Saint Paul           → St. Paul
Southhold            → Southold
Sugarland            → Sugar Land
Winterpark           → Winter Park
```

The final builder normalized **21 city values**.

### Why explicit mappings instead of generic title-casing?

A generic transformation could incorrectly change legitimate names or punctuation. The normalization list was created from profiling evidence such as:

- state agreement;
- ZIP overlap;
- geographic proximity;
- area/market agreement;
- edit distance;
- frequency imbalance.

The goal was to remove demonstrated taxonomy fragmentation without creating new assumptions.

---

## 5.3 Location hierarchy correction — SoHo

Location hierarchy analysis found one record where `SoHo` appeared as a city even though the surrounding evidence supported New York as the city and SoHo as the neighborhood.

The correction was:

```text
objectID 152377
city: SoHo → New York
neighborhood: SoHo
```

The decision was supported by the broader location hierarchy, ZIP/area context, and geolocation rather than by string similarity alone.

### Why this matters for search

Location fields serve different semantic roles:

```text
city
neighborhood
area
state
```

If those roles are mixed, a location selector can show confusing duplicate or incorrect options even when the raw strings look valid.

---

## 5.4 State corrections

Two records had state values contradicted by city, ZIP code, market, and geolocation.

Corrections:

```text
objectID 149527: AL → CA
objectID 138700: NJ → NY
```

Only strongly corroborated state errors were changed.

---

## 5.5 Cuisine normalization

Two source labels represented the same restaurant concept closely enough to fragment discovery and faceting.

```text
Steak                 → Steakhouse        123 records
Global, International → International      43 records
```

Total cuisine normalizations: **166 records**.

The original source label is preserved in `food_type_raw`.

### Why normalize cuisine?

Cuisine is both a search and refinement dimension. Equivalent labels appearing separately would:

- split facet counts;
- make discovery less predictable;
- create duplicate-looking choices;
- make evaluation counts harder to interpret.

### Why not build a larger cuisine hierarchy?

The dataset did not provide an authoritative taxonomy. Only equivalences supported by restaurant-level profiling were normalized.

---

# 6. Data-quality observations intentionally preserved

## Phone conflicts

**95 phone-source conflicts** were retained.

Reason:

> The two files disagree, but the dataset does not establish which source is authoritative.

Guessing would be worse than preserving the ambiguity.

## Price dimensions

The two price values were preserved because they represent different concepts:

- JSON `price` → industry-style price tier;
- CSV `price_range` → starting-price band.

The search projection renames them more explicitly:

```text
price_tier
price_tier_label
starting_price_range
```

These fields are not expected to map one-to-one.

## Repeated restaurant names

**21 repeated-name groups** were preserved as separate restaurants because `objectID`, not `name`, is identity.

## Images

The supplied restaurant image URLs were tested and resolved to the same generic placeholder rather than restaurant-specific imagery.

The prototype therefore does not claim richer image data than the source supports.

---

# 7. Canonical data vs search projection

A recurring design principle was:

> **Do not rewrite customer truth just because search benefits from another representation.**

Some fields are therefore derived specifically for search.

## 7.1 Concatenated-name recovery — `name_compact`

### Business problem

Known-item users may type a restaurant name without spaces or punctuation.

Example:

```text
Pappas Bros. Steakhouse
→ pappasbrossteakhouse
```

Baseline tests showed fully concatenated names could return zero results.

### Search design

A derived `name_compact` field removes spaces and punctuation and lowercases the name for search matching.

The original `name` remains unchanged for display and canonical meaning.

### Result

After indexing `name_compact`, queries such as these recovered the intended restaurants:

```text
pappasbros
pappasbrossteakhouse
labellavita
rafainbraziliansteakhouse
thecedarssocial
```

This field belongs to the search projection, not to source cleaning.

---

## 7.2 Quality-aware ranking signal — `bayesian_rating`

### Business problem

An exploratory user needs a useful default order when there is no strong textual intent.

Raw star rating and raw review count each create problems:

- raw rating over-rewards very small review samples;
- raw review count over-rewards popularity even when rating quality is lower.

### Dataset evidence

Global mean rating:

```text
4.2941
```

Review-count percentiles:

```text
p25:   140
p50:   336
p75:   729.3
p90: 1,354.1
```

Three confidence thresholds were compared.

Observed trade-off:

- p25 allowed rating to dominate more;
- p75 weighted high review volumes more strongly;
- p50 produced a balanced top set with strong ratings and meaningful review evidence.

### Decision

Use the median review count, **336**, as the Bayesian confidence threshold.

The score is computed as a search-ranking signal and projected as:

```text
bayesian_rating
```

It is not presented to users as a raw score.

The UI instead says:

> **Recommended · Rating + review confidence**

---

# 8. Final Algolia index configuration

The final authoritative settings are defined in:

```text
scripts/algolia/configure-search.js
```

## 8.1 Searchable attributes

```text
1. unordered(name)
2. unordered(name_compact)
3. unordered(food_type)
4. city,neighborhood
5. area
6. state
```

Algolia's `searchableAttributes` setting controls both which attributes participate in retrieval and their priority for the Attribute ranking criterion.

The order is therefore a relevance decision, not just a field list.

---

# 9. Restaurant identity first — `unordered(name)`

### Business feature

**Fast known-item retrieval**

For Persona 1, the restaurant name is the strongest expression of intent.

A search for:

```text
Epernay
Pappas Bros
Town
```

should prioritize restaurant identity before cuisine or location text.

### Algolia capability

```text
searchableAttributes
```

with:

```text
unordered(name)
```

at priority 1.

### Why first?

If location or cuisine ranked above restaurant identity, a record that happens to contain the same term in a city, neighborhood, or category could outrank the restaurant the user actually named.

The `Town` tests exposed this risk directly.

### Why `unordered`?

Algolia normally considers match position within an attribute as part of Attribute ranking. `unordered` removes that position distinction.

For restaurant identity, the intent was not to prefer a match merely because the word appeared earlier in the stored name.

This makes the field about **which attribute matched**, not about rewarding the token's position inside the restaurant name.

---

# 10. Concatenated-name recovery — `unordered(name_compact)`

### Business feature

**Forgiving known-item search for names typed without spaces**

### Algolia capability

A second searchable representation at priority 2:

```text
unordered(name_compact)
```

### Why priority 2?

`name_compact` is still restaurant identity, so it belongs immediately below the canonical restaurant name and above discovery dimensions.

### Baseline

Before the field existed:

```text
pappasbrossteakhouse        → 0
labellavita                 → 0
rafainbraziliansteakhouse   → 0
thecedarssocial             → 0
```

### After projection and indexing

Those concatenated queries recovered the intended records.

### Accepted boundary

A heavily corrupted concatenated value such as:

```text
ppapasbrostakehouse
```

returned zero results.

That was accepted rather than adding speculative aliases or weakening matching globally.

---

# 11. Cuisine discovery — `unordered(food_type)`

### Business feature

**Search by what the user wants to eat**

Persona 2 may not know a restaurant name but may know a cuisine:

```text
Italian
Sushi
Steakhouse
```

### Baseline before cuisine was searchable

Examples:

```text
Italian                        93 matches
Sushi                          74
Steakhouse                    181
Contemporary American Denver    0
```

Those matches were driven largely by restaurant-name and location text.

### Algolia capability

Add normalized cuisine as priority 3:

```text
unordered(food_type)
```

### Why below name?

Cuisine is essential to discovery, but it should not outrank restaurant identity for a known-item query.

### Validation after change

Examples:

```text
Italian                       874
Sushi                         106
Steakhouse                    509
Contemporary American Denver   72
```

The broader text query `Italian` returns more than the exact Italian cuisine population because restaurant names containing terms such as `Italian` or `Italiana` can also match.

That is appropriate for free-text discovery.

---

# 12. Location hierarchy in searchable attributes

## 12.1 Specific location context — `city,neighborhood`

### Business feature

**Branch disambiguation**

A user may know a brand but need the correct location.

Examples:

```text
Pappas Bros Dallas
Pappas Bros Houston
Atrias PNC Park
Atrias O'Hara
```

### Algolia capability

```text
city,neighborhood
```

as one priority level in `searchableAttributes`.

Algolia allows comma-separated attributes to share the same priority.

### Why group them?

Both city and neighborhood are specific location signals. The project did not have evidence that one should universally outrank the other, so they were given equal priority.

### Important consequence

Because they are configured as a same-priority group, request-time `restrictSearchableAttributes` cannot target only one member of that group. This is one reason the final fallback either uses the full configured search scope or the primary name/cuisine subset.

---

## 12.2 Broader market context — `area`

### Business feature

**Support how users describe a metro market**

A restaurant may belong to the Pittsburgh market even when the municipal city is Gibsonia, McMurray, or Murrysville.

### Algolia capability

```text
area
```

at priority 5.

### Why below city/neighborhood?

`area` is broader and therefore less precise for branch identification.

---

## 12.3 Broadest textual location context — `state`

`state` is the broadest location signal and is kept at the lowest searchable priority.

---

# 13. Default typo tolerance

### Business feature

**Recover ordinary spelling mistakes without custom query rules**

Representative tests included:

```text
Papas Bros Steakhouse
Pappas Bros Stekhouse
Iaria's
Iarias
Atria's
Atrias
```

Algolia's normal typo behavior recovered the expected restaurants.

### Decision

No global typo-tolerance relaxation or custom typo setting was introduced.

### Why?

The baseline capability already solved the observed ordinary spelling problems.

Adding more permissive settings without evidence would increase the risk of false positives.

---

# 14. Primary search scope vs branch-aware fallback

This is one of the most important application-level relevance decisions.

## 14.1 Business problem

The interface intentionally separates:

```text
Restaurant / cuisine search
Location selector
```

A user typing only:

```text
Dallas
```

into the restaurant search box should not automatically get the same behavior as choosing Dallas in the Location control.

At the same time, a known-item user may naturally type:

```text
Pappas Bros Dallas
Pappas in Houston
```

instead of using both controls.

The product should tolerate that without turning every restaurant query into a location search.

---

## 14.2 Primary request

The standard request uses Algolia's request-time:

```text
restrictSearchableAttributes
```

with:

```text
name
name_compact
food_type
```

### Business meaning

> **Keep the primary search box focused on restaurant identity and cuisine.**

Location is still available through the dedicated location experience.

---

## 14.3 Zero-result branch fallback

Manual browser validation found that:

```text
Pappas Bros Dallas
```

could succeed in broad index-level tests but fail in the application because the UI intentionally restricted the primary request.

### Decision

When:

```text
query is non-empty
AND
primary request returns 0 results
```

the application retries using all configured searchable attributes.

This allows lower-priority location fields to contribute only when the normal restaurant/cuisine interpretation failed.

### Result

```text
Pappas Bros Dallas
Pappas Bros Houston
Pappas Houston
Pappas Huston
```

all resolve appropriately.

---

# 15. Natural branch-query recovery — `removeStopWords`

After the branch fallback was added, another manual test exposed a systematic failure:

```text
Pappas in Houston
Pappas in Huston
Pappas Bros in Houston
```

The important issue was not Houston or typo tolerance. The extra word `in` became another required query term.

### Algolia capability

On the fallback request only:

```text
removeStopWords: ['en']
```

### Business meaning

> **Allow natural branch phrasing without enabling full natural-language behavior globally.**

The primary restaurant/cuisine request does **not** use stop-word removal.

The fallback does because that is where a natural phrase such as:

```text
Pappas in Houston
```

needs to reduce to the meaningful intent:

```text
Pappas Houston
```

### Why not enable it globally?

Algolia's documentation recommends stop-word removal mainly for natural-language queries and notes that keyword search usually works better without it.

The project therefore uses it only after the more precise primary request has already failed.

### Final tested behavior

```text
Pappas Houston           ✓
Pappas Huston            ✓
Pappas in Houston        ✓
Pappas in Huston         ✓
Pappas Bros Houston      ✓
Pappas Bros in Houston   ✓
```

### Accepted boundary

```text
pappashuston
```

remains unsupported.

That value combines restaurant fragment + misspelled city into one malformed token. Solving it would require broader custom parsing or synthetic cross-field aliases, which was not justified by the assignment evidence.

---

# 16. Cuisine refinement — `searchable(food_type)`

### Business feature

**Move from broad inspiration to exact cuisine selection**

Free-text cuisine search and an explicit cuisine refinement serve different purposes.

A query such as:

```text
Italian
```

is recall-oriented.

Clicking:

```text
Italian
```

as a cuisine refinement should produce the exact normalized category.

### Algolia capability

```text
searchable(food_type)
```

in `attributesForFaceting`.

This does two things:

1. enables exact faceting/filtering on cuisine;
2. allows searching within the facet values, useful for a long cuisine taxonomy.

### Dataset support

Normalized cuisine values: **112**.

Largest categories include:

```text
American                 865
Italian                  850
Contemporary American    649
Steakhouse               451
Seafood                  267
French                   167
Japanese                 140
Sushi                     67
```

### Validation

```text
Broad text query "Italian"           874
Exact Italian facet                  850
Text "Italian" + Italian facet       850
```

### Why this distinction matters

The extra text-search matches are not necessarily wrong. A restaurant name can contain `Italian` or `Italiana` even when the exact normalized cuisine category behaves differently.

The facet is the explicit taxonomy contract.

---

# 17. Dining-style refinement — `dining_style`

### Business feature

**Filter by the experience the diner wants**

Dining style supports comparison without adding noise to free-text restaurant retrieval.

Dataset:

```text
Casual Dining     2,203
Casual Elegant    2,130
Fine Dining         641
Home Style           26
```

### Algolia capability

Regular facet:

```text
dining_style
```

### Why not searchable?

There are only four values, so a searchable facet adds little value.

### Validation

```text
Fine Dining                       641
Italian + Fine Dining              97
Steakhouse + Casual Elegant       190
Italian + Casual Dining           401
```

---

# 18. Rating refinement — `filterOnly(stars_count)`

### Business feature

**Help exploratory users narrow to stronger-rated options**

Ratings are concentrated toward the high end, so arbitrary thresholds would create controls that look different but barely change the catalog.

Observed coverage:

```text
4.0+   4,456   89.1%
4.2+   3,787   75.7%
4.4+   2,419   48.4%
4.5+   1,590   31.8%
4.6+     828   16.6%
4.7+     332    6.6%
4.8+     107    2.1%
```

### Decision

Use two meaningful presets:

```text
Top rated    4.5+
Exceptional  4.7+
```

### Algolia capability

```text
filterOnly(stars_count)
```

with numeric filters such as:

```text
stars_count >= 4.5
stars_count >= 4.7
```

### Why `filterOnly`?

The application needs to apply numeric conditions. It does not need Algolia to return a list of star-rating facet values.

`filterOnly` enables filtering while avoiding unnecessary facet-value handling.

---

# 19. Price refinement — `filterOnly(price_tier)`

### Business feature

**Let diners narrow by expected price level**

The two price dimensions remain separate:

```text
price_tier             → $$ / $$$ / $$$$
starting_price_range   → $30 and under / $31 to $50 / $50 and over
```

### Decision

Use `price_tier` as the only interactive price refinement.

Display `starting_price_range` as supporting context rather than creating a second competing price filter.

### Algolia capability

```text
filterOnly(price_tier)
```

### Validation

```text
$$      3,159
$$$     1,545
$$$$      296
Total   5,000
```

Combined examples:

```text
Italian + $$                 580
Fine Dining + $$$$           173
4.7+ with $$ or $$$          263
```

---

# 20. Payment compatibility — `payment_options`

### Business feature

**Avoid discovering payment incompatibility only after choosing a restaurant**

Payment method can be a hard constraint for some diners. The prototype allows users to narrow the catalog before booking.

Observed taxonomy: **9 payment methods**.

Examples:

```text
AMEX         4,858
Cash Only        7
Visa          4,984
```

### Algolia capability

Regular facet:

```text
payment_options
```

### Why not `filterOnly(payment_options)`?

Unlike price or numeric rating, the UI uses payment facet values/counts to populate the refinement experience.

A regular facet therefore supports both filtering and the facet-value information consumed by the UI.

### Filter semantics

Multiple selected payment methods use OR within the payment group and AND against other refinement groups.

Conceptually:

```text
(Visa OR AMEX)
AND Italian
AND Fine Dining
```

---

# 21. Quality-aware default discovery — `customRanking`

### Business feature

**Show credible choices when textual intent is weak or absent**

An empty query is central to discovery. Without a business relevance signal, result ordering can reflect ingestion order rather than a useful product decision.

### Baseline

Initial empty-query examples included restaurants such as:

```text
The Edgewater Grill   3.9 stars   186 reviews
Harbor House          4.1 stars   420 reviews
Pier Cafe             4.1 stars   186 reviews
```

The order was not an interpretable quality ranking.

### Candidates evaluated

#### Raw star rating

Problem:

5-star restaurants with review counts such as:

```text
44
33
22
19
15
13
```

could dominate.

Conclusion:

> Rating alone over-rewards small samples.

#### Raw review count

Problem:

A **3.9-star** restaurant with **5,347 reviews** appeared in the top 10 by review count.

Conclusion:

> Review volume alone over-rewards popularity.

#### Bayesian rating

Balances observed star rating with review confidence.

### Algolia capability

```text
customRanking:
desc(bayesian_rating)
```

Algolia's normal ranking criteria continue to determine textual relevance first. Custom ranking breaks ties after the default relevance criteria.

### Why this matters

A user searching for a restaurant name should still get the best textual match.

A user browsing broadly should get higher-quality ordering among records that are otherwise similarly relevant.

### Validation

Top empty-query results after custom ranking included:

```text
Russell's Steaks, Chops, and More   4.9   2,512 reviews
Quince Restaurant                   4.9   1,693
Mama's Fish House                   4.8  12,669
GW Fins                             4.8   5,523
Restaurant August                   4.8   4,668
```

The project did **not** reorder Algolia's default ranking criteria.

---

# 22. Local restaurant discovery — “Near Me”

### Business feature

**Make proximity relevant only when the user explicitly asks for local discovery**

For Persona 2, distance can be highly actionable. For Persona 1, it can distort restaurant identity.

### Algolia data capability

Every restaurant record includes:

```text
_geoloc
```

### Algolia query capabilities

Near Me uses:

```text
aroundLatLng
aroundRadius
```

The application converts the user-facing **25-mile** radius to meters for the request.

It also requests ranking information when geo is active.

### Why request-time instead of global?

Geo intent is contextual.

Applying proximity to every query created undesirable behavior in tests with ambiguous terms such as `Town`.

A nearby restaurant could outrank the exact known-item restaurant because geo enters Algolia's ranking criteria when geo search is active.

### Final decision

```text
Known-item free text
→ no implicit geo

Explicit selected location
→ structured location filters

Near Me
→ aroundLatLng + 25-mile aroundRadius
```

### Important final correction

Earlier experiments considered silently removing the radius when no nearby match existed.

Manual UX testing showed that this violated explicit user intent.

Example:

```text
French + Near Me + Hidden Gems
```

had no nearby match.

Silently returning nationwide restaurants made the interface look successful while ignoring the user's selected Near Me constraint.

### Final behavior

> **Near Me is a hard user-selected constraint.**

When no restaurants match within 25 miles, the application keeps the radius and shows an intent-aware zero-result message.

---

# 23. Structured location discovery

### Business feature

**Let the user explicitly choose city, area, or neighborhood instead of overloading the text box**

The location selector is separate from restaurant/cuisine search.

This makes location intent explicit and allows options to be disambiguated by context.

### Search behavior

Selected location values become structured facet filters.

Examples:

```text
city
state
area
neighborhood
```

The final Algolia configuration includes:

```text
filterOnly(city)
filterOnly(state)
filterOnly(area)
filterOnly(neighborhood)
```

### Why `filterOnly`?

The app's location controller owns the location-choice experience. The general results sidebar does not need Algolia to return these fields as displayed facet lists.

---

# 24. Discovery of highly rated, less-established restaurants — “Hidden Gems”

### Business feature

**Surface strong restaurants users might not already know**

Persona 2 needs inspiration, not only a narrowing interface.

A default ranking based on review confidence naturally favors established restaurants. That is useful for Recommended ordering but can make newer or less-reviewed options harder to discover.

Hidden Gems creates a separate discovery path for strong restaurants that have not yet accumulated large review volume.

### Rule

```text
stars_count >= 4.7
reviews_count <= 200
```

### Dataset support

Qualifying restaurants:

```text
108
```

### Algolia capabilities

Numeric filtering on:

```text
stars_count
reviews_count
```

Both are configured for filtering.

### Why a discovery mode instead of another ranking?

The business meaning is different.

Recommended asks:

> Which broadly strong restaurants should appear first?

Hidden Gems asks:

> Which exceptional but less-established restaurants deserve deliberate exposure?

Low review count should not make a restaurant globally more relevant.

Keeping Hidden Gems as an explicit mode preserves the main ranking model.

---

# 25. Geographic exploration — Map view

### Business feature

**Help users understand a large result set spatially**

A list alone becomes difficult to explore in markets with hundreds of matches.

The map gives Persona 2 geographic context while keeping the same search and refinement intent.

### Technology split

```text
Algolia
→ retrieval, filtering, text relevance, geo constraints

Leaflet
→ visual map rendering and interaction

OpenStreetMap
→ basemap tiles for the low-volume prototype
```

### List vs Map result strategy

List:

```text
12 top hits
```

Map:

```text
up to 1,000 matching hits
```

The map request reuses the same query-builder logic rather than creating a separate filter system.

### Why different hit counts?

The List is a ranked decision surface: showing too many cards at once reduces usability.

The Map is an exploration surface: it benefits from broader spatial coverage.

When total matches exceed the visualization cap, the UI discloses it, for example:

```text
Map showing 1,000 of 5,000 matching restaurants.
```

### Production trade-off

For production-scale mapping, clustering, viewport-based loading, or geographic pagination would be preferable to sending a large flat marker set.

---

# 26. Booking handoff

### Business feature

**Move the search/discovery session toward the prospect's conversion goal**

The prototype uses the provided:

```text
reserve_url
```

for the **Book table** action.

The same booking action is available from:

- restaurant cards;
- map popups.

### URL evaluation

A sample of booking URLs was tested.

The standard `reserve_url` worked for the large majority of sampled records, while the supplied `mobile_reserve_url` behaved as a legacy destination and did not provide a reliable mobile path in testing.

### Decision

Use `reserve_url` consistently.

### Why not show reservation times?

The assignment dataset does not include live table availability, and no availability API credentials were provided.

The prototype therefore hands off to OpenTable rather than fabricating live inventory.

---

# 27. Zero-result UX

A technically correct zero-result response can still create a poor product experience.

The final UI uses intent-aware messages rather than one generic error.

Examples include:

```text
No hidden gems nearby
Nothing matched nearby
No hidden gems in [location]
We couldn't find "[query]"
No restaurants matched in [location]
```

The language uses user concepts such as preferences, cuisine, and nearby distance rather than implementation language such as “clear a refinement.”

This is application UX, not Algolia configuration, but it is part of making search behavior understandable.

---

# 28. Why the prototype uses one Recommended ordering

The prospect context mentions useful discovery and sorting experiences, but the dataset did not provide enough business evidence to justify multiple competing sort modes.

Possible alternatives such as:

```text
Highest rated
Most reviewed
Nearest
```

would each encode a different product objective.

Instead, the prototype uses one explainable default:

```text
Recommended · Rating + review confidence
```

Distance becomes dominant only when the user explicitly chooses a local geo experience such as Near Me.

This reduces unexplained product behavior and keeps the relevance model defensible.

---

# 29. Application layer vs Algolia layer

One of the most important architectural distinctions is **where each decision belongs**.

| Business behavior | Mechanism | Layer | Why |
| --- | --- | --- | --- |
| Restaurant identity priority | `searchableAttributes` | Algolia settings | Global relevance model |
| Concatenated-name recovery | `name_compact` | Search projection | Additional representation, not source cleanup |
| Cuisine search | `food_type` searchable | Algolia settings | Global discovery capability |
| Exact cuisine refinement | `searchable(food_type)` | Algolia settings | Searchable facet values + exact refinement |
| Rating filtering | `filterOnly(stars_count)` | Algolia settings | Numeric filtering only |
| Price filtering | `filterOnly(price_tier)` | Algolia settings | Numeric filtering only |
| Location filtering | `filterOnly(city/state/area/neighborhood)` | Algolia settings | Enables structured location constraints |
| Payment refinement | `payment_options` | Algolia settings | UI needs facet values/counts |
| Quality tie-breaker | `desc(bayesian_rating)` | Algolia settings | Business relevance after textual relevance |
| Keep main search name/cuisine focused | `restrictSearchableAttributes` | Search request | Depends on UI intent |
| Branch recovery after zero results | broaden search scope | Search controller | Only needed after primary failure |
| `Pappas in Houston` recovery | `removeStopWords: ['en']` | Fallback request | Natural phrasing only on fallback |
| Near Me | `aroundLatLng`, `aroundRadius` | Search request | Depends on current user location |
| Hidden Gems | numeric filter combination | Query builder | Product discovery mode |
| List 12 / Map 1,000 | `hitsPerPage` | Query builder/UI | Different presentation purposes |
| Map rendering | Leaflet | Front end | Visualization, not retrieval |
| Booking | `reserve_url` | Front end | Conversion handoff |

This table separates what Algolia is responsible for from what the application is responsible for.

---

# 30. Final Algolia facets and filters

Authoritative `attributesForFaceting`:

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

## Why `searchable(food_type)`?

The cuisine taxonomy is long enough that users benefit from searching the facet values.

## Why plain `dining_style`?

Only four values exist, so searchable facet behavior is unnecessary.

## Why `filterOnly` for stars, price, location, and review count?

These attributes are needed as constraints, but the relevant UI does not require their facet-value lists from Algolia.

Algolia documents `filterOnly` specifically for attributes used for filtering when facet values don't need to be displayed.

## Why payment is different

The payment UI consumes the values/counts, so `payment_options` remains a regular facet.

---

# 31. Final custom ranking

```text
customRanking:
desc(bayesian_rating)
```

This is intentionally the only custom-ranking criterion.

The project did not change Algolia's default ranking-order criteria.

That preserves the engine's standard textual relevance behavior and uses the derived quality metric as the business tie-breaker.

---

# 32. Representative search-quality tests

## Known-item

```text
Epernay                         → 1
Epernay Denver                  → 1
Pappas Bros Steakhouse          → 2 valid locations
Pappas Bros Dallas              → Dallas branch
Pappas Bros Houston             → Houston branch
Pappas                          → brand matches plus a typo-near Pampas result
Town Carbondale                 → 1
Atrias PNC Park                 → 1
Atrias O'Hara                   → 1
```

## Concatenation and typo

```text
pappasbros                      → 2
pappasbrossteakhouse            → 2
pappasbrosteakhouse             → 2
pappasbrossteakhose             → 2
labellavita                     → 2
labellvit                       → 2
thecedarssocial                 → 1
ppapasbrostakehouse             → 0 accepted boundary
```

## Final branch-query browser validation

```text
Pappas Houston                  ✓
Pappas Huston                   ✓
Pappas in Houston               ✓
Pappas in Huston                ✓
Pappas Bros Houston             ✓
Pappas Bros in Houston          ✓
```

---

# 33. Representative refinement validation

| Test | Matching records |
| --- | ---: |
| Exact Italian cuisine | 850 |
| Broad text `Italian` | 874 |
| Fine Dining | 641 |
| Italian + Fine Dining | 97 |
| Steakhouse + Casual Elegant | 190 |
| Rating 4.5+ | 1,590 |
| Rating 4.7+ | 332 |
| Italian + 4.5+ | 247 |
| Italian + 4.7+ | 41 |
| Fine Dining + 4.7+ | 98 |
| `$$` | 3,159 |
| `$$$` | 1,545 |
| `$$$$` | 296 |
| Italian + `$$` | 580 |
| Fine Dining + `$$$$` | 173 |
| Hidden Gems | 108 |
| Cash Only | 7 |
| AMEX | 4,858 |
| New York + Italian + AMEX | 145 |

The intent of these tests is not just to prove the API returns records. It is to compare Algolia results with known dataset populations and confirm the filters mean what the UI says they mean.

---

# 34. Manual UX findings that changed the implementation

Automated tests were necessary but not sufficient. Several final decisions came from browser validation.

## Finding 1 — `Pappas Bros Dallas` mismatch

Index-level tests passed, but the actual UI failed because the application intentionally restricted the primary searchable attributes.

**Change:** controlled zero-result location-aware fallback.

## Finding 2 — `Pappas in Houston`

Branch fallback still failed because `in` became another required term.

**Change:** English stop-word removal on the fallback request only.

## Finding 3 — Near Me silent broadening

A no-result nearby case silently returned nationwide restaurants.

**Change:** removed automatic geo fallback; Near Me became a hard constraint.

## Finding 4 — mobile horizontal overflow

At an iPhone 12 Pro-sized viewport, results-header controls extended beyond the screen.

**Change:** stack the results heading and List/Map/Recommended controls vertically at the mobile breakpoint.

These findings are useful evidence that final validation included the behavior of the actual product, not only isolated API queries.

---

# 35. Responsive/mobile validation

Representative breakpoints tested:

```text
375 px
390 px
430 px
820 px
desktop
```

Validated:

- search input;
- location selection;
- Near Me;
- filter drawer;
- active filters;
- cuisine, rating, price, dining-style, and payment controls;
- List/Map switching;
- map interaction;
- booking;
- no remaining horizontal page overflow.

The mobile filter drawer is intentionally nearly full-width to preserve usable control sizes on small screens.

---

# 36. Technology decisions

## Vanilla JavaScript + Vite

The assignment allows the implementation approach that best demonstrates Algolia understanding and value delivery.

Vanilla JavaScript keeps the architecture visible:

```text
state
query builder
search controller
location controller
UI renderers
```

without adding a framework abstraction that is not necessary for a 5,000-record prototype.

Vite provides:

- fast development;
- ES module handling;
- environment-variable support;
- production bundling.

The final production build succeeds.

## Leaflet

Leaflet was selected as a focused map-rendering library.

The map is intentionally not treated as the search engine. Algolia still determines the result set.

This keeps search logic centralized and avoids creating separate List and Map filtering behavior.

---

# 37. Reproducibility

The final setup path is intentionally simple.

```text
npm install
      ↓
build-records.js
      ↓
index-records.js
      ↓
configure-search.js --apply
      ↓
npm run dev
```

`scripts/algolia/configure-search.js` is the single authoritative final settings script.

An incremental development utility, `enable-location-filters.js`, remains in the repository but is not required for a clean setup.

This avoids a reviewer having to reproduce the chronological order in which features were added.

---

# 38. Trade-offs and accepted boundaries

## No arbitrary natural-language parser

The prototype supports practical branch phrases but does not attempt to understand every possible natural-language restaurant request.

Why:

> A narrow Algolia-based fallback solved the observed customer behavior without introducing a separate NLP system.

## No speculative synonym dictionary

The dataset did not provide verified restaurant aliases.

Typos, punctuation, concatenation, and location context were tested, but business aliases were not invented.

## No support for every malformed concatenated cross-field query

Example accepted boundary:

```text
pappashuston
```

Solving that would require broader parsing or new synthetic aliases across restaurant and city fields.

## No silent Near Me expansion

A zero-result local search is preferable to pretending that distant restaurants satisfy an explicit Near Me constraint.

## No fabricated live reservation availability

The prototype uses the provided booking URL and delegates inventory to OpenTable.

## No multiple unsupported sort strategies

The project uses one explainable Recommended ordering instead of exposing product decisions that the data cannot justify.

## Map capped at 1,000 records

Appropriate for the prototype; clustering or viewport-based querying would be considered for production.

## Source image limitation accepted

The supplied URLs did not provide restaurant-specific imagery.

---

# 39. What I would measure in a production evaluation

The assignment dataset can validate correctness and relevance behavior, but it cannot prove business impact.

A production evaluation could measure:

## Known-item search

- zero-result rate;
- reformulation rate;
- click-through on top results;
- time to restaurant selection;
- branch-selection accuracy;
- booking conversion after known-item searches.

## Discovery

- refinement usage;
- cuisine engagement;
- Hidden Gems engagement;
- map usage;
- result-detail click-through;
- booking conversion after discovery;
- abandonment after zero results.

## Relevance experiments

Potential A/B tests:

- Bayesian confidence strength;
- Hidden Gems thresholds;
- default Nearby entry points;
- discovery-chip selection;
- result-card information density.

The current thresholds are evidence-based prototype decisions, not claims of globally optimal production behavior.

---

# 40. Algolia capabilities implemented

This section summarizes the “why” behind each important Algolia choice.

## `searchableAttributes`

**What it does:** defines which attributes are searched and their relevance priority.

**Why used here:** restaurant name must outrank compact alias, cuisine, and location.

**Final order:**

```text
name
name_compact
food_type
city,neighborhood
area
state
```

**Question to be ready for:**
Why not search every field equally?

**Answer:**
Because field priority expresses user intent. Restaurant identity is a stronger known-item signal than cuisine or broad geography.

---

## `unordered(attribute)`

**What it does:** removes match-position preference within that searchable attribute.

**Why used here:** match position inside the name/cuisine field should not add an extra relevance distinction beyond the attribute itself.

**Question to be ready for:**
Why not leave the attributes ordered?

**Answer:**
The prototype did not have a product reason to prefer a token only because it appeared earlier in the stored restaurant name.

---

## Same-priority attributes with a comma

```text
city,neighborhood
```

**What it does:** gives multiple searchable attributes the same priority.

**Why used here:** both are specific location context, and the dataset did not justify universally ranking city above neighborhood or vice versa.

---

## `attributesForFaceting`

**What it does:** enables attributes for faceting and filtering.

**Why used here:** refinement is central to Persona 2 and to structured location behavior.

---

## `searchable(food_type)`

**What it does:** makes cuisine both facetable and searchable within the facet values.

**Why used here:** 112 normalized cuisine values are too many to expose as a flat control, while exact cuisine refinement remains valuable.

---

## `filterOnly(attribute)`

**What it does:** enables filtering without exposing the attribute as a normal facet-value source.

**Why used here:** numeric rating, price, review count, and structured location constraints are applied programmatically; the UI does not need their generic facet lists.

---

## `customRanking`

**What it does:** applies business ranking attributes after Algolia's default relevance criteria to break remaining ties.

**Why used here:** empty/broad discovery needs quality ordering without letting quality override restaurant-name relevance.

**Final setting:**

```text
desc(bayesian_rating)
```

---

## `_geoloc`

**What it does:** stores record coordinates used by Algolia geo search.

**Why used here:** all 5,000 restaurants had usable coordinates, enabling explicit local discovery.

---

## `aroundLatLng`

**What it does:** provides the search center for a geo request.

**Why used here:** Near Me uses the browser-provided user location.

---

## `aroundRadius`

**What it does:** caps the geographic search radius.

**Why used here:** the product exposes an explicit 25-mile Near Me promise.

---

## `restrictSearchableAttributes`

**What it does:** limits a particular request to a subset of configured searchable attributes while preserving the configured priority among them.

**Why used here:** keep the main restaurant box focused on `name`, `name_compact`, and `food_type` so a plain city query does not duplicate the Location control.

---

## `removeStopWords`

**What it does:** removes common low-value query terms for selected languages.

**Why used here:** only the zero-result branch fallback needs natural phrasing such as:

```text
Pappas in Houston
```

The project uses:

```text
removeStopWords: ['en']
```

only on that fallback.

---

## Numeric filters

**What they do:** constrain numerical record attributes.

**Why used here:**

```text
stars_count >= 4.5
stars_count >= 4.7
price_tier = 2
reviews_count <= 200
```

They directly represent user-facing rating, price, and Hidden Gems logic.

---

## `facetFilters`

**What it does:** applies categorical facet constraints, including OR groups.

**Why used here:** cuisine, dining style, payment, and selected location categories can combine predictably.

Example conceptual logic:

```text
Italian
AND Fine Dining
AND (Visa OR AMEX)
```

---

# 41. Algolia documentation references

These official documentation pages are useful for reviewing the capabilities used in the project:

- [searchableAttributes](https://www.algolia.com/doc/api-reference/api-parameters/searchableAttributes)
- [restrictSearchableAttributes](https://www.algolia.com/doc/api-reference/api-parameters/restrictSearchableAttributes)
- [attributesForFaceting](https://www.algolia.com/doc/api-reference/api-parameters/attributesForFaceting)
- [customRanking](https://www.algolia.com/doc/api-reference/api-parameters/customRanking)
- [Custom ranking guide](https://www.algolia.com/doc/guides/managing-results/must-do/custom-ranking)
- [Ranking criteria](https://www.algolia.com/doc/guides/managing-results/relevance-overview/in-depth/ranking-criteria)
- [aroundLatLng](https://www.algolia.com/doc/api-reference/api-parameters/aroundLatLng)
- [removeStopWords](https://www.algolia.com/doc/api-reference/api-parameters/removeStopWords)
- [Search API parameters](https://www.algolia.com/doc/api-reference/search-api-parameters)

---

# 42. Final implementation summary

The final prototype does not rely on one search trick.

It combines:

```text
evidence-backed data cleanup
        +
search-specific record projection
        +
Algolia relevance configuration
        +
request-time intent handling
        +
structured refinement
        +
geo search
        +
quality-aware ranking
        +
discovery features
        +
List/Map exploration
        +
booking handoff
```

The most important design principle is that each behavior is implemented at the layer where it belongs.

Restaurant identity and business ranking are configured globally where they should be consistent.

Near Me, branch fallback, and stop-word removal are contextual because user intent determines when they are appropriate.

The result is a prototype that supports both prospect personas without forcing known-item search and open-ended discovery into the same relevance behavior, also demonstrates Algolia support to business value.

# 43. Deployment

### Public application deployment — Vercel

The final prototype is deployed as a production Vite application on Vercel and was smoke-tested after deployment.

Vercel is used only as the deployment layer. The assignment source code and technical documentation remain in the `algolia-opentable-discovery` repository.

Deployment flow:

```text
algolia-opentable-discovery
        ↓
production Vite build
        ↓
Vercel
        ↓
public HTTPS application
        ↓
Algolia Search API
```

The deployed browser application receives only:

- `VITE_ALGOLIA_APP_ID`
- `VITE_ALGOLIA_SEARCH_API_KEY`
- `VITE_ALGOLIA_INDEX_NAME`

The Algolia write API key is not deployed.

Indexing records and changing Algolia settings remain administrative operations performed through the local Node.js scripts using the write credential.

This keeps the public application limited to search access while preserving write access for controlled setup and maintenance operations.

### Production validation

After deployment, the public application was retested for:

- known-item search;
- typo and branch-query recovery;
- cuisine and structured refinements;
- Hidden Gems;
- Near Me;
- List and Map behavior;
- booking links;
- responsive/mobile behavior.

The deployed application produced the same expected behavior as the locally validated production build.
https://algolia-opentable-deployment-ifwxs2nrq-msm-se-test.vercel.app/