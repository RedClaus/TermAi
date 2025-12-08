#!/bin/bash
# PTY REST API Test Script
# This script demonstrates how to use the PTY REST API endpoints

set -e

BASE_URL="${BASE_URL:-http://localhost:3001}"
SESSION_ID="test-session-$(date +%s)"

echo "=========================================="
echo "PTY REST API Test"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "Session ID: $SESSION_ID"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"

    echo -e "${BLUE}Testing:${NC} $name"
    echo -e "${YELLOW}Request:${NC} $method $endpoint"

    if [ -n "$data" ]; then
        echo -e "${YELLOW}Body:${NC} $data"
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ Success${NC} (HTTP $http_code)"
        echo -e "${YELLOW}Response:${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    else
        echo -e "${RED}✗ Failed${NC} (HTTP $http_code)"
        echo -e "${RED}Response:${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        return 1
    fi
    echo ""
}

# Test 1: Health check
echo "=========================================="
echo "1. Health Check"
echo "=========================================="
test_endpoint "Health Check" GET "/api/health"

# Test 2: Spawn PTY session
echo "=========================================="
echo "2. Spawn PTY Session"
echo "=========================================="
test_endpoint "Spawn PTY" POST "/api/pty/spawn" "{
  \"sessionId\": \"$SESSION_ID\",
  \"cwd\": \"$HOME\",
  \"cols\": 80,
  \"rows\": 24
}"

# Test 3: Get session info
echo "=========================================="
echo "3. Get Session Info"
echo "=========================================="
test_endpoint "Get Session Info" GET "/api/pty/session/$SESSION_ID"

# Test 4: List all sessions
echo "=========================================="
echo "4. List All Sessions"
echo "=========================================="
test_endpoint "List Sessions" GET "/api/pty/sessions"

# Test 5: Get stats
echo "=========================================="
echo "5. Get PTY Statistics"
echo "=========================================="
test_endpoint "Get Stats" GET "/api/pty/stats"

# Test 6: Send command (echo)
echo "=========================================="
echo "6. Send Command"
echo "=========================================="
test_endpoint "Write Command" POST "/api/pty/write" "{
  \"sessionId\": \"$SESSION_ID\",
  \"data\": \"echo 'Hello from PTY API'\\r\"
}"

# Test 7: Resize terminal
echo "=========================================="
echo "7. Resize Terminal"
echo "=========================================="
test_endpoint "Resize Terminal" POST "/api/pty/resize" "{
  \"sessionId\": \"$SESSION_ID\",
  \"cols\": 120,
  \"rows\": 40
}"

# Test 8: Test SSE stream (background)
echo "=========================================="
echo "8. Test SSE Output Stream"
echo "=========================================="
echo -e "${BLUE}Info:${NC} Starting SSE stream in background for 5 seconds..."
echo -e "${YELLOW}Endpoint:${NC} GET /api/pty/output/$SESSION_ID"

# Start SSE stream in background
timeout 5s curl -N -s "$BASE_URL/api/pty/output/$SESSION_ID" | while IFS= read -r line; do
    if [[ "$line" == data:* ]]; then
        # Remove "data: " prefix and parse JSON
        json="${line#data: }"
        type=$(echo "$json" | jq -r '.type' 2>/dev/null)

        if [ "$type" = "connected" ]; then
            echo -e "${GREEN}✓ Connected${NC}"
        elif [ "$type" = "output" ]; then
            data=$(echo "$json" | jq -r '.data' 2>/dev/null)
            echo -e "${YELLOW}Output:${NC} $data"
        elif [ "$type" = "heartbeat" ]; then
            echo -e "${BLUE}♥ Heartbeat${NC}"
        fi
    fi
done &
SSE_PID=$!

# Give SSE time to connect
sleep 1

# Send a command while SSE is listening
echo -e "${BLUE}Sending command while SSE is active...${NC}"
curl -s -X POST "$BASE_URL/api/pty/write" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\":\"$SESSION_ID\",\"data\":\"echo 'SSE Test Output'\\r\"}" > /dev/null

# Wait for SSE to finish
wait $SSE_PID 2>/dev/null || true
echo -e "${GREEN}✓ SSE stream test complete${NC}"
echo ""

# Test 9: Kill session
echo "=========================================="
echo "9. Kill PTY Session"
echo "=========================================="
test_endpoint "Kill Session" POST "/api/pty/kill" "{
  \"sessionId\": \"$SESSION_ID\",
  \"signal\": \"SIGHUP\"
}"

# Test 10: Verify session is gone
echo "=========================================="
echo "10. Verify Session Cleanup"
echo "=========================================="
echo -e "${BLUE}Testing:${NC} Get deleted session (should 404)"

response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/pty/session/$SESSION_ID")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" = "404" ]; then
    echo -e "${GREEN}✓ Success${NC} - Session properly cleaned up (HTTP 404)"
else
    echo -e "${RED}✗ Failed${NC} - Session still exists (HTTP $http_code)"
fi
echo ""

# Summary
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo -e "${GREEN}All tests completed!${NC}"
echo ""
echo "To test SSE streaming manually:"
echo "  curl -N $BASE_URL/api/pty/output/YOUR_SESSION_ID"
echo ""
echo "To spawn a session and interact:"
echo "  1. Spawn: curl -X POST $BASE_URL/api/pty/spawn -H 'Content-Type: application/json' -d '{\"sessionId\":\"my-term\",\"cols\":80,\"rows\":24}'"
echo "  2. Stream: curl -N $BASE_URL/api/pty/output/my-term"
echo "  3. Write: curl -X POST $BASE_URL/api/pty/write -H 'Content-Type: application/json' -d '{\"sessionId\":\"my-term\",\"data\":\"ls\\r\"}'"
echo "  4. Kill: curl -X POST $BASE_URL/api/pty/kill -H 'Content-Type: application/json' -d '{\"sessionId\":\"my-term\"}'"
echo ""
