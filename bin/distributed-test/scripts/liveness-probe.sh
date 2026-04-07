#!/bin/bash
# Simulates Kubernetes liveness probe against /api/v1/system/health
# Probes every 30s with a 1s timeout — mirrors default k8s probe behavior
# Usage: ./liveness-probe.sh [--server URL] [--token TOKEN] [--interval SECS] [--timeout SECS]

SERVER_URL="http://localhost:8585"
TOKEN=""
INTERVAL=30
TIMEOUT=1

while [[ $# -gt 0 ]]; do
    case $1 in
        --server)  SERVER_URL="$2"; shift 2 ;;
        --token)   TOKEN="$2";      shift 2 ;;
        --interval) INTERVAL="$2"; shift 2 ;;
        --timeout)  TIMEOUT="$2";  shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

ENDPOINT="${SERVER_URL}/api/v1/system/health"
LOG_FILE="liveness-probe-$(date +%Y%m%d-%H%M%S).log"

# Counters
TOTAL=0
PASS=0
FAIL=0
CONSEC_FAIL=0
MAX_CONSEC_FAIL=0
FIRST_FAIL_AT=""
LAST_FAIL_AT=""

# ANSI colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

header() {
    log ""
    log "${BOLD}${CYAN}========================================${NC}"
    log "${BOLD}${CYAN}  Liveness Probe Monitor${NC}"
    log "${BOLD}${CYAN}========================================${NC}"
    log "  Endpoint : ${ENDPOINT}"
    log "  Interval : ${INTERVAL}s"
    log "  Timeout  : ${TIMEOUT}s"
    log "  Log file : ${LOG_FILE}"
    log "  Started  : $(date '+%Y-%m-%d %H:%M:%S')"
    log "${CYAN}========================================${NC}"
    log ""
}

summary() {
    local pass_pct=0
    [[ $TOTAL -gt 0 ]] && pass_pct=$(( PASS * 100 / TOTAL ))

    log ""
    log "${BOLD}========== PROBE SUMMARY ==========${NC}"
    log "  Total probes      : ${TOTAL}"
    log "  Passed            : ${GREEN}${PASS}${NC}"
    log "  Failed            : ${RED}${FAIL}${NC}"
    log "  Success rate      : ${pass_pct}%"
    log "  Max consec fails  : ${MAX_CONSEC_FAIL}"
    [[ -n "$FIRST_FAIL_AT" ]] && log "  First failure     : ${FIRST_FAIL_AT}"
    [[ -n "$LAST_FAIL_AT"  ]] && log "  Last failure      : ${LAST_FAIL_AT}"
    log "  Stopped           : $(date '+%Y-%m-%d %H:%M:%S')"
    log "===================================="
}

trap 'log ""; log "${YELLOW}[INTERRUPTED]${NC} Stopping probe..."; summary; exit 0' INT TERM

header

while true; do
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    TOTAL=$(( TOTAL + 1 ))

    # Build curl args
    CURL_ARGS=(-s -o /tmp/liveness_body -w "%{http_code} %{time_total}" --max-time "$TIMEOUT")
    [[ -n "$TOKEN" ]] && CURL_ARGS+=(-H "Authorization: Bearer $TOKEN")

    # Execute probe
    RESULT=$(curl "${CURL_ARGS[@]}" "$ENDPOINT" 2>/dev/null)
    CURL_EXIT=$?
    HTTP_CODE=$(echo "$RESULT" | awk '{print $1}')
    RESP_TIME=$(echo "$RESULT" | awk '{print $2}')
    BODY=$(cat /tmp/liveness_body 2>/dev/null)

    # Evaluate
    PROBE_OK=false
    FAIL_REASON=""

    if [[ $CURL_EXIT -eq 28 ]]; then
        FAIL_REASON="TIMEOUT (>${TIMEOUT}s)"
    elif [[ $CURL_EXIT -ne 0 ]]; then
        FAIL_REASON="CURL_ERROR (exit=${CURL_EXIT})"
    elif [[ "$HTTP_CODE" != "200" ]]; then
        FAIL_REASON="HTTP_${HTTP_CODE} body='${BODY}'"
    elif [[ "$BODY" != "OK" ]]; then
        FAIL_REASON="UNEXPECTED_BODY='${BODY}'"
    else
        PROBE_OK=true
    fi

    # Format response time
    RESP_MS=$(echo "$RESP_TIME" | awk '{printf "%.0f", $1 * 1000}')

    if $PROBE_OK; then
        PASS=$(( PASS + 1 ))
        CONSEC_FAIL=0
        log "${GREEN}[PASS]${NC} ${TIMESTAMP}  HTTP=${HTTP_CODE}  time=${RESP_MS}ms  probe=${TOTAL}"
    else
        FAIL=$(( FAIL + 1 ))
        CONSEC_FAIL=$(( CONSEC_FAIL + 1 ))
        [[ $CONSEC_FAIL -gt $MAX_CONSEC_FAIL ]] && MAX_CONSEC_FAIL=$CONSEC_FAIL
        [[ -z "$FIRST_FAIL_AT" ]] && FIRST_FAIL_AT="$TIMESTAMP"
        LAST_FAIL_AT="$TIMESTAMP"

        log "${RED}[FAIL]${NC} ${TIMESTAMP}  ${FAIL_REASON}  time=${RESP_MS}ms  probe=${TOTAL}  consec_fails=${CONSEC_FAIL}"

        # k8s default: pod restarted after 3 consecutive failures
        if [[ $CONSEC_FAIL -eq 3 ]]; then
            log "${YELLOW}[ALERT]${NC} 3 consecutive failures — k8s would restart pod here!"
        elif [[ $CONSEC_FAIL -gt 3 ]]; then
            log "${YELLOW}[ALERT]${NC} ${CONSEC_FAIL} consecutive failures — pod would be in restart loop!"
        fi
    fi

    # Running stats every 10 probes
    if (( TOTAL % 10 == 0 )); then
        PASS_PCT=$(( PASS * 100 / TOTAL ))
        log "${CYAN}[STATS]${NC} probes=${TOTAL} pass=${PASS} fail=${FAIL} success_rate=${PASS_PCT}% max_consec_fail=${MAX_CONSEC_FAIL}"
    fi

    sleep "$INTERVAL"
done
