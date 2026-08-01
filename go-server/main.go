package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed all:dist
var embedFrontend embed.FS

var (
	currentUfdrPath string
	openDatabases   = make(map[string]openDbSession)
	openDatabasesMu sync.Mutex
)

type openDbSession struct {
	TempPath   string
	DBInstance *sql.DB
}

func main() {
	// Create temp folder
	_ = os.MkdirAll("./temp", 0755)

	// API Handlers
	http.HandleFunc("/api/open-ufdr", handleOpenUfdr)
	http.HandleFunc("/api/parse-status", handleParseStatus)

	// Data APIs (with database check)
	http.HandleFunc("/api/extraction-info", checkDbMiddleware(handleExtractionInfo))
	http.HandleFunc("/api/stats", checkDbMiddleware(handleStats))
	http.HandleFunc("/api/chats", checkDbMiddleware(handleChats))
	http.HandleFunc("/api/chats/", checkDbMiddleware(handleChatMessages)) // /api/chats/:id/messages
	http.HandleFunc("/api/calls", checkDbMiddleware(handleCalls))
	http.HandleFunc("/api/contacts", checkDbMiddleware(handleContacts))
	http.HandleFunc("/api/files", checkDbMiddleware(handleFiles))
	http.HandleFunc("/api/locations", checkDbMiddleware(handleLocations))
	http.HandleFunc("/api/timeline", checkDbMiddleware(handleTimeline))

	// Evidence APIs
	http.HandleFunc("/api/evidence", checkDbMiddleware(handleEvidence))

	// Media streaming
	http.HandleFunc("/api/media", handleMedia)

	// SQLite database explorer
	http.HandleFunc("/api/sqlite/tables", checkDbMiddleware(handleSqliteTables))
	http.HandleFunc("/api/sqlite/data", checkDbMiddleware(handleSqliteData))

	// Serve React Embedded Frontend
	publicFS, err := fs.Sub(embedFrontend, "dist")
	if err != nil {
		log.Fatalf("failed to sub-select embedded dist: %v", err)
	}

	fileServer := http.FileServer(http.FS(publicFS))
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		enableCors(&w)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// If route is API, do nothing
		if strings.HasPrefix(r.URL.Path, "/api") {
			return
		}

		// Clean path for file lookup
		cleanedPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")
		if cleanedPath == "." || cleanedPath == "" {
			cleanedPath = "index.html"
		}

		// Check if file exists in embedded FS
		file, err := publicFS.Open(cleanedPath)
		if err != nil {
			// File does not exist, fallback to index.html for SPA router support
			indexFile, err := publicFS.Open("index.html")
			if err != nil {
				http.Error(w, "Not Found", http.StatusNotFound)
				return
			}
			defer indexFile.Close()
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			io.Copy(w, indexFile)
			return
		}
		file.Close()

		fileServer.ServeHTTP(w, r)
	})

	// Graceful shutdown cleanup
	c := make(chan os.Signal, 1)
	go func() {
		for range c {
			cleanup()
		}
	}()

	port := "5001"
	fmt.Printf("CellSight Go Backend Server running on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}

func cleanup() {
	openDatabasesMu.Lock()
	defer openDatabasesMu.Unlock()
	fmt.Println("\nCleaning up temporary SQLite sessions...")
	for path, sess := range openDatabases {
		sess.DBInstance.Close()
		os.Remove(sess.TempPath)
		delete(openDatabases, path)
	}
	os.Exit(0)
}

// CORS Helper
func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

// Middleware
func checkDbMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		enableCors(&w)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		if db == nil {
			status := getParseStatus()
			if status.Active {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":    "Database is currently parsing",
					"parsing":  true,
					"progress": status.Progress,
				})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "No UFDR archive loaded. Load a UFDR first."})
			return
		}
		next(w, r)
	}
}

// 1. Parsing APIs
func handleOpenUfdr(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		UfdrPath string `json:"ufdrPath"`
		DbPath   string `json:"dbPath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if body.UfdrPath == "" {
		http.Error(w, "ufdrPath is required", http.StatusBadRequest)
		return
	}

	// Resolve default DB path
	dbPath := body.DbPath
	if dbPath == "" {
		dbPath = "./data/case_session.db"
	}

	// Resolve absolute path
	absUfdr, err := filepath.Abs(body.UfdrPath)
	if err != nil {
		http.Error(w, "Invalid path: "+err.Error(), http.StatusBadRequest)
		return
	}

	if _, err := os.Stat(absUfdr); os.IsNotExist(err) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "UFDR file not found at " + absUfdr})
		return
	}

	// Cleanup open databases
	openDatabasesMu.Lock()
	for p, sess := range openDatabases {
		sess.DBInstance.Close()
		os.Remove(sess.TempPath)
		delete(openDatabases, p)
	}
	openDatabasesMu.Unlock()

	currentUfdrPath = absUfdr

	// Parse in background Goroutine (Ultra-high performance!)
	go func() {
		err := parseUfdr(absUfdr, dbPath)
		if err != nil {
			log.Printf("Go Parser Ingest failed: %v", err)
		} else {
			log.Println("Go Parser Ingest complete!")
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message":  "Ingest started in background",
		"ufdrPath": absUfdr,
		"dbPath":   dbPath,
	})
}

func handleParseStatus(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(getParseStatus())
}

// 2. Metadata & Stats
func handleExtractionInfo(w http.ResponseWriter, r *http.Request) {
	info, err := getExtractionInfo()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"info":     info,
		"ufdrPath": currentUfdrPath,
	})
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	stats, err := getStats()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// 3. Contacts
func handleContacts(w http.ResponseWriter, r *http.Request) {
	search := r.URL.Query().Get("search")
	contacts, err := getContacts(search)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(contacts)
}

// 4. Chats & Messages
func handleChats(w http.ResponseWriter, r *http.Request) {
	chats, err := getChats()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(chats)
}

func handleChatMessages(w http.ResponseWriter, r *http.Request) {
	// Parse /api/chats/:id/messages
	prefix := "/api/chats/"
	suffix := "/messages"
	if !strings.HasSuffix(r.URL.Path, suffix) || len(r.URL.Path) <= len(prefix)+len(suffix) {
		http.Error(w, "Invalid route", http.StatusBadRequest)
		return
	}
	chatID := r.URL.Path[len(prefix) : len(r.URL.Path)-len(suffix)]

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 100
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	messages, err := getChatMessages(chatID, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(messages)
}

// 5. Call Logs
func handleCalls(w http.ResponseWriter, r *http.Request) {
	direction := r.URL.Query().Get("direction")
	search := r.URL.Query().Get("search")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 100
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	calls, err := getCalls(direction, search, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(calls)
}

// 6. Files
func handleFiles(w http.ResponseWriter, r *http.Request) {
	fileType := r.URL.Query().Get("type")
	search := r.URL.Query().Get("search")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 100
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	files, err := getFiles(fileType, search, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// 7. Locations
func handleLocations(w http.ResponseWriter, r *http.Request) {
	locations, err := getLocations()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

// 8. Timeline
func handleTimeline(w http.ResponseWriter, r *http.Request) {
	timelineType := r.URL.Query().Get("type")
	search := r.URL.Query().Get("search")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 100
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	timeline, err := getTimeline(timelineType, search, limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(timeline)
}

// 9. Evidence Pins
func handleEvidence(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		list, err := getEvidence()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	} else if r.Method == "POST" {
		var body struct {
			Type  string `json:"type"`
			ID    string `json:"id"`
			Notes string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := addEvidence(body.Type, body.ID, body.Notes); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	} else if r.Method == "DELETE" {
		artType := r.URL.Query().Get("type")
		artID := r.URL.Query().Get("id")
		if err := removeEvidence(artType, artID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]bool{"success": true})
	}
}

// 10. Media streaming directly from ZIP
func handleMedia(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		http.Error(w, "path query parameter is required", http.StatusBadRequest)
		return
	}

	zipPath := currentUfdrPath
	if zipPath == "" {
		info, err := getExtractionInfo()
		if err != nil || info["UFDR Path"] == "" {
			http.Error(w, "No UFDR loaded", http.StatusBadRequest)
			return
		}
		zipPath = info["UFDR Path"]
	}

	// Set content type
	ext := strings.ToLower(filepath.Ext(filePath))
	contentType := "application/octet-stream"
	mimeTypes := map[string]string{
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".gif":  "image/gif",
		".webp": "image/webp",
		".mp4":  "video/mp4",
		".mov":  "video/quicktime",
		".mp3":  "audio/mpeg",
		".wav":  "audio/wav",
		".pdf":  "application/pdf",
		".txt":  "text/plain",
	}
	if t, ok := mimeTypes[ext]; ok {
		contentType = t
	}
	w.Header().Set("Content-Type", contentType)

	// Stream
	err := streamFileFromZip(zipPath, filePath, w)
	if err != nil {
		log.Printf("Error streaming file %s: %v", filePath, err)
		http.Error(w, "File not found", http.StatusNotFound)
	}
}

// 11. SQLite Viewer
func handleSqliteTables(w http.ResponseWriter, r *http.Request) {
	fileInZipPath := r.URL.Query().Get("path")
	if fileInZipPath == "" {
		http.Error(w, "path parameter is required", http.StatusBadRequest)
		return
	}

	zipPath := currentUfdrPath
	if zipPath == "" {
		info, _ := getExtractionInfo()
		zipPath = info["UFDR Path"]
	}

	openDatabasesMu.Lock()
	defer openDatabasesMu.Unlock()

	sess, ok := openDatabases[fileInZipPath]
	if !ok {
		// Extract to temp folder
		tempDir := "./temp"
		tempFileName := fmt.Sprintf("temp_%d_%s", time.Now().UnixNano(), filepath.Base(fileInZipPath))
		tempPath := filepath.Join(tempDir, tempFileName)

		out, err := os.Create(tempPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		err = streamFileFromZip(zipPath, fileInZipPath, out)
		out.Close()
		if err != nil {
			os.Remove(tempPath)
			http.Error(w, "Failed to extract database: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Open DB using pure Go SQLite driver
		tempDB, err := sql.Open("sqlite", tempPath)
		if err != nil {
			os.Remove(tempPath)
			http.Error(w, "Failed to open database: "+err.Error(), http.StatusInternalServerError)
			return
		}

		sess = openDbSession{
			TempPath:   tempPath,
			DBInstance: tempDB,
		}
		openDatabases[fileInZipPath] = sess
	}

	// Get tables list
	rows, err := sess.DBInstance.Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			tables = append(tables, name)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"tables": tables})
}

func handleSqliteData(w http.ResponseWriter, r *http.Request) {
	fileInZipPath := r.URL.Query().Get("path")
	table := r.URL.Query().Get("table")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	if fileInZipPath == "" || table == "" {
		http.Error(w, "path and table parameters are required", http.StatusBadRequest)
		return
	}

	// SQL injection protection for table names (can't be parameterized)
	if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(table) {
		http.Error(w, "Invalid table name", http.StatusBadRequest)
		return
	}

	openDatabasesMu.Lock()
	sess, ok := openDatabases[fileInZipPath]
	openDatabasesMu.Unlock()

	if !ok {
		http.Error(w, "Session is not open. Query tables first.", http.StatusBadRequest)
		return
	}

	// Query Column Details
	schemaRows, err := sess.DBInstance.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type Column struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	var columns []Column
	for schemaRows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dfltVal interface{}
		if err := schemaRows.Scan(&cid, &name, &ctype, &notnull, &dfltVal, &pk); err == nil {
			columns = append(columns, Column{Name: name, Type: ctype})
		}
	}
	schemaRows.Close()

	// Get row count
	var totalCount int
	err = sess.DBInstance.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM %s", table)).Scan(&totalCount)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Query Rows
	rows, err := sess.DBInstance.Query(fmt.Sprintf("SELECT * FROM %s LIMIT ? OFFSET ?", table), limit, offset)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Parse dynamic SQLite fields
	var dataRows []map[string]interface{}
	colNames, _ := rows.Columns()

	for rows.Next() {
		columnsRefs := make([]interface{}, len(colNames))
		columnValues := make([]interface{}, len(colNames))
		for i := range columnValues {
			columnsRefs[i] = &columnValues[i]
		}

		if err := rows.Scan(columnsRefs...); err == nil {
			rowMap := make(map[string]interface{})
			for i, colName := range colNames {
				val := columnValues[i]
				b, ok := val.([]byte)
				if ok {
					rowMap[colName] = string(b)
				} else {
					rowMap[colName] = val
				}
			}
			dataRows = append(dataRows, rowMap)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"columns":    columns,
		"rows":       dataRows,
		"totalCount": totalCount,
		"limit":      limit,
		"offset":     offset,
	})
}
