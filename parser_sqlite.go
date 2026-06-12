package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

func parseSqliteDb(sourceDbPath string, destDbPath string, ufdrPath string) error {
	updateStatus(func(s *ParseStatus) {
		s.CurrentItem = "Connecting to extracted Cellebrite SQLite Database..."
	})

	// Open the source SQLite database
	srcDB, err := sql.Open("sqlite", sourceDbPath)
	if err != nil {
		return fmt.Errorf("failed to open source sqlite database: %v", err)
	}
	defer srcDB.Close()

	// Get all tables
	rows, err := srcDB.Query("SELECT name FROM sqlite_master WHERE type='table'")
	if err != nil {
		return fmt.Errorf("failed to query sqlite_master: %v", err)
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			tables = append(tables, strings.ToLower(name))
		}
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Dump schema for debugging
	dumpTarget := filepath.Join(filepath.Dir(ufdrPath), "schema_dump.json")
	log.Printf("Dumping SQLite schema to: %s", dumpTarget)
	dumpSchema(srcDB, tables, dumpTarget)

	// Heuristics: map tables
	hasMessages := false
	hasCalls := false
	hasContacts := false

	// Try mapping Contacts
	for _, table := range tables {
		if table == "contacts" || table == "phonebook" {
			updateStatus(func(s *ParseStatus) { s.CurrentItem = "Parsing Contacts..." })
			err := mapContactsTable(srcDB, tx, table)
			if err == nil {
				hasContacts = true
			}
		}
	}

	// Try mapping Messages
	for _, table := range tables {
		if table == "messages" || table == "sms" || table == "chat_messages" || table == "chats" {
			updateStatus(func(s *ParseStatus) { s.CurrentItem = "Parsing Messages..." })
			err := mapMessagesTable(srcDB, tx, table)
			if err == nil {
				hasMessages = true
			}
		}
	}

	// Try mapping Calls
	for _, table := range tables {
		if table == "calls" || table == "call_log" || table == "calllog" {
			updateStatus(func(s *ParseStatus) { s.CurrentItem = "Parsing Calls..." })
			err := mapCallsTable(srcDB, tx, table)
			if err == nil {
				hasCalls = true
			}
		}
	}

	// Try mapping Locations
	for _, table := range tables {
		if table == "locations" || table == "device_locations" || table == "gps_locations" || table == "location" {
			updateStatus(func(s *ParseStatus) { s.CurrentItem = "Parsing Locations..." })
			_ = mapLocationsTable(srcDB, tx, table)
		}
	}

	// Try mapping Web History
	for _, table := range tables {
		if table == "web_history" || table == "browser_history" || table == "history" || table == "urls" {
			updateStatus(func(s *ParseStatus) { s.CurrentItem = "Parsing Web History..." })
			_ = mapWebHistoryTable(srcDB, tx, table)
		}
	}

	// Commit data
	if err := tx.Commit(); err != nil {
		return err
	}

	// Save extraction info
	_ = runInTransaction(func(t *sql.Tx) error {
		_ = saveExtractionInfoTx(t, "Model", "SQLite UFDR Database")
		_ = saveExtractionInfoTx(t, "OS", "N/A")
		_ = saveExtractionInfoTx(t, "Case Name", filepath.Base(ufdrPath))
		_ = saveExtractionInfoTx(t, "UFDR Path", ufdrPath)
		_ = saveExtractionInfoTx(t, "Database Recreated At", time.Now().Format(time.RFC3339))
		return nil
	})

	statusMsg := "Dynamic SQLite mapped successfully! "
	if !hasMessages && !hasCalls && !hasContacts {
		statusMsg = "SQLite indexed. Explore tables manually in the SQLite Explorer tab!"
	}

	updateStatus(func(s *ParseStatus) {
		s.CurrentItem = statusMsg
	})

	return nil
}

// Helpers for dynamic mapping

func mapContactsTable(src *sql.DB, tx *sql.Tx, tableName string) error {
	// Look for columns: id, name, number, identifier
	cols := getColumns(src, tableName)
	idCol := findColumn(cols, "id", "contact_id", "rowid", "_id", "raw_contact_id")
	nameSql := coalesceColumns(cols, "name", "display_name", "first_name", "formatted_name", "contact_name")
	identSql := coalesceColumns(cols, "identifier", "number", "phone", "email", "address", "data1", "phone_number")

	if idCol == "" {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT %s, %s, %s FROM %s", idCol, nameSql, identSql, tableName)

	rows, err := src.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, name, identifier string
		if err := rows.Scan(&id, &name, &identifier); err == nil {
			_ = saveContactTx(tx, Contact{
				ID:         id,
				Name:       name,
				Identifier: identifier,
				Type:       "Phonebook",
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Contacts++ })
		}
	}
	return nil
}

func mapMessagesTable(src *sql.DB, tx *sql.Tx, tableName string) error {
	cols := getColumns(src, tableName)
	idCol := findColumn(cols, "id", "message_id", "rowid", "_id", "msg_id", "guid")
	bodySql := coalesceColumns(cols, "body", "text", "message", "content", "msg_content", "data", "summary", "snippet")
	timeSql := coalesceColumns(cols, "timestamp", "time", "date", "created_at", "msg_date", "send_time", "recv_time", "date_read")
	senderSql := coalesceColumns(cols, "sender", "from", "party", "address", "phone_number", "contact_id", "thread_id", "number", "handle_id")
	dirSql := coalesceColumns(cols, "direction", "is_incoming", "type", "msg_type", "is_sent", "flags")

	if idCol == "" {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT %s, %s, %s, %s, %s FROM %s",
		idCol, bodySql, timeSql, senderSql, dirSql, tableName)

	rows, err := src.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, body, timestamp, sender, dir string
		if err := rows.Scan(&id, &body, &timestamp, &sender, &dir); err == nil {
			// Basic formatting
			direction := "Incoming"
			if dir == "1" || strings.ToLower(dir) == "outgoing" || strings.ToLower(dir) == "out" {
				direction = "Outgoing"
			}

			chatID := sender
			if chatID == "" {
				chatID = "unknown"
			}

			_ = saveChatTx(tx, Chat{
				ID:           chatID,
				Name:         chatID,
				Source:       "SMS",
				Participants: []string{sender},
			})

			_ = saveMessageTx(tx, Message{
				ID:         id,
				ChatID:     chatID,
				Timestamp:  formatTimestamp(timestamp),
				Body:       body,
				Direction:  direction,
				SenderID:   sender,
				SenderName: sender,
				Source:     "SMS",
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Messages++ })
		}
	}
	return nil
}

func mapCallsTable(src *sql.DB, tx *sql.Tx, tableName string) error {
	cols := getColumns(src, tableName)
	idCol := findColumn(cols, "id", "call_id", "rowid", "_id", "z_pk")
	partySql := coalesceColumns(cols, "party", "number", "address", "name", "phone_number", "handle", "contact_name")
	timeSql := coalesceColumns(cols, "timestamp", "time", "date", "created_at", "call_date")
	durSql := coalesceColumns(cols, "duration", "dur", "call_duration", "seconds")
	dirSql := coalesceColumns(cols, "direction", "type", "call_type", "flags")

	if idCol == "" {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT %s, %s, %s, %s, %s FROM %s",
		idCol, partySql, timeSql, durSql, dirSql, tableName)

	rows, err := src.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, party, timestamp, duration, dir string
		if err := rows.Scan(&id, &party, &timestamp, &duration, &dir); err == nil {
			direction := "Incoming"
			if dir == "2" || strings.ToLower(dir) == "outgoing" || strings.ToLower(dir) == "out" {
				direction = "Outgoing"
			}

			_ = saveCallTx(tx, Call{
				ID:              id,
				Timestamp:       formatTimestamp(timestamp),
				Duration:        duration,
				Direction:       direction,
				PartyIdentifier: party,
				PartyName:       party,
				Source:          "Phone",
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Calls++ })
		}
	}
	return nil
}

func mapLocationsTable(src *sql.DB, tx *sql.Tx, tableName string) error {
	cols := getColumns(src, tableName)
	idCol := findColumn(cols, "id", "rowid", "_id", "loc_id")
	latCol := findColumn(cols, "latitude", "lat", "pos_lat")
	lonCol := findColumn(cols, "longitude", "lon", "lng", "pos_lon")
	timeSql := coalesceColumns(cols, "timestamp", "time", "date", "created_at")
	addressSql := coalesceColumns(cols, "address", "name", "label", "location_name")

	if latCol == "" || lonCol == "" {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT COALESCE(%s, ''), %s, %s, %s, %s FROM %s",
		coalesceCol(idCol), latCol, lonCol, timeSql, addressSql, tableName)

	rows, err := src.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, timestamp, address string
		var lat, lon float64
		if err := rows.Scan(&id, &lat, &lon, &timestamp, &address); err == nil {
			if id == "" {
				id = fmt.Sprintf("loc_%d", time.Now().UnixNano())
			}
			_ = saveLocationTx(tx, Location{
				ID:        id,
				Timestamp: formatTimestamp(timestamp),
				Latitude:  lat,
				Longitude: lon,
				Address:   address,
				Source:    tableName,
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Locations++ })
		}
	}
	return nil
}

func mapWebHistoryTable(src *sql.DB, tx *sql.Tx, tableName string) error {
	cols := getColumns(src, tableName)
	idSql := coalesceColumns(cols, "id", "rowid", "_id")
	urlSql := coalesceColumns(cols, "url", "link", "address", "uri")
	titleSql := coalesceColumns(cols, "title", "name", "page_title")
	timeSql := coalesceColumns(cols, "timestamp", "time", "date", "visit_time", "created_at")

	query := fmt.Sprintf("SELECT %s, %s, %s, %s FROM %s",
		idSql, urlSql, titleSql, timeSql, tableName)

	rows, err := src.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, url, title, timestamp string
		if err := rows.Scan(&id, &url, &title, &timestamp); err == nil {
			if id == "" {
				id = fmt.Sprintf("web_%d", time.Now().UnixNano())
			}
			_ = saveWebHistoryTx(tx, WebHistory{
				ID:        id,
				URL:       url,
				Title:     title,
				Timestamp: formatTimestamp(timestamp),
				Source:    tableName,
			})
			updateStatus(func(s *ParseStatus) { s.Counts.WebHistory++ })
		}
	}
	return nil
}

func getColumns(src *sql.DB, tableName string) []string {
	var cols []string
	rows, err := src.Query(fmt.Sprintf("PRAGMA table_info('%s')", tableName))
	if err != nil {
		return cols
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, typeStr string
		var notnull, pk int
		var dfltValue *string
		if err := rows.Scan(&cid, &name, &typeStr, &notnull, &dfltValue, &pk); err == nil {
			cols = append(cols, strings.ToLower(name))
		}
	}
	return cols
}

func findColumn(cols []string, names ...string) string {
	// 1. Try exact match first
	for _, n := range names {
		for _, c := range cols {
			if c == n {
				return c
			}
		}
	}
	// 2. Try partial match if exact fails
	for _, n := range names {
		for _, c := range cols {
			if strings.Contains(c, n) {
				return c
			}
		}
	}
	return ""
}

func coalesceColumns(actualCols []string, candidates ...string) string {
	var found []string
	for _, cand := range candidates {
		// Exact match
		for _, ac := range actualCols {
			if strings.EqualFold(ac, cand) {
				found = append(found, ac)
				break
			}
		}
	}
	// Fallback to partial match if no exact matches
	if len(found) == 0 {
		for _, cand := range candidates {
			for _, ac := range actualCols {
				if strings.Contains(strings.ToLower(ac), strings.ToLower(cand)) {
					found = append(found, ac)
				}
			}
		}
	}

	if len(found) == 0 {
		return "''"
	}
	if len(found) == 1 {
		return fmt.Sprintf("COALESCE(CAST(%s AS TEXT), '')", found[0])
	}
	// Build COALESCE(col1, col2, col3, '')
	return fmt.Sprintf("COALESCE(CAST(%s AS TEXT), '')", strings.Join(found, " AS TEXT), CAST("))
}

func coalesceCol(colName string) string {
	if colName == "" {
		return "''" // Return empty string if column missing
	}
	return fmt.Sprintf("CAST(%s AS TEXT)", colName)
}

func formatTimestamp(ts string) string {
	if ts == "" {
		return ""
	}
	// If it's already ISO format, return it
	if strings.Contains(ts, "T") {
		return ts
	}
	// Try parsing as integer
	val, err := strconv.ParseInt(ts, 10, 64)
	if err != nil {
		return ts // fallback
	}
	// Determine if seconds, milliseconds, or Mac Absolute Time
	var t time.Time
	if val > 1e11 && val < 1e14 {
		// Milliseconds
		t = time.UnixMilli(val)
	} else if val > 978307200 && val < 1100000000 {
		// Mac Absolute Time (seconds since Jan 1 2001)
		t = time.Unix(val+978307200, 0)
	} else {
		// Seconds
		t = time.Unix(val, 0)
	}
	return t.UTC().Format(time.RFC3339)
}

func dumpSchema(db *sql.DB, tables []string, dumpPath string) {
	schema := make(map[string][]string)
	for _, table := range tables {
		schema[table] = getColumns(db, table)
	}
	
	data, err := json.MarshalIndent(schema, "", "  ")
	if err == nil {
		os.WriteFile(dumpPath, data, 0644)
	}
}
