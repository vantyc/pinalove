# PinaLove Review

Private dashboard to review dating profiles imported from a personal PinaLove account.

This phase is **review-only**. It does not scrape PinaLove, log in to PinaLove, or send messages.

The system may **propose** a classification or a message. A human always decides. There is no Auto Send endpoint.

Public URL: `https://tool4trip.com/pinalove/`

---

## Architecture

Independent app, independent image, independent Deployment/Service.

Reuses existing Tool4Trip infrastructure:

| Piece | Reuse |
|---|---|
| Domain | `tool4trip.com` |
| Namespace | `tool4trip` |
| TLS | Secret `tool4trip-tls` |
| Auth | Traefik ForwardAuth middleware `tool4trip-forwardauth` (cookie `tool4trip_session`) |
| Image pull | Secret `ghcr-registry` |

Routing:

```
tool4trip.com
    │
 Ingress (Traefik)
    ├── /              → tool4trip-web     (priority 50)
    ├── /api/agent     → travel-agent      (priority 80)
    ├── /login etc.    → tool4trip-auth    (priority 100, public)
    └── /pinalove      → pinalove          (priority 70, ForwardAuth)
```

The PinaLove Ingress is **new**. It does not replace `tool4trip-web`.

The UI and API both live under `/pinalove/`. The app never assumes it is mounted at `/`.

```
frontend (Vite/React)  ─┐
                         ├─ one Node process ─ Service pinalove
backend (Node/SQLite) ─┘
```

## Persistence

SQLite at **`/data/pinalove.sqlite`** inside the container.

Kubernetes storage (mandatory pattern, same principle as Condo hostPath cutover):

- **hostPath:** `/var/lib/pinalove` on worker `productos-workers-43832f42f8e58773`
- **mount:** `/data`
- **replicas:** 1
- **strategy:** Recreate
- **nodeSelector:** `kubernetes.io/hostname: productos-workers-43832f42f8e58773`

**Not used (and must not be added later by accident):**

- PersistentVolumeClaim
- PersistentVolume
- StorageClass
- Hetzner CSI volume (`hcloud-volumes`)

If the pod restarts **on the same node**, SQLite remains. If it were scheduled on another node, the database would appear empty. The nodeSelector exists to prevent that.

Git contains **only** this hostPath design. There is no alternate PVC manifest.

### Backup (not in the first deploy)

Next step, without creating storage:

CronJob pinned to the **same worker**, copying `/var/lib/pinalove/pinalove.sqlite*` to the **existing** backup disk already mounted there:

`/mnt/HC_Volume_105166778/pinalove/`

Do not provision a new Hetzner volume for this.

## Security

- Ingress uses the same ForwardAuth gate as Tool4Trip. Unauthenticated visits to `/pinalove/` redirect to `/login`.
- ClusterIP only. No NodePort.
- No usernames, passwords, API keys, cookies, or PinaLove credentials in Git.
- After login, Tool4Trip auth currently redirects to `/` (existing behavior). Open `/pinalove/` afterwards, or bookmark it.

## Project layout

```
shared/                 types, rule config, explainable scoring
backend/               Node HTTP API + SQLite
frontend/               React UI (base /pinalove/)
fixtures/               fictitious sample profiles
deploy/k3s/             Deployment, Service, Ingress (hostPath only)
docs/ops/               operational notes
```

## Local development

```bash
cp .env.example .env   # optional
npm ci
npm run dev            # API :8787 + Vite :5173
```

Open `http://127.0.0.1:5173/pinalove/`. Vite proxies `/pinalove/api` to the backend.

SQLite locally: `./data/pinalove.sqlite` (gitignored). Empty DB is seeded from `fixtures/sample-profiles.json`.

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm start              # serves UI+API from dist on LISTEN_ADDR
```

## Import JSON

```bash
curl -sS -X POST http://127.0.0.1:8787/pinalove/api/profiles/import \
  -H 'content-type: application/json' \
  --data-binary @fixtures/sample-profiles.json
```

Accepted: a JSON array of profiles, or `{ "profiles": [ ... ] }`.

Upsert key: `source + externalId` (fallback: `profileUrl`). Discarded rows are **never deleted**.

## API

All routes are under `/pinalove/`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/pinalove/healthz` | liveness |
| GET | `/pinalove/api/profiles` | list + filters |
| GET | `/pinalove/api/profiles/:id` | detail |
| POST | `/pinalove/api/profiles/import` | JSON import |
| PATCH | `/pinalove/api/profiles/:id/status` | move between review states |
| PATCH | `/pinalove/api/profiles/:id/decision` | human decision note |
| GET | `/pinalove/api/profiles/:id/history` | audit log |
| GET | `/pinalove/api/dashboard/stats` | counts |
| GET | `/pinalove/api/config/rules` | scoring/rules config |
| PUT | `/pinalove/api/config/rules` | update weights and rescore |

There is **no** `/send-message` route.

Query filters: `ageMin`, `ageMax`, `country`, `location`, `distanceMax`, `hasChildren`, `relationshipStatus`, `maritalHistory`, `religion`, `verified`, `scoreMin`, `scoreMax`, `status`, `flags`, `search`, `shortcut`.

Shortcuts: `mexico`, `cdmx`, `no-children`, `never-married`, `verified`, `needs-review`, `high-score`.

Scoring weights live in `shared/defaultRules.ts` and can be changed at runtime via `PUT /api/config/rules` without rewriting the app.

## Docker

```bash
docker build -t ghcr.io/vantyc/pinalove:latest .
docker run --rm -p 8080:8080 -v "$PWD/data:/data" ghcr.io/vantyc/pinalove:latest
curl -sS http://127.0.0.1:8080/pinalove/healthz
```

## Kubernetes

Validate storage constraints before apply:

```bash
bash scripts/validate-k8s-storage.sh
```

Apply **new** resources only (does not edit existing Tool4Trip objects):

```bash
kubectl apply -f deploy/k3s/00-deployment.yaml
kubectl apply -f deploy/k3s/01-service.yaml
kubectl apply -f deploy/k3s/02-ingress.yaml
```

Image: `ghcr.io/vantyc/pinalove:latest` (pull secret `ghcr-registry` already in namespace `tool4trip`).

```bash
docker build -t ghcr.io/vantyc/pinalove:latest .
docker push ghcr.io/vantyc/pinalove:latest
kubectl -n tool4trip rollout restart deploy/pinalove
```

## Rules / scoring

Explainable, not a black box. Unknown facts stay `UNKNOWN` (never coerced to `NO`/`false`). `SINGLE` is not assumed to mean `NEVER_MARRIED`. Flags are review indicators (“Possible scam indicators detected”), not accusations.

Human-in-the-loop statuses: `UNREVIEWED`, `POTENTIAL`, `SHORTLISTED`, `DISCARDED`, `MANUAL_REVIEW`, `CONTACTED`.
