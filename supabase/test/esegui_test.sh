#!/usr/bin/env bash
# Prova lo schema su un Postgres locale usa-e-getta.
# Uso: bash supabase/test/esegui_test.sh   (serve PostgreSQL 15+ installato)
set -euo pipefail
QUI="$(cd "$(dirname "$0")" && pwd)"
BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d)"
PORTA="${PG_PORT:-54329}"
UTENTE_SO="$(id -un)"
esegui() { if [ "$UTENTE_SO" = root ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
[ "$UTENTE_SO" = root ] && chown postgres "$DIR"
trap 'esegui "$BIN/pg_ctl -D $DIR/dati -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
esegui "$BIN/initdb -D $DIR/dati -U postgres -A trust" >/dev/null
esegui "$BIN/pg_ctl -D $DIR/dati -o '-p $PORTA -k $DIR -c wal_level=logical' -l $DIR/log -w start" >/dev/null
PSQL=(psql -o /dev/null -h "$DIR" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$QUI/stub_supabase.sql"
"${PSQL[@]}" -f "$QUI/../01_schema.sql"
[ -n "${EXTRA:-}" ] && ISPEZIONA=1
for f in "$QUI"/${TEST_FILES:-test_*.sql}; do
  echo "▶ $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "✔ Tutti i test superati"
