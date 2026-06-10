#!/bin/bash
# CellSight High-Performance Multi-Platform Build Script
set -e

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== STARTING CELLSIGHT BUILD PIPELINE ===${NC}"

# Check if Go is installed
if ! command -v go &> /dev/null; then
  echo -e "${RED}Error: Go compiler ('go') was not found on this system.${NC}"
  echo -e "Standalone binaries cannot be compiled here. Please run ${YELLOW}./build.sh${NC} on your local CachyOS/Arch Linux workstation."
  echo -e "To test the application on this environment, run: ${GREEN}./run-dev.sh${NC} (Node.js mode)"
  exit 1
fi

# 1. Compile the React + TypeScript frontend
echo -e "${BLUE}[1/5] Compiling React static assets...${NC}"
npm run build

# 2. Stage assets for Go compilation embedding
echo -e "${BLUE}[2/5] Staging build files for Go embedding...${NC}"
rm -rf go-server/dist
cp -r dist go-server/dist

# 3. Create target build directory
mkdir -p build

# 4. Compile Go backend for Windows 64-bit
echo -e "${BLUE}[3/5] Compiling standalone binary for Windows 64-bit...${NC}"
cd go-server
# Automatically fetch required pure-Go SQLite dependencies
go mod tidy
# CGO_ENABLED=0 creates a static pure-Go binary with no external C DLL dependencies
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o ../build/CellSight.exe .
echo -e "${GREEN}✓ Created build/CellSight.exe${NC}"

# 5. Compile Go backend for Linux 64-bit
echo -e "${BLUE}[4/5] Compiling standalone binary for Linux 64-bit...${NC}"
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o ../build/CellSight .
cd ..
echo -e "${GREEN}✓ Created build/CellSight${NC}"

# 6. Cleanup staged static folder
echo -e "${BLUE}[5/5] Cleaning up staged assets...${NC}"
rm -rf go-server/dist

echo -e "\n${GREEN}=== BUILD COMPLETED SUCCESSFULY ===${NC}"
echo -e "Target Binaries:"
echo -e "  - Windows 64-bit: ${GREEN}build/CellSight.exe${NC} (Single Self-Contained File)"
echo -e "  - Linux 64-bit:   ${GREEN}build/CellSight${NC} (Single Self-Contained File)"
echo -e "Distribute these files directly to your forensics team. They contain the embedded frontend UI."
