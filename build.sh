#!/bin/bash
# CellSight Self-Bootstrapping Build Pipeline (Wails GUI Desktop Compiler)
set -e

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== STARTING CELLSIGHT BUILD PIPELINE ===${NC}"

# Ensure Go bin directory is in PATH (in case Go or Wails was just installed)
GOPATH_BIN=$(go env GOPATH 2>/dev/null || echo "$HOME/go")/bin
export PATH=$PATH:$GOPATH_BIN:~/go/bin:/usr/local/go/bin

# 1. Ensure Go compiler is installed
if ! command -v go &> /dev/null; then
  echo -e "${YELLOW}Go compiler not found. Attempting automatic installation...${NC}"
  if command -v pacman &> /dev/null; then
    sudo pacman -S --needed --noconfirm go
  elif command -v apt-get &> /dev/null; then
    sudo apt-get update && sudo apt-get install -y golang-go
  elif command -v dnf &> /dev/null; then
    sudo dnf install -y golang
  else
    echo -e "${RED}Error: Go compiler is not installed and cannot be automatically installed.${NC}"
    exit 1
  fi
  
  # Re-evaluate GOPATH_BIN after installing Go
  GOPATH_BIN=$(go env GOPATH)/bin
  export PATH=$PATH:$GOPATH_BIN
fi

# 2. Check and install GTK3, WebKit2GTK, and pkg-config dependencies
NEEDS_GTK3=0
NEEDS_WEBKIT=0
NEEDS_PKGCONFIG=0

if ! command -v pkg-config &> /dev/null; then
  NEEDS_PKGCONFIG=1
fi

if [ $NEEDS_PKGCONFIG -eq 0 ]; then
  if ! pkg-config --exists gtk+-3.0; then
    NEEDS_GTK3=1
  fi
  if ! pkg-config --exists webkit2gtk-4.0 && ! pkg-config --exists webkit2gtk-4.1; then
    NEEDS_WEBKIT=1
  fi
else
  NEEDS_GTK3=1
  NEEDS_WEBKIT=1
fi

if [ $NEEDS_PKGCONFIG -eq 1 ] || [ $NEEDS_GTK3 -eq 1 ] || [ $NEEDS_WEBKIT -eq 1 ]; then
  echo -e "${YELLOW}System dependencies (GTK3 / WebKit2GTK / pkgconf) are missing. Attempting automatic installation...${NC}"
  
  if command -v pacman &> /dev/null; then
    DEPS=()
    [ $NEEDS_PKGCONFIG -eq 1 ] && DEPS+=("pkgconf")
    [ $NEEDS_GTK3 -eq 1 ] && DEPS+=("gtk3")
    [ $NEEDS_WEBKIT -eq 1 ] && DEPS+=("webkit2gtk-4.1")
    
    echo -e "Installing Arch/CachyOS packages: ${DEPS[*]}"
    sudo pacman -S --needed --noconfirm "${DEPS[@]}"
    
  elif command -v apt-get &> /dev/null; then
    DEPS=()
    [ $NEEDS_PKGCONFIG -eq 1 ] && DEPS+=("pkg-config" "build-essential")
    [ $NEEDS_GTK3 -eq 1 ] && DEPS+=("libgtk-3-dev")
    [ $NEEDS_WEBKIT -eq 1 ] && DEPS+=("libwebkit2gtk-4.1-dev")
    
    echo -e "Installing Debian/Ubuntu packages: ${DEPS[*]}"
    sudo apt-get update
    if ! sudo apt-get install -y "${DEPS[@]}"; then
      echo -e "${YELLOW}Failed to install libwebkit2gtk-4.1-dev, trying libwebkit2gtk-4.0-dev...${NC}"
      DEPS_FALLBACK=()
      for dep in "${DEPS[@]}"; do
        if [ "$dep" = "libwebkit2gtk-4.1-dev" ]; then
          DEPS_FALLBACK+=("libwebkit2gtk-4.0-dev")
        else
          DEPS_FALLBACK+=("$dep")
        fi
      done
      sudo apt-get install -y "${DEPS_FALLBACK[@]}"
    fi
    
  elif command -v dnf &> /dev/null; then
    DEPS=()
    [ $NEEDS_PKGCONFIG -eq 1 ] && DEPS+=("pkg-config")
    [ $NEEDS_GTK3 -eq 1 ] && DEPS+=("gtk3-devel")
    [ $NEEDS_WEBKIT -eq 1 ] && DEPS+=("webkit2gtk4.1-devel")
    
    echo -e "Installing Fedora packages: ${DEPS[*]}"
    if ! sudo dnf install -y "${DEPS[@]}"; then
      echo -e "${YELLOW}Failed to install webkit2gtk4.1-devel, trying webkit2gtk3-devel...${NC}"
      DEPS_FALLBACK=()
      for dep in "${DEPS[@]}"; do
        if [ "$dep" = "webkit2gtk4.1-devel" ]; then
          DEPS_FALLBACK+=("webkit2gtk3-devel")
        else
          DEPS_FALLBACK+=("$dep")
        fi
      done
      sudo dnf install -y "${DEPS_FALLBACK[@]}"
    fi
  else
    echo -e "${RED}Error: Unsupported package manager. Please manually install GTK3, WebKit2GTK (4.0 or 4.1), and pkg-config.${NC}"
    exit 1
  fi
fi

# Detect installed WebKit2GTK version for Wails build tags
TAGS=""
if pkg-config --exists webkit2gtk-4.1; then
  TAGS="-tags webkit2_41"
  echo -e "${GREEN}✓ WebKit2GTK-4.1 detected. Building with '-tags webkit2_41'.${NC}"
elif pkg-config --exists webkit2gtk-4.0; then
  echo -e "${GREEN}✓ WebKit2GTK-4.0 detected. Building with default tags.${NC}"
else
  echo -e "${YELLOW}Warning: Neither WebKit2GTK-4.0 nor WebKit2GTK-4.1 detected by pkg-config. Build may fail.${NC}"
fi

# 3. Check and automatically install Wails if missing
if ! command -v wails &> /dev/null; then
  echo -e "${YELLOW}Wails CLI not found. Attempting automatic user-space installation...${NC}"
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  
  if ! command -v wails &> /dev/null; then
    echo -e "${RED}Failed to automatically install Wails. Please install manually.${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Wails CLI successfully installed at $(which wails)${NC}"
else
  echo -e "${GREEN}✓ Wails Desktop compiler detected.${NC}"
fi

# 4. Create build directory
mkdir -p build

# 5. Build Windows 64-bit GUI Binary (Cross-Compiled from Linux)
echo -e "${BLUE}Compiling Windows 64-bit Desktop GUI (.exe)...${NC}"
wails build -platform windows/amd64 -o CellSight.exe $TAGS
mv build/bin/CellSight.exe build/CellSight.exe

# 6. Build Linux 64-bit GUI Binary
echo -e "${BLUE}Compiling Linux 64-bit Desktop GUI...${NC}"
wails build -platform linux/amd64 -o CellSight $TAGS
mv build/bin/CellSight build/CellSight

# Clean up temporary build artifacts
rm -rf build/bin

echo -e "\n${GREEN}=== NATIVE DESKTOP BUILD PIPELINE COMPLETED ===${NC}"
echo -e "Binaries located in ${BLUE}build/${NC} directory:"
echo -e "  - Windows 64-bit GUI App: ${GREEN}build/CellSight.exe${NC} (Single Standalone File)"
echo -e "  - Linux 64-bit GUI App:   ${GREEN}build/CellSight${NC} (Single Standalone File)"
echo -e "Copy these files directly to the respective workstations. They run completely offline."
