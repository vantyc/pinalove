#!/usr/bin/env bash
# Fail if PinaLove Kubernetes manifests introduce forbidden storage.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$ROOT/deploy/k3s"
FAIL=0

echo "Validating Kubernetes manifests in $DIR"

if ! ls "$DIR"/*.yaml >/dev/null 2>&1; then
  echo "FAIL: no yaml manifests"
  exit 1
fi

check_absent() {
  local pattern="$1"
  local label="$2"
  if grep -RInE "$pattern" "$DIR" --include='*.yaml' --include='*.yml'; then
    echo "FAIL: found $label"
    FAIL=1
  else
    echo "PASS: no $label"
  fi
}

check_absent 'kind:[[:space:]]*PersistentVolumeClaim' 'PersistentVolumeClaim'
check_absent 'kind:[[:space:]]*PersistentVolume([^C]|$)' 'PersistentVolume'
check_absent 'kind:[[:space:]]*StorageClass' 'StorageClass'
check_absent 'hcloud-volumes' 'hcloud-volumes reference'
check_absent 'persistentVolumeClaim:' 'persistentVolumeClaim volume'
check_absent 'csi.hetzner' 'Hetzner CSI'
check_absent 'storageClassName:' 'storageClassName'

if ! grep -RIn 'hostPath:' "$DIR" --include='*.yaml' >/dev/null; then
  echo "FAIL: hostPath missing"
  FAIL=1
else
  echo "PASS: hostPath present"
fi

if ! grep -RIn '/var/lib/pinalove' "$DIR" --include='*.yaml' >/dev/null; then
  echo "FAIL: host path /var/lib/pinalove missing"
  FAIL=1
else
  echo "PASS: host path /var/lib/pinalove"
fi

if ! grep -RIn 'mountPath: /data' "$DIR" --include='*.yaml' >/dev/null; then
  echo "FAIL: mountPath /data missing"
  FAIL=1
else
  echo "PASS: mountPath /data"
fi

if ! grep -RIn 'productos-workers-43832f42f8e58773' "$DIR" --include='*.yaml' >/dev/null; then
  echo "FAIL: nodeSelector hostname missing"
  FAIL=1
else
  echo "PASS: nodeSelector hostname"
fi

if ! grep -RIn 'type: Recreate' "$DIR" --include='*.yaml' >/dev/null; then
  echo "FAIL: Recreate strategy missing"
  FAIL=1
else
  echo "PASS: Recreate strategy"
fi

if grep -RIn 'replicas: [^1]' "$DIR"/00-deployment.yaml; then
  echo "FAIL: replicas is not 1"
  FAIL=1
else
  echo "PASS: replicas 1"
fi

if ! grep -RIn 'tool4trip-tool4trip-forwardauth@kubernetescrd' "$DIR"/02-ingress.yaml >/dev/null; then
  echo "FAIL: ForwardAuth middleware missing on Ingress"
  FAIL=1
else
  echo "PASS: ForwardAuth middleware on Ingress"
fi

if ! grep -RIn 'AUTH_PROXY_HEADER' "$DIR"/00-deployment.yaml >/dev/null; then
  echo "FAIL: AUTH_PROXY_HEADER missing"
  FAIL=1
else
  echo "PASS: AUTH_PROXY_HEADER"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "Kubernetes storage validation FAILED"
  exit 1
fi
echo "Kubernetes storage validation OK"
