# CellSight PA Forensic Reader

> [!WARNING]
> **Active Development / Unstable**: CellSight is currently under active development and is considered **unstable**. Features may change, break, or be incomplete. Do not rely on it for critical production forensic analysis without validating the results.

CellSight is a high-performance, secure, and fully offline desktop GUI application designed for mobile forensics extraction parsing and analysis. It allows investigators to ingest, decode, and analyze Cellebrite `.ufdr` or `.zip` case files, offering a comprehensive suite of tools for exploring chats, call logs, contacts, files, geo-coordinates, and SQLite databases.

Designed for high-security environments, CellSight runs entirely offline with zero external network dependencies.

---

## Key Features

- **Fast Streaming Ingest**: Parses massive XML forensic reports (`report.xml`) and raw zip archives using token-by-token streaming, avoiding high memory consumption.
- **Large Dataset Optimization**: Optimized database indexing and robust pagination (using limit/offset and "Load More" controls) to smoothly handle case files up to 80GB+ (tens of thousands of contacts, messages, locations, and files) without UI crashes.
- **Conversations & Message View**: Grouped chat threads supporting participants, metadata, status tracking, and embedded media attachment previews inside message bubbles. Resolves slash-based pathing bugs for group and URL-encoded chat IDs.
- **Unified Timeline**: Chronological log of forensic events across the entire device extraction.
- **Offline Coordinate Plotter**: A private, interactive SVG-based geo-coordinate track plotter that operates completely offline without loading online map tiles.
- **SQLite Explorer**: View, browse, search, and paginate tabular data directly from databases extracted inside the device image.
- **Hex/Text File Viewer**: Peek directly into files with a built-in text reader and paginated hex editor.
- **Evidence Pinning & Annotations**: Flag messages, calls, or files as criminally relevant evidence, add investigator notes, and manage the case docket.

---

## UI Design & Aesthetics

CellSight features a premium dark cyber-forensics design system built using CSS variables, custom glassmorphism panels, crisp micro-animations, and curated status indicator states. 

It uses the new custom **CellSight application icon** which is embedded directly into the compiled native executable.

---

## Tech Stack & Architecture

- **Backend (Desktop Shell)**: Go & [Wails v2](https://wails.io) (binds native system calls, handles database storage, and streams ZIP/filesystem resources).
- **Frontend (GUI)**: React 18, TypeScript, Vite, and Lucide React.
- **Database**: SQLite (embedded pure-Go SQLite driver, no CGO compilation dependency required).

---

## Project Structure

- `app.go`: Bridge methods between the React frontend and Go backend.
- `main.go`: Asset streaming server, API endpoint handlers, and middleware routing.
- `db.go`: SQLite initialization, table schemas, performance indexes, and paginated query logic.
- `parser.go`: Decoders for parsing report XML trees and file streaming extractions.
- `src/`: React GUI application source code, stylesheets, and assets.
- `build/`: Icons, manifests, and build pipeline compiler outputs.

---

## Building the Application

### Dependencies
Before building, make sure you have:
1. **Go** (v1.18+)
2. **Node.js & npm**
3. **Wails CLI** (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
4. System dependencies (on Linux): `pkg-config`, `GTK3`, and `WebKit2GTK` (e.g. `libwebkit2gtk-4.1-dev` or similar).

### Compilation
We provide a self-bootstrapping build pipeline script that automatically checks dependencies and compiles binaries for both platforms:

```bash
# Run the build script
./build.sh
```

This will produce single, standalone executable binaries in the `build/` directory:
- **Windows**: `build/CellSight.exe`
- **Linux**: `build/CellSight`

These executables are portable and can be copied directly to secure offline forensic workstations.

---

## Development

To run the application in hot-reloading development mode:

```bash
# Start Vite front-end dev server and Wails application window
wails dev
```
