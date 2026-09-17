# listsnew vs profilenew

FASE 2A (2026-09-16) ran **one** `profilenew` on a single MATCH candidate. That probe is closed.

**profilenew is an approved read-only diagnostic/enrichment capability, not a bulk ingestion strategy.**

Do not loop `profilenew` over matches. It does not pay for N extra requests.

## What profilenew does **not** resolve

| Field | listsnew | profilenew (one diagnostic) |
|---|---|---|
| maritalHistory / never married | ABSENT | ABSENT. `status=Active` is presence, **not** marital |
| religion | ABSENT | ABSENT |
| occupation | ABSENT | ABSENT |
| children | `haschildren` 0=UNKNOWN, 2=NO | same codes; `0` stays UNKNOWN |
| education | raw `0`, mapping not demonstrated | raw `0`, still UNKNOWN |

## What it can add

| Field | listsnew | profilenew |
|---|---|---|
| gender | ABSENT | PRESENT (`female` on the probe) |
| lookingfor / minage / maxage | in union, not always stored | PRESENT |
| username vs name | `name` | `username` (`name` ABSENT) |
| photos | array | object keys `0..3` |

The diagnostic MATCH row was **not** rewritten from the probe. Facts stay listsnew + explicit bio. Gender stays UNKNOWN when listsnew has no gender field. Nationality words in bio are not gender.
