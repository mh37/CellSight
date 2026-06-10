#!/bin/bash
# CellSight Development Runner (supports CachyOS/Arch Linux and sandbox environments)
set -e

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

MODE=${1:-node}

# Clean trap on Ctrl+C to terminate all child processes
trap "echo -e '\n${YELLOW}Stopping CellSight services...${NC}'; kill 0" EXIT

if [ "$MODE" = "go" ]; then
  echo -e "${BLUE}=== RUNNING CELLSIGHT IN GO NATIVE DEV MODE ===${NC}"
  
  if ! command -v go &> /dev/null; then
    echo -e "${RED}Error: Go compiler is not installed on this system.${NC}"
    echo -e "Please run in Node mode instead: ${GREEN}./run-dev.sh node${NC}"
    exit 1
  fi
  
  # 1. Build React frontend
  echo -e "${BLUE}Building frontend...${NC}"
  npm run build
  
  # 2. Stage assets
  rm -rf go-server/dist
  cp -r dist go-server/dist
  
  # 3. Start Go server
  echo -e "${GREEN}Starting Go server on http://localhost:5001...${NC}"
  cd go-server
  go run .
  
else
  echo -e "${BLUE}=== RUNNING CELLSIGHT IN NODE.JS DEV MODE ===${NC}"
  
  # 1. Start Express server in the background
  echo -e "${BLUE}Starting Express API Server on http://localhost:5001...${NC}"
  node server/server.js &
  SERVER_PID=$!
  
  # 2. Start Vite Dev server (Frontend)
  echo -e "${BLUE}Starting Vite Dev Server on http://localhost:5173...${NC}"
  npm run dev
  
fi
