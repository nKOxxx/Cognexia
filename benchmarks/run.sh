#!/bin/bash
# Cognexia Correctness Benchmarks — Quick Runner
# Usage: ./benchmarks/run.sh [options]
# Options:
#   (none)        Run all correctness tests
#   --fast        Run with parallel workers
#   --coverage    Generate coverage report
#   --encryption  Run encryption tests only
#   --search      Run search tests only
#   --graph       Run graph tests only
#   --isolation   Run isolation tests only
#   --concurrency Run concurrency tests only
#   --verbose     Show detailed output

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BENCHMARK_DIR="$REPO_ROOT/benchmarks"
SERVER_HOST="http://localhost:3000"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default options
PARALLEL=""
COVERAGE=""
VERBOSE="-q"
TEST_FILTER=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --fast)
      PARALLEL="-n auto"
      shift
      ;;
    --coverage)
      COVERAGE="--cov=$BENCHMARK_DIR --cov-report=html --cov-report=term"
      shift
      ;;
    --verbose)
      VERBOSE="-v"
      shift
      ;;
    --encryption)
      TEST_FILTER="test_correctness_encryption.py"
      shift
      ;;
    --search)
      TEST_FILTER="test_correctness_search.py"
      shift
      ;;
    --graph)
      TEST_FILTER="test_correctness_graph.py"
      shift
      ;;
    --isolation)
      TEST_FILTER="test_correctness_isolation.py"
      shift
      ;;
    --concurrency)
      TEST_FILTER="test_correctness_concurrency.py"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Cognexia Correctness Benchmarks${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

# Check if server is running
echo -e "${YELLOW}→ Checking Cognexia server...${NC}"
if ! curl -s "$SERVER_HOST/health" > /dev/null 2>&1; then
  echo -e "${YELLOW}⚠️  Server not running at $SERVER_HOST${NC}"
  echo -e "${YELLOW}   Start it with: npm start${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo

# Ensure dependencies are installed
echo -e "${YELLOW}→ Checking dependencies...${NC}"
if [ ! -d "$BENCHMARK_DIR/../node_modules" ]; then
  echo -e "${YELLOW}   Installing npm dependencies...${NC}"
  cd "$REPO_ROOT" && npm install > /dev/null
fi

if ! python3 -m pytest --version > /dev/null 2>&1; then
  echo -e "${YELLOW}   Installing Python dependencies...${NC}"
  pip install -q -r "$BENCHMARK_DIR/requirements.txt"
fi
echo -e "${GREEN}✓ Dependencies ready${NC}"
echo

# Run tests
echo -e "${YELLOW}→ Running tests...${NC}"
cd "$REPO_ROOT"

if [ -z "$TEST_FILTER" ]; then
  TESTS="$BENCHMARK_DIR/test_correctness_*.py"
else
  TESTS="$BENCHMARK_DIR/$TEST_FILTER"
fi

python3 -m pytest $TESTS $VERBOSE --timeout=60 $PARALLEL $COVERAGE

echo
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ -n "$COVERAGE" ]; then
  echo -e "${GREEN}✓ Tests passed! Coverage report: htmlcov/index.html${NC}"
else
  echo -e "${GREEN}✓ All correctness tests passed!${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
