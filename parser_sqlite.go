package main

import (

	"database/sql"
	"fmt"
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
	idCol := findColumn(cols, "id", "contact_id", "rowid")
	nameCol := findColumn(cols, "name", "display_name", "first_name")
	identCol := findColumn(cols, "number", "identifier", "value", "phone")

	if idCol == "" || (nameCol == "" && identCol == "") {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT %s, COALESCE(%s, ''), COALESCE(%s, '') FROM %s",
		idCol,
		coalesceCol(nameCol),
		coalesceCol(identCol),
		tableName)

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
	idCol := findColumn(cols, "id", "message_id", "rowid")
	bodyCol := findColumn(cols, "body", "text", "message", "content")
	timeCol := findColumn(cols, "timestamp", "time", "date", "created_at")
	senderCol := findColumn(cols, "sender", "from", "party", "address")
	dirCol := findColumn(cols, "direction", "is_incoming", "type")

	if idCol == "" || bodyCol == "" {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT %s, COALESCE(%s, ''), COALESCE(%s, ''), COALESCE(%s, ''), COALESCE(%s, '') FROM %s",
		idCol, coalesceCol(bodyCol), coalesceCol(timeCol), coalesceCol(senderCol), coalesceCol(dirCol), tableName)

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
	idCol := findColumn(cols, "id", "call_id", "rowid")
	partyCol := findColumn(cols, "party", "number", "address", "name")
	timeCol := findColumn(cols, "timestamp", "time", "date")
	durCol := findColumn(cols, "duration")
	dirCol := findColumn(cols, "direction", "type")

	if idCol == "" || partyCol == "" {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT %s, COALESCE(%s, ''), COALESCE(%s, ''), COALESCE(%s, ''), COALESCE(%s, '') FROM %s",
		idCol, coalesceCol(partyCol), coalesceCol(timeCol), coalesceCol(durCol), coalesceCol(dirCol), tableName)

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
	idCol := findColumn(cols, "id", "rowid")
	latCol := findColumn(cols, "latitude", "lat")
	lonCol := findColumn(cols, "longitude", "lon", "lng")
	timeCol := findColumn(cols, "timestamp", "time", "date")
	addrCol := findColumn(cols, "address", "name", "label")

	if latCol == "" || lonCol == "" {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT COALESCE(%s, ''), %s, %s, COALESCE(%s, ''), COALESCE(%s, '') FROM %s",
		coalesceCol(idCol), latCol, lonCol, coalesceCol(timeCol), coalesceCol(addrCol), tableName)

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
	idCol := findColumn(cols, "id", "rowid")
	urlCol := findColumn(cols, "url", "link", "address")
	titleCol := findColumn(cols, "title", "name")
	timeCol := findColumn(cols, "timestamp", "time", "date", "visit_time")

	if urlCol == "" {
		return fmt.Errorf("insufficient columns")
	}

	query := fmt.Sprintf("SELECT COALESCE(%s, ''), COALESCE(%s, ''), COALESCE(%s, ''), COALESCE(%s, '') FROM %s",
		coalesceCol(idCol), urlCol, coalesceCol(titleCol), coalesceCol(timeCol), tableName)

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

func coalesceCol(colName string) string {
	if colName == "" {
		return "''" // Return empty string if column missing
	}
	return colName
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
