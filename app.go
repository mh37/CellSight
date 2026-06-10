package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// SelectFile opens a native OS file dialog to browse for a UFDR archive
func (a *App) SelectFile() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Cellebrite UFDR Export Archive",
		Filters: []runtime.FileFilter{
			{DisplayName: "Cellebrite UFDR (*.ufdr)", Pattern: "*.ufdr"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return "", err
	}
	return filePath, nil
}

// OpenUfdr starts the streaming ingestion of the selected UFDR archive in a background thread
func (a *App) OpenUfdr(ufdrPath string) (map[string]string, error) {
	if ufdrPath == "" {
		return nil, fmt.Errorf("ufdrPath is required")
	}

	absUfdr, err := filepath.Abs(ufdrPath)
	if err != nil {
		return nil, fmt.Errorf("invalid path: %v", err)
	}

	if _, err := os.Stat(absUfdr); os.IsNotExist(err) {
		return nil, fmt.Errorf("UFDR archive not found at: %s", absUfdr)
	}

	// Close any active SQLite sessions
	openDatabasesMu.Lock()
	for p, sess := range openDatabases {
		sess.DBInstance.Close()
		os.Remove(sess.TempPath)
		delete(openDatabases, p)
	}
	openDatabasesMu.Unlock()

	currentUfdrPath = absUfdr

	// Default DB location in app local data
	dbPath := "./data/case_session.db"

	// Run parser in a background Goroutine
	go func() {
		err := parseUfdr(absUfdr, dbPath)
		if err != nil {
			log.Printf("Ingest failed: %v", err)
		} else {
			log.Println("Ingest complete!")
		}
	}()

	return map[string]string{
		"message":  "Ingest started successfully",
		"ufdrPath": absUfdr,
		"dbPath":   dbPath,
	}, nil
}

// GetParseStatus returns the current background ingestion progress
func (a *App) GetParseStatus() ParseStatus {
	return getParseStatus()
}

// GetExtractionInfo returns case metadata details
func (a *App) GetExtractionInfo() (map[string]interface{}, error) {
	info, err := getExtractionInfo()
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"info":     info,
		"ufdrPath": currentUfdrPath,
	}, nil
}

// GetStats returns counts of all parsed data types
func (a *App) GetStats() (Stats, error) {
	return getStats()
}

// GetChats returns list of reconstructed chats
func (a *App) GetChats() ([]Chat, error) {
	return getChats()
}

// GetChatMessages returns message logs for a specific chat (paginated)
func (a *App) GetChatMessages(chatID string, limit, offset int) ([]Message, error) {
	return getChatMessages(chatID, limit, offset)
}

// GetCalls returns call history log (paginated)
func (a *App) GetCalls(direction, search string, limit, offset int) ([]Call, error) {
	return getCalls(direction, search, limit, offset)
}

// GetContacts returns address book list
func (a *App) GetContacts(search string) ([]Contact, error) {
	return getContacts(search)
}

// GetFiles returns list of files extracted (paginated)
func (a *App) GetFiles(fileType, search string, limit, offset int) ([]File, error) {
	return getFiles(fileType, search, limit, offset)
}

// GetLocations returns GPS coordinates list
func (a *App) GetLocations() ([]Location, error) {
	return getLocations()
}

// GetTimeline returns chronological events stream (paginated)
func (a *App) GetTimeline(typeFilter, search string, limit, offset int) ([]TimelineEvent, error) {
	return getTimeline(typeFilter, search, limit, offset)
}

// GetEvidence returns flagged items list
func (a *App) GetEvidence() ([]Evidence, error) {
	return getEvidence()
}

// AddEvidence flags a specific artifact as evidence with notes
func (a *App) AddEvidence(artType, artID, notes string) error {
	return addEvidence(artType, artID, notes)
}

// RemoveEvidence unflags a specific artifact
func (a *App) RemoveEvidence(artType, artID string) error {
	return removeEvidence(artType, artID)
}

// GetSqliteTables explores tables inside an extracted SQLite file in the UFDR
func (a *App) GetSqliteTables(fileInZipPath string) (map[string]interface{}, error) {
	if fileInZipPath == "" {
		return nil, fmt.Errorf("path is required")
	}

	zipPath := currentUfdrPath
	if zipPath == "" {
		info, err := getExtractionInfo()
		if err != nil {
			return nil, err
		}
		zipPath = info["UFDR Path"]
	}

	openDatabasesMu.Lock()
	defer openDatabasesMu.Unlock()

	sess, ok := openDatabases[fileInZipPath]
	if !ok {
		// Extract to temp folder
		tempDir := "./temp"
		_ = os.MkdirAll(tempDir, 0755)
		tempFileName := fmt.Sprintf("temp_%d_%s", time.Now().UnixNano(), filepath.Base(fileInZipPath))
		tempPath := filepath.Join(tempDir, tempFileName)

		out, err := os.Create(tempPath)
		if err != nil {
			return nil, err
		}
		
		err = streamFileFromZip(zipPath, fileInZipPath, out)
		out.Close()
		if err != nil {
			os.Remove(tempPath)
			return nil, fmt.Errorf("failed to extract database: %v", err)
		}

		// Open DB using pure Go SQLite driver
		tempDB, err := sql.Open("sqlite", tempPath)
		if err != nil {
			os.Remove(tempPath)
			return nil, fmt.Errorf("failed to open database: %v", err)
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
		return nil, err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			tables = append(tables, name)
		}
	}

	return map[string]interface{}{"tables": tables}, nil
}

// GetSqliteData queries table rows/schemas inside an extracted SQLite file in the UFDR
func (a *App) GetSqliteData(fileInZipPath, table string, limit, offset int) (map[string]interface{}, error) {
	if fileInZipPath == "" || table == "" {
		return nil, fmt.Errorf("path and table are required")
	}

	// SQL injection check
	if !regexp.MustCompile(`^[a-zA-Z0-9_]+$`).MatchString(table) {
		return nil, fmt.Errorf("invalid table name")
	}

	openDatabasesMu.Lock()
	sess, ok := openDatabases[fileInZipPath]
	openDatabasesMu.Unlock()

	if !ok {
		return nil, fmt.Errorf("session is not open. query tables first")
	}

	// Query columns
	schemaRows, err := sess.DBInstance.Query(fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return nil, err
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
		return nil, err
	}

	// Query Rows
	rows, err := sess.DBInstance.Query(fmt.Sprintf("SELECT * FROM %s LIMIT ? OFFSET ?", table), limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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

	return map[string]interface{}{
		"columns":    columns,
		"rows":       dataRows,
		"totalCount": totalCount,
		"limit":      limit,
		"offset":     offset,
	}, nil
}
