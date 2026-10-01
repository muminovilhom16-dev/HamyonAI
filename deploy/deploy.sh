#!/usr/bin/env bash
# Hamyon AI — one-command deploy on a single VPS (Ubuntu/Debian with Docker).
#   ./deploy.sh          first deploy or redeploy (build, migrate, start, set webhook)
#   ./deploy.sh update   git pull + redeploy
#   ./deploy.sh status   container health + public health check
#   ./deploy.sh logs     follow app logs
#   ./deploy.sh backup   run a backup now
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE=(docker compose -f docker-compose.prod.yml)

die() { echo "✗ $*" >&2; exit 1; }
ok() { echo "✓ $*"; }

command -v docker >/dev/null || die "Docker o'rnatilmagan: https://docs.docker.com/engine/install/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 kerak"

ensure_env() {
  if [ ! -f .env ]; then
    cp .env.production.example .env
    chmod 600 .env
    die "deploy/.env yaratildi. DOMAIN, ACME_EMAIL, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME ni to'ldiring va qayta ishga tushiring."
  fi
  chmod 600 .env
  # Generate missing secrets (never printed).
  for key in POSTGRES_PASSWORD TELEGRAM_WEBHOOK_SECRET AUTH_TOKEN_SECRET BACKUP_ENCRYPTION_KEY; do
    if ! grep -qE "^${key}=.+" .env; then
      value=$(openssl rand -hex 32)
      if grep -qE "^${key}=" .env; then sed -i "s|^${key}=.*|${key}=${value}|" .env; else echo "${key}=${value}" >> .env; fi
      ok "$key generatsiya qilindi"
    fi
  done
  set -a; . ./.env; set +a
  for key in DOMAIN TELEGRAM_BOT_TOKEN TELEGRAM_BOT_USERNAME; do
    [ -n "${!key:-}" ] || die "deploy/.env: $key bo'sh"
  done
  [[ "$DOMAIN" != *example* ]] || die "DOMAIN haqiqiy domen bo'lishi kerak"
}

wait_healthy() {
  echo "… ilova ishga tushishini kutyapman"
  for _ in $(seq 1 60); do
    status=$(docker inspect -f '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q app)" 2>/dev/null || echo starting)
    [ "$status" = healthy ] && { ok "app healthy"; return; }
    sleep 3
  done
  "${COMPOSE[@]}" logs --tail=80 app
  die "app healthy bo'lmadi (yuqoridagi loglarga qarang)"
}

public_check() {
  for _ in $(seq 1 40); do
    if curl -fsS "https://${DOMAIN}/health" >/dev/null 2>&1; then ok "https://${DOMAIN} ishlayapti (HTTPS)"; return 0; fi
    sleep 3
  done
  echo "! https://${DOMAIN}/health hali javob bermadi. DNS A yozuvi shu serverga qaraganini va 80/443 portlar ochiqligini tekshiring."
  return 1
}

deploy() {
  ensure_env
  "${COMPOSE[@]}" build app
  "${COMPOSE[@]}" up -d
  wait_healthy
  if public_check; then
    "${COMPOSE[@]}" exec -T app node dist/set-webhook.js && ok "Telegram webhook va buyruqlar menyusi o'rnatildi"
  else
    echo "! Webhook HTTPS ishlagandan keyin o'rnatiladi: ./deploy.sh webhook"
  fi
  echo
  ok "Tayyor: https://${DOMAIN}  ·  bot: https://t.me/${TELEGRAM_BOT_USERNAME}"
  echo "  Eslatma: @BotFather → /setdomain → ${DOMAIN}  (sayt orqali Telegram bilan kirish uchun)"
}

case "${1:-deploy}" in
  deploy) deploy ;;
  update) git -C .. pull --ff-only && deploy ;;
  webhook) ensure_env; "${COMPOSE[@]}" exec -T app node dist/set-webhook.js ;;
  status) ensure_env; "${COMPOSE[@]}" ps; public_check || true ;;
  logs) "${COMPOSE[@]}" logs -f --tail=200 app ;;
  backup) "${COMPOSE[@]}" exec -T backup /bin/sh /backup.sh once ;;
  *) die "noma'lum buyruq: $1" ;;
esac
