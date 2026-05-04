#!/usr/bin/env bash
# check-failover.sh — Compare Replit primary vs Render backup health
# Usage: bash scripts/check-failover.sh [--flip-dns]
#
# Required env vars:
#   REPLIT_PRIMARY_URL   e.g. https://creatoros.replit.app
#   RENDER_BACKUP_URL    e.g. https://creatoros-backup.onrender.com
#
# Optional (Cloudflare DNS auto-flip):
#   CF_API_TOKEN         Cloudflare API token with DNS:Edit
#   CF_ZONE_ID           Zone ID for etgaming247.com
#   CF_RECORD_ID         DNS record ID to update
#   CF_RECORD_NAME       e.g. etgaming247.com or www.etgaming247.com
#   RENDER_CNAME         e.g. creatoros-backup.onrender.com

set -euo pipefail

PRIMARY_URL="${REPLIT_PRIMARY_URL:-}"
BACKUP_URL="${RENDER_BACKUP_URL:-}"
FLIP_DNS="${1:-}"
TIMEOUT=10

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[1;33m'
CYN='\033[0;36m'
RST='\033[0m'

divider() { echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; }

check_endpoint() {
  local label="$1" url="$2"
  if [ -z "$url" ]; then
    echo -e "  ${YEL}SKIP${RST}  $label — URL not configured"
    echo "skip"
    return
  fi
  local http body
  body=$(curl -s --max-time "$TIMEOUT" "$url/api/health" 2>/dev/null) || true
  http=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url/healthz" 2>/dev/null || echo "000")

  local db_status mem_heap status
  db_status=$(echo "$body" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "unknown")
  mem_heap=$(echo "$body" | grep -o '"heapUsed":[0-9]*' | cut -d':' -f2 || echo "?")
  status=$(echo "$body" | grep -o '"status":"[^"]*"' | head -2 | tail -1 | cut -d'"' -f4 || echo "unknown")

  if [ "$http" = "200" ]; then
    echo -e "  ${GRN}UP${RST}     $label  HTTP=$http  overall=$status  db=$db_status  heap=${mem_heap}MB"
    echo "up"
  else
    echo -e "  ${RED}DOWN${RST}   $label  HTTP=$http"
    echo "down"
  fi
}

echo ""
divider
echo -e "  ${CYN}CreatorOS Failover Health Check${RST}"
divider

echo ""
echo "Primary (Replit):"
PRIMARY_STATUS=$(check_endpoint "Replit Primary" "$PRIMARY_URL" | tail -1)

echo ""
echo "Backup (Render):"
BACKUP_STATUS=$(check_endpoint "Render Backup" "$BACKUP_URL" | tail -1)

echo ""
divider
echo "Recommendation:"

if [ "$PRIMARY_STATUS" = "up" ]; then
  echo -e "  ${GRN}✔ Primary is healthy — no failover needed.${RST}"
elif [ "$BACKUP_STATUS" = "up" ]; then
  echo -e "  ${RED}✘ Primary is DOWN — Render backup is healthy.${RST}"
  echo ""
  echo -e "  ${YEL}ACTION REQUIRED: Switch DNS to Render.${RST}"
  echo ""
  echo "  Manual DNS flip (any registrar):"
  echo "    Change the A/CNAME record for etgaming247.com to:"
  echo "    → CNAME: ${RENDER_CNAME:-creatoros-backup.onrender.com}"
  echo ""

  if [ -n "${CF_API_TOKEN:-}" ] && [ -n "${CF_ZONE_ID:-}" ] && [ -n "${CF_RECORD_ID:-}" ] && [ "$FLIP_DNS" = "--flip-dns" ]; then
    RENDER_TARGET="${RENDER_CNAME:-creatoros-backup.onrender.com}"
    RECORD_NAME="${CF_RECORD_NAME:-etgaming247.com}"
    echo "  Auto-flipping Cloudflare DNS → $RENDER_TARGET ..."
    RESP=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$CF_RECORD_ID" \
      -H "Authorization: Bearer $CF_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"CNAME\",\"name\":\"$RECORD_NAME\",\"content\":\"$RENDER_TARGET\",\"proxied\":true,\"ttl\":1}" \
      2>/dev/null)
    SUCCESS=$(echo "$RESP" | grep -o '"success":[a-z]*' | cut -d':' -f2)
    if [ "$SUCCESS" = "true" ]; then
      echo -e "  ${GRN}✔ Cloudflare DNS updated to $RENDER_TARGET${RST}"
    else
      echo -e "  ${RED}✘ Cloudflare DNS update failed:${RST}"
      echo "    $RESP"
    fi
  elif [ -n "${CF_API_TOKEN:-}" ] && [ "$FLIP_DNS" != "--flip-dns" ]; then
    echo "  Cloudflare credentials found. Run with --flip-dns to auto-switch."
  fi
elif [ "$PRIMARY_STATUS" = "skip" ] && [ "$BACKUP_STATUS" = "skip" ]; then
  echo -e "  ${YEL}No URLs configured. Set REPLIT_PRIMARY_URL and RENDER_BACKUP_URL.${RST}"
else
  echo -e "  ${RED}✘ Both primary and backup appear DOWN. Escalate immediately.${RST}"
fi

divider
echo ""
