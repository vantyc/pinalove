# Hallazgo (no corregido aquí): Condo volvió parcialmente a PVC el 14-sep-2026

PinaLove no modifica Condo. Esta nota existe solo para no perder el hallazgo.

## Qué se diseñó (cutover 2026-09-04)

Condo debía persistir en **hostPath** en el worker `productos-workers-43832f42f8e58773`:

- `/var/lib/condo/postgres`
- `/var/lib/condo/ingresos`
- `/var/lib/condo/gastos`
- `/var/lib/condo/evidencia`

con `nodeSelector` a ese hostname. Los PVC Hetzner de ~10Gi quedaron como **legacy de rollback** (caducidad de revisión 2026-10-04), no como almacenamiento de producción.

Evidencia: ReplicaSet `condo-backend-7878989577` y ControllerRevision `condo-postgres-5559866b56`.

## Qué se observó el 14-sep-2026

Un apply posterior reescribió `condo-backend` y `condo-postgres` con los manifiestos `k8s/base` que **todavía declaran PVC**. El backend actual monta otra vez:

- `condo-evidencia-data`
- `condo-gastos-soporte`
- `condo-ingresos-soporte`

y el pod del backend quedó en el **otro** worker (`productos-workers-580d1be0ae1bf4e3`). Postgres STS volvió a `claimName: condo-postgres-data`.

Los CronJobs de backup siguen leyendo hostPath `/var/lib/condo/*` en el worker original, así que pueden estar respaldando copias distintas de los writes vivos.

El kustomize de Condo en git nunca se actualizó al diseño hostPath; por eso un deploy “normal” deshace el cutover.

## Qué no hacer en esta tarea

No parchear Condo desde el repo PinaLove. Corregirlo en `/home/dev/apps/condo` en una tarea aparte: poner hostPath + nodeSelector en los YAML versionados y volver a aplicarlos.
