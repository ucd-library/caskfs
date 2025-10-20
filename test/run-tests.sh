#!/bin/bash

# CaskFS Test Runner
# This script provides easy commands to run tests with proper environment setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default environment variables for testing
export CASKFS_ROOT_DIR=${CASKFS_ROOT_DIR:-./test-cache}
export CASKFS_ENABLE_POWERWASH=${CASKFS_ENABLE_POWERWASH:-true}
export CASKFS_LOG_LEVEL=${CASKFS_LOG_LEVEL:-warn}
export CASKFS_ACL_ENABLED=${CASKFS_ACL_ENABLED:-true}
export CASKFS_ACL_DEFAULT_REQUESTOR=${CASKFS_ACL_DEFAULT_REQUESTOR:-test-user}

# PostgreSQL defaults
export CASKFS_PG_HOST=${CASKFS_PG_HOST:-localhost}
export CASKFS_PG_PORT=${CASKFS_PG_PORT:-5432}
export CASKFS_PG_USER=${CASKFS_PG_USER:-postgres}
export CASKFS_PG_PASSWORD=${CASKFS_PG_PASSWORD:-postgres}
export CASKFS_PG_DATABASE=${CASKFS_PG_DATABASE:-caskfs_test}

function print_help() {
  echo "CaskFS Test Runner"
  echo ""
  echo "Usage: $0 [command] [options]"
  echo ""
  echo "Commands:"
  echo "  all              Run all tests"
  echo "  core             Run core functionality tests"
  echo "  integration      Run integration tests"
  echo "  rdf              Run RDF/Linked Data tests"
  echo "  watch            Run tests in watch mode"
  echo "  verbose          Run all tests with verbose output"
  echo "  init             Initialize database for testing"
  echo "  clean            Clean test data (run powerwash)"
  echo "  help             Show this help message"
  echo ""
  echo "Environment Variables:"
  echo "  CASKFS_ROOT_DIR              Directory for CaskFS data (default: ./cache)"
  echo "  CASKFS_ENABLE_POWERWASH      Enable powerwash (default: true)"
  echo "  CASKFS_PG_HOST               PostgreSQL host (default: localhost)"
  echo "  CASKFS_PG_PORT               PostgreSQL port (default: 5432)"
  echo "  CASKFS_PG_DATABASE           PostgreSQL database (default: caskfs_db)"
  echo ""
  echo "Examples:"
  echo "  $0 all                       # Run all tests"
  echo "  $0 core                      # Run only core tests"
  echo "  $0 init                      # Initialize database"
  echo "  $0 clean                     # Clean test data"
}

function check_db() {
  echo -e "${YELLOW}Checking database connection...${NC}"
  
  if ! command -v psql &> /dev/null; then
    echo -e "${RED}psql command not found. Please install PostgreSQL client.${NC}"
    exit 1
  fi

  if PGPASSWORD=$CASKFS_PG_PASSWORD psql -h $CASKFS_PG_HOST -p $CASKFS_PG_PORT -U $CASKFS_PG_USER -d postgres -c '\q' 2>/dev/null; then
    echo -e "${GREEN}✓ Database connection successful${NC}"
  else
    echo -e "${RED}✗ Cannot connect to database${NC}"
    echo "  Make sure PostgreSQL is running and credentials are correct"
    exit 1
  fi
}

function init_db() {
  echo -e "${YELLOW}Initializing database...${NC}"
  node src/bin/cask.js init-pg
  echo -e "${GREEN}✓ Database initialized${NC}"
}

function run_powerwash() {
  echo -e "${YELLOW}Running powerwash (cleaning test data)...${NC}"
  echo -e "${RED}WARNING: This will delete all data!${NC}"
  echo "Press Ctrl+C to cancel, or wait 3 seconds to continue..."
  sleep 3
  
  echo "yes" | node src/bin/cask.js powerwash
  echo -e "${GREEN}✓ Powerwash complete${NC}"
}

function run_tests() {
  local test_file=$1
  local description=$2
  
  echo -e "${YELLOW}Running ${description}...${NC}"
  echo ""
  
  if node --test $test_file; then
    echo ""
    echo -e "${GREEN}✓ ${description} passed${NC}"
  else
    echo ""
    echo -e "${RED}✗ ${description} failed${NC}"
    exit 1
  fi
}

# Main command handling
case "${1:-all}" in
  all)
    check_db
    echo ""
    run_tests "test/caskfs.test.js" "Core functionality tests"
    echo ""
    run_tests "test/integration.test.js" "Integration tests"
    echo ""
    run_tests "test/rdf.test.js" "RDF tests"
    echo ""
    echo -e "${GREEN}✓ All tests passed!${NC}"
    ;;
    
  core)
    check_db
    run_tests "test/caskfs.test.js" "Core functionality tests"
    ;;
    
  integration)
    check_db
    run_tests "test/integration.test.js" "Integration tests"
    ;;
    
  rdf)
    check_db
    run_tests "test/rdf.test.js" "RDF tests"
    ;;
    
  watch)
    check_db
    echo -e "${YELLOW}Running tests in watch mode...${NC}"
    echo "Press Ctrl+C to stop"
    echo ""
    node --test --watch test/*.test.js
    ;;
    
  verbose)
    check_db
    echo -e "${YELLOW}Running all tests (verbose)...${NC}"
    echo ""
    node --test --test-reporter=spec test/*.test.js
    ;;
    
  init)
    check_db
    init_db
    ;;
    
  clean)
    check_db
    run_powerwash
    ;;
    
  help|--help|-h)
    print_help
    ;;
    
  *)
    echo -e "${RED}Unknown command: $1${NC}"
    echo ""
    print_help
    exit 1
    ;;
esac
