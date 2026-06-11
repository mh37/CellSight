package main

import (
	"database/sql"
	"embed"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:dist
var assets embed.FS

var (
	currentUfdrPath string
	openDatabases     = make(map[string]openDbSession)
	openDatabasesMu   sync.Mutex
)

type openDbSession struct {
	TempPath   string
	DBInstance *sql.DB
}

// MediaAssetHandler handles all in-memory REST API and ZIP streaming requests internally within the Webview
type MediaAssetHandler struct {
	app *App
}

func (h *MediaAssetHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path

	// CORS Headers (for dev mode)
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// 1. Media File Streaming directly from UFDR ZIP
	if path == "/api/media" {
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

		err := streamFile(zipPath, filePath, w)
		if err != nil {
			log.Printf("AssetHandler: Error streaming file %s: %v", filePath, err)
			http.Error(w, "File not found", http.StatusNotFound)
		}
		return
	}

	// Helper to send JSON response
	sendJSON := func(data interface{}, status int) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(data)
	}

	// 2. Open UFDR Ingestion API
	if path == "/api/open-ufdr" && r.Method == "POST" {
		var body struct {
			UfdrPath string `json:"ufdrPath"`
			DbPath   string `json:"dbPath"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		res, err := h.app.OpenUfdr(body.UfdrPath)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusBadRequest)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 3. Parser progress status API
	if path == "/api/parse-status" {
		sendJSON(h.app.GetParseStatus(), http.StatusOK)
		return
	}

	// All other APIs require the database to be loaded
	if db == nil {
		status := getParseStatus()
		if status.Active {
			sendJSON(map[string]interface{}{
				"error":    "Database is currently parsing",
				"parsing":  true,
				"progress": status.Progress,
			}, http.StatusServiceUnavailable)
			return
		}
		sendJSON(map[string]string{"error": "No UFDR archive loaded. Load a UFDR first."}, http.StatusBadRequest)
		return
	}

	// 4. Extraction & Case metadata
	if path == "/api/extraction-info" {
		res, err := h.app.GetExtractionInfo()
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 5. Stat counters
	if path == "/api/stats" {
		res, err := h.app.GetStats()
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 6. Chats list
	if path == "/api/chats" {
		search := r.URL.Query().Get("search")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 100
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		res, err := h.app.GetChats(search, limit, offset)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 7. Chat messages timeline: /api/chats/:id/messages
	if strings.HasPrefix(path, "/api/chats/") && strings.HasSuffix(path, "/messages") {
		prefix := "/api/chats/"
		suffix := "/messages"
		chatID := path[len(prefix) : len(path)-len(suffix)]

		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 100
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		res, err := h.app.GetChatMessages(chatID, limit, offset)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 8. Call logs list
	if path == "/api/calls" {
		direction := r.URL.Query().Get("direction")
		search := r.URL.Query().Get("search")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 100
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		res, err := h.app.GetCalls(direction, search, limit, offset)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 9. Contacts list
	if path == "/api/contacts" {
		search := r.URL.Query().Get("search")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 100
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		res, err := h.app.GetContacts(search, limit, offset)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 10. File browser list
	if path == "/api/files" {
		fileType := r.URL.Query().Get("type")
		search := r.URL.Query().Get("search")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 100
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		res, err := h.app.GetFiles(fileType, search, limit, offset)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 11. GPS coordinate logs list
	if path == "/api/locations" {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 500
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		res, err := h.app.GetLocations(limit, offset)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 12. Unified timeline
	if path == "/api/timeline" {
		timelineType := r.URL.Query().Get("type")
		search := r.URL.Query().Get("search")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 100
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		res, err := h.app.GetTimeline(timelineType, search, limit, offset)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 13. Evidence Pinning APIs
	if path == "/api/evidence" {
		if r.Method == "GET" {
			res, err := h.app.GetEvidence()
			if err != nil {
				sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
				return
			}
			sendJSON(res, http.StatusOK)
			return
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
			err := h.app.AddEvidence(body.Type, body.ID, body.Notes)
			if err != nil {
				sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
				return
			}
			sendJSON(map[string]bool{"success": true}, http.StatusOK)
			return
		} else if r.Method == "DELETE" {
			artType := r.URL.Query().Get("type")
			artID := r.URL.Query().Get("id")
			err := h.app.RemoveEvidence(artType, artID)
			if err != nil {
				sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
				return
			}
			sendJSON(map[string]bool{"success": true}, http.StatusOK)
			return
		}
	}

	// 14. Report Export
	if path == "/api/report/export" {
		htmlReport, err := h.app.GenerateReport()
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.Header().Set("Content-Disposition", "attachment; filename=\"Forensic_Report.html\"")
		w.Write([]byte(htmlReport))
		return
	}

	// 15. SQLite Tables Explorer
	if path == "/api/sqlite/tables" {
		fileInZipPath := r.URL.Query().Get("path")
		res, err := h.app.GetSqliteTables(fileInZipPath)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// 15. SQLite Data Explorer
	if path == "/api/sqlite/data" {
		fileInZipPath := r.URL.Query().Get("path")
		table := r.URL.Query().Get("table")
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 50
		}
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

		res, err := h.app.GetSqliteData(fileInZipPath, table, limit, offset)
		if err != nil {
			sendJSON(map[string]string{"error": err.Error()}, http.StatusInternalServerError)
			return
		}
		sendJSON(res, http.StatusOK)
		return
	}

	// Default fallback to Wails default assets handler (delivers index.html / index.js)
	http.NotFound(w, r)
}

func main() {
	// Create temp folder for database sessions
	_ = os.MkdirAll("./temp", 0755)

	// Create an instance of the app structure
	app := NewApp()

	// Configure Wails Native Window Options
	err := wails.Run(&options.App{
		Title:  "CellSight | Cellebrite Forensic Ingest Reader",
		Width:  1280,
		Height: 820,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: &MediaAssetHandler{app: app}, // Inject our unified local HTTP gateway handler!
		},
		BackgroundColour: &options.RGBA{R: 9, G: 13, B: 22, A: 255}, // Matches app deep navy background
		OnStartup:        app.startup,
		Bind: []interface{}{
			app, // Binds app.go methods to JavaScript window.go.main.App.*
		},
	})

	if err != nil {
		log.Fatal("Wails Desktop launch error:", err)
	}

	// Cleanup on exit
	cleanupSessions()
}

func cleanupSessions() {
	openDatabasesMu.Lock()
	defer openDatabasesMu.Unlock()
	for _, sess := range openDatabases {
		sess.DBInstance.Close()
		os.Remove(sess.TempPath)
	}
}
