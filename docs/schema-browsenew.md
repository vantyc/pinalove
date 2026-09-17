# browsenew (FASE 3A discovery)

**browsenew is an approved read-only diagnostic/enrichment capability, not a bulk ingestion strategy.**

Do not loop it. Do not import Browse until a later approved ingest.

## Endpoint

| | |
|---|---|
| Action | `browsenew` |
| URL | `GET https://www.pinalove.com/nt/app.php?i=browsenew` |
| Client | in-page `apiRequest("browsenew", payload)` default method GET |
| First-page payload | `{ searchparams, offsetLastActivity: 0, type: "browseAll" }` plus optional `av` |
| Pagination | `searchparams.offsetLastActivity = last result lastactivity`. Stop when `results.length < 15`. |
| Likes / hide | **separate** mutators: `playlikeuser`, `playhideuser`, `hideuser`. Not this action. |

`searchparams.distance` is the **search radius in km** (SPA default 25 / near-me 5). That is not the profile `distance` field.

## Distance (demonstrated for Browse)

SPA: `function toDistanceTxt(v){return locache.get("imperialunits")?toMiles(v):v}` then `i18n("km")`.

No `/1000`. Browse `distance` of `13` is shown as `13km` (`asltxt` pattern: `{age} · F · Mexico City · 13km`).

listsnew values like `13304` are a **different scale**. Metres would be consistent with ~13.3 km but listsnew display was not this function. Do not apply `/1000` to listsnew until that path is demonstrated.

## lastactivity (demonstrated)

`time2TimeAgo(v)` → `timeago.format(new Date(1e3*v))`. Unix **seconds**. Online if `nowSec - lastactivity` < 300 or 1200 depending on view.

Threshold buckets (ACTIVE_RECENT / STALE_90D / …) are **not implemented** in this phase.

## Gender

Browse items in the live deck had **no** `gender` field. `asltxt` can include `F` from `bg`. Nationality words in bio are not gender.
