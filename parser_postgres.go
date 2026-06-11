package main

import (
	"bufio"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"
)

// parsePostgresDump reads a plain-text PostgreSQL dump and extracts key tables into SQLite
func parsePostgresDump(sourceDumpPath string, destDbPath string, ufdrPath string) error {
	updateStatus(func(s *ParseStatus) {
		s.CurrentItem = "Translating PostgreSQL Dump to SQLite..."
	})

	file, err := os.Open(sourceDumpPath)
	if err != nil {
		return fmt.Errorf("failed to open postgres dump: %v", err)
	}
	defer file.Close()

	// Begin a single transaction for everything
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %v", err)
	}

	scanner := bufio.NewScanner(file)
	// Max capacity for lines
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	var currentTable string
	var currentColumns []string
	inCopyBlock := false

	lineCount := 0
	for scanner.Scan() {
		line := scanner.Text()
		lineCount++

		if lineCount%10000 == 0 {
			updateStatus(func(s *ParseStatus) {
				s.CurrentItem = fmt.Sprintf("Translating PostgreSQL Dump... (Line %d)", lineCount)
			})
		}

		if inCopyBlock {
			if line == "\\." {
				inCopyBlock = false
				currentTable = ""
				currentColumns = nil
				continue
			}
			
			// Process data row
			if currentTable != "" {
				processCopyRow(tx, currentTable, currentColumns, line)
			}
			continue
		}

		// Detect COPY block
		// Example: COPY public.messages (id, body, timestamp, sender, direction) FROM stdin;
		if strings.HasPrefix(line, "COPY ") {
			parts := strings.SplitN(line, " (", 2)
			if len(parts) == 2 {
				tableNameRaw := strings.TrimPrefix(parts[0], "COPY ")
				tableNameParts := strings.Split(tableNameRaw, ".")
				currentTable = strings.ToLower(tableNameParts[len(tableNameParts)-1]) // drop public.
				
				colParts := strings.SplitN(parts[1], ") FROM stdin;", 2)
				if len(colParts) > 0 {
					colStr := colParts[0]
					cols := strings.Split(colStr, ",")
					for _, c := range cols {
						currentColumns = append(currentColumns, strings.TrimSpace(strings.ToLower(c)))
					}
				}
				inCopyBlock = true
			}
		} else if strings.HasPrefix(line, "INSERT INTO ") {
			// Example: INSERT INTO public.messages VALUES (1, 'Hello', ...);
			// We skip standard inserts for now and prefer COPY, but we could add INSERT parsing if needed.
		}
	}

	if err := scanner.Err(); err != nil {
		tx.Rollback()
		return fmt.Errorf("error reading dump: %v", err)
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Save extraction info
	_ = runInTransaction(func(t *sql.Tx) error {
		_ = saveExtractionInfoTx(t, "Model", "Translated Postgres Dump")
		_ = saveExtractionInfoTx(t, "OS", "N/A")
		_ = saveExtractionInfoTx(t, "Case Name", "Postgres Extraction")
		_ = saveExtractionInfoTx(t, "UFDR Path", ufdrPath)
		_ = saveExtractionInfoTx(t, "Database Recreated At", time.Now().Format(time.RFC3339))
		return nil
	})

	return nil
}

func processCopyRow(tx *sql.Tx, table string, columns []string, line string) {
	values := strings.Split(line, "\t")
	
	// Ensure we don't out of bounds
	getVal := func(colNames ...string) string {
		for _, colName := range colNames {
			for i, c := range columns {
				if c == colName && i < len(values) {
					if values[i] == "\\N" { // Postgres NULL
						return ""
					}
					return values[i]
				}
			}
		}
		return ""
	}

	switch table {
	case "messages", "sms", "chat_messages", "chats":
		id := getVal("id", "message_id", "rowid")
		body := getVal("body", "text", "message", "content")
		ts := getVal("timestamp", "time", "date", "created_at")
		sender := getVal("sender", "from", "party", "address")
		dir := getVal("direction", "is_incoming", "type")

		if id != "" && body != "" {
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
				Source:       "Translated PG",
				Participants: []string{sender},
			})

			_ = saveMessageTx(tx, Message{
				ID:         id,
				ChatID:     chatID,
				Timestamp:  formatTimestamp(ts),
				Body:       body,
				Direction:  direction,
				SenderID:   sender,
				SenderName: sender,
				Source:     "Translated PG",
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Messages++ })
		}

	case "calls", "call_log", "calllog":
		id := getVal("id", "call_id", "rowid")
		party := getVal("party", "number", "address", "name")
		ts := getVal("timestamp", "time", "date")
		dur := getVal("duration")
		dir := getVal("direction", "type")

		if id != "" && party != "" {
			direction := "Incoming"
			if dir == "2" || strings.ToLower(dir) == "outgoing" || strings.ToLower(dir) == "out" {
				direction = "Outgoing"
			}

			_ = saveCallTx(tx, Call{
				ID:              id,
				Timestamp:       formatTimestamp(ts),
				Duration:        dur,
				Direction:       direction,
				PartyIdentifier: party,
				PartyName:       party,
				Source:          "Translated PG",
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Calls++ })
		}
		
	case "contacts", "phonebook":
		id := getVal("id", "contact_id", "rowid")
		name := getVal("name", "display_name", "first_name")
		identifier := getVal("identifier", "number", "phone", "email", "address")
		contactType := getVal("type", "contact_type")

		if id != "" && (name != "" || identifier != "") {
			_ = saveContactTx(tx, Contact{
				ID:         id,
				Name:       name,
				Identifier: identifier,
				Type:       contactType,
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Contacts++ })
		}
		
	case "locations", "device_locations", "gps_locations", "location":
		id := getVal("id", "rowid")
		latStr := getVal("latitude", "lat")
		lonStr := getVal("longitude", "lon", "lng")
		ts := getVal("timestamp", "time", "date")
		address := getVal("address", "name", "label")

		if latStr != "" && lonStr != "" {
			if id == "" {
				id = fmt.Sprintf("loc_%d", time.Now().UnixNano())
			}
			
			// very naive parsing, just save it into DB (SQLite is weakly typed anyway)
			_, _ = tx.Exec("INSERT OR REPLACE INTO locations (id, timestamp, latitude, longitude, address, source) VALUES (?, ?, ?, ?, ?, ?)",
				id, formatTimestamp(ts), latStr, lonStr, address, "Translated PG")
				
			updateStatus(func(s *ParseStatus) { s.Counts.Locations++ })
		}
		
	case "web_history", "browser_history", "history", "urls":
		id := getVal("id", "rowid")
		url := getVal("url", "link", "address")
		title := getVal("title", "name")
		ts := getVal("timestamp", "time", "date", "visit_time")

		if url != "" {
			if id == "" {
				id = fmt.Sprintf("web_%d", time.Now().UnixNano())
			}
			_ = saveWebHistoryTx(tx, WebHistory{
				ID:        id,
				URL:       url,
				Title:     title,
				Timestamp: formatTimestamp(ts),
				Source:    "Translated PG",
			})
			updateStatus(func(s *ParseStatus) { s.Counts.WebHistory++ })
		}
	}
}
