package main

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
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

// SelectFile opens a native OS file dialog to browse for a forensic archive (UFDR or ZIP)
func (a *App) SelectFile() (string, error) {
	filePath, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Forensic Extraction Archive (.ufdr or .zip)",
		Filters: []runtime.FileFilter{
			{DisplayName: "Forensic Extraction Archives (*.ufdr; *.zip)", Pattern: "*.ufdr;*.zip"},
			{DisplayName: "Cellebrite UFDR (*.ufdr)", Pattern: "*.ufdr"},
			{DisplayName: "ZIP Archives (*.zip)", Pattern: "*.zip"},
			{DisplayName: "All Files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return "", err
	}
	return filePath, nil
}

// SelectDirectory opens a native OS folder dialog to browse for a raw phone dump directory
func (a *App) SelectDirectory() (string, error) {
	dirPath, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Forensic Extraction Directory / Raw Phone Dump Folder",
	})
	if err != nil {
		return "", err
	}
	return dirPath, nil
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

// GetChats returns list of reconstructed chats (paginated)
func (a *App) GetChats(search string, limit, offset int) ([]Chat, error) {
	return getChats(search, limit, offset)
}

// GetChatMessages returns message logs for a specific chat (paginated)
func (a *App) GetChatMessages(chatID string, limit, offset int) ([]Message, error) {
	return getChatMessages(chatID, limit, offset)
}

// GetCalls returns call history log (paginated)
func (a *App) GetCalls(direction, search string, limit, offset int) ([]Call, error) {
	return getCalls(direction, search, limit, offset)
}

// GetContacts returns address book list (paginated)
func (a *App) GetContacts(search string, limit, offset int) ([]Contact, error) {
	return getContacts(search, limit, offset)
}

// GetFiles returns list of files extracted (paginated)
func (a *App) GetFiles(fileType, search string, limit, offset int) ([]File, error) {
	return getFiles(fileType, search, limit, offset)
}

// GetLocations returns GPS coordinates list (paginated)
func (a *App) GetLocations(limit, offset int) ([]Location, error) {
	return getLocations(limit, offset)
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

// GenerateReport creates a forensic HTML report from the tagged evidence
func (a *App) GenerateReport() (string, error) {
	info, err := getExtractionInfo()
	if err != nil {
		return "", err
	}

	evidence, err := getEvidence()
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	sb.WriteString("<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Forensic Evidence Report</title>")
	sb.WriteString("<style>")
	sb.WriteString("body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 1000px; margin: 0 auto; padding: 20px; }")
	sb.WriteString("h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }")
	sb.WriteString("h2 { color: #2980b9; margin-top: 30px; }")
	sb.WriteString(".info-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }")
	sb.WriteString(".info-table th, .info-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }")
	sb.WriteString(".info-table th { background-color: #f2f2f2; width: 30%; }")
	sb.WriteString(".evidence-card { border: 1px solid #e0e0e0; border-radius: 5px; padding: 15px; margin-bottom: 20px; background-color: #f9f9f9; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }")
	sb.WriteString(".ev-header { font-weight: bold; color: #d35400; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase; font-size: 0.9em; }")
	sb.WriteString(".ev-snippet { font-family: monospace; background-color: #fff; padding: 10px; border: 1px dashed #ccc; margin: 10px 0; }")
	sb.WriteString(".ev-notes { font-style: italic; color: #555; background-color: #e8f4f8; padding: 10px; border-left: 4px solid #3498db; }")
	sb.WriteString(".footer { margin-top: 50px; text-align: center; font-size: 0.8em; color: #7f8c8d; border-top: 1px solid #eee; padding-top: 20px; }")
	sb.WriteString("</style></head><body>")

	sb.WriteString("<h1>Forensic Evidence Report</h1>")
	sb.WriteString(fmt.Sprintf("<p><strong>Generated on:</strong> %s</p>", time.Now().Format(time.RFC1123)))

	sb.WriteString("<h2>Case Information</h2>")
	sb.WriteString("<table class='info-table'><tbody>")
	for k, v := range info {
		sb.WriteString(fmt.Sprintf("<tr><th>%s</th><td>%s</td></tr>", k, v))
	}
	sb.WriteString("</tbody></table>")

	sb.WriteString("<h2>Tagged Evidence (" + fmt.Sprintf("%d", len(evidence)) + " items)</h2>")
	
	if len(evidence) == 0 {
		sb.WriteString("<p>No evidence has been tagged in this case.</p>")
	} else {
		for _, e := range evidence {
			sb.WriteString("<div class='evidence-card'>")
			sb.WriteString(fmt.Sprintf("<div class='ev-header'>Artifact: %s (ID: %s)</div>", strings.ToUpper(e.ArtifactType), e.ArtifactID))
			sb.WriteString(fmt.Sprintf("<div><strong>Tagged At:</strong> %s</div>", e.TaggedAt))
			if e.Metadata != "" {
				sb.WriteString(fmt.Sprintf("<div><strong>Metadata/Source:</strong> %s</div>", e.Metadata))
			}
			sb.WriteString(fmt.Sprintf("<div class='ev-snippet'>%s</div>", e.Snippet))
			if e.Notes != "" {
				sb.WriteString(fmt.Sprintf("<div class='ev-notes'><strong>Investigator Notes:</strong><br>%s</div>", e.Notes))
			}
			sb.WriteString("</div>")
		}
	}

	sb.WriteString("<div class='footer'>Generated by CellSight Forensic Engine</div>")
	sb.WriteString("</body></html>")

	return sb.String(), nil
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
	sess, ok := openDatabases[fileInZipPath]
	openDatabasesMu.Unlock()

	if !ok {
		// Extract to temp folder — done outside the lock to avoid blocking other DB operations
		tempDir := "./temp"
		_ = os.MkdirAll(tempDir, 0755)
		tempFileName := fmt.Sprintf("temp_%d_%s", time.Now().UnixNano(), filepath.Base(fileInZipPath))
		tempPath := filepath.Join(tempDir, tempFileName)

		out, err := os.Create(tempPath)
		if err != nil {
			return nil, err
		}

		err = streamFile(zipPath, fileInZipPath, out)
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

		newSess := openDbSession{
			TempPath:   tempPath,
			DBInstance: tempDB,
		}

		// Re-lock just for the map write
		openDatabasesMu.Lock()
		// Check again in case another goroutine raced us
		if existing, alreadyOpen := openDatabases[fileInZipPath]; alreadyOpen {
			// Another goroutine opened it first — close our duplicate
			openDatabasesMu.Unlock()
			tempDB.Close()
			os.Remove(tempPath)
			sess = existing
		} else {
			openDatabases[fileInZipPath] = newSess
			openDatabasesMu.Unlock()
			sess = newSess
		}
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

// GetFileHex returns a chunk of a file formatted as Hex + ASCII
func (a *App) GetFileHex(fileInZipPath string, offset, length int) (map[string]interface{}, error) {
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

	rc, totalSize, err := getFileReader(zipPath, fileInZipPath)
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	if offset < 0 {
		offset = 0
	}
	if offset >= int(totalSize) {
		return map[string]interface{}{
			"hexDump":   "",
			"totalSize": totalSize,
			"offset":    offset,
			"length":    0,
		}, nil
	}

	// Seek to offset
	if offset > 0 {
		_, _ = io.CopyN(io.Discard, rc, int64(offset))
	}

	if length <= 0 || length > 4096 {
		length = 256
	}
	if offset+length > int(totalSize) {
		length = int(totalSize) - offset
	}

	buf := make([]byte, length)
	n, err := io.ReadFull(rc, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, err
	}
	buf = buf[:n]

	// Format hex dump
	var hexLines []string
	for i := 0; i < len(buf); i += 16 {
		chunkEnd := i + 16
		if chunkEnd > len(buf) {
			chunkEnd = len(buf)
		}
		chunk := buf[i:chunkEnd]

		// Format hex representation
		var hexParts []string
		for _, b := range chunk {
			hexParts = append(hexParts, fmt.Sprintf("%02X", b))
		}
		// Pad hex columns
		for len(hexParts) < 16 {
			hexParts = append(hexParts, "  ")
		}

		// Format ASCII representation
		var asciiParts []string
		for _, b := range chunk {
			if b >= 32 && b <= 126 {
				asciiParts = append(asciiParts, string(b))
			} else {
				asciiParts = append(asciiParts, ".")
			}
		}

		line := fmt.Sprintf("%08X  %s  |%s|", offset+i, strings.Join(hexParts, " "), strings.Join(asciiParts, ""))
		hexLines = append(hexLines, line)
	}

	return map[string]interface{}{
		"hexDump":   strings.Join(hexLines, "\n"),
		"totalSize": totalSize,
		"offset":    offset,
		"length":    len(buf),
	}, nil
}

// GetFileText reads a file as text and checks if it's binary
func (a *App) GetFileText(fileInZipPath string, maxLength int) (map[string]interface{}, error) {
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

	rc, totalSize, err := getFileReader(zipPath, fileInZipPath)
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	if maxLength <= 0 || maxLength > 1024*1024 {
		maxLength = 100 * 1024 // 100 KB max
	}

	limit := totalSize
	if limit > int64(maxLength) {
		limit = int64(maxLength)
	}

	buf := make([]byte, limit)
	n, err := io.ReadFull(rc, buf)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return nil, err
	}
	buf = buf[:n]

	// Check if it's binary
	isBinary := false
	for _, b := range buf {
		if b == 0 {
			isBinary = true
			break
		}
	}

	var content string
	if !isBinary {
		content = string(buf)
	} else {
		content = "[Binary File - Use Hex Viewer to inspect]"
	}

	return map[string]interface{}{
		"content":   content,
		"totalSize": totalSize,
		"isBinary":  isBinary,
		"length":    len(buf),
	}, nil
}
