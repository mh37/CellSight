package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "modernc.org/sqlite" // Pure Go SQLite driver (no CGO needed)
)

var db *sql.DB

// Schemas and Models
type ExtractionInfo map[string]string

type Stats struct {
	Contacts  int `json:"contacts"`
	Chats     int `json:"chats"`
	Messages  int `json:"messages"`
	Calls     int `json:"calls"`
	Files     int `json:"files"`
	Images    int `json:"images"`
	Videos    int `json:"videos"`
	Locations int `json:"locations"`
	Evidence  int `json:"evidence"`
}

type Contact struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Identifier string `json:"identifier"`
	Type       string `json:"type"`
	PhotoPath  string `json:"photo_path"`
}

type Chat struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Source       string   `json:"source"`
	Participants []string `json:"participants"`
	MessageCount int      `json:"message_count"`
	LastMessage  string   `json:"last_message"`
	LastMsgTime  string   `json:"last_message_time"`
}

type Attachment struct {
	ID         string `json:"id"`
	MessageID  string `json:"message_id"`
	FileID     string `json:"file_id"`
	Type       string `json:"type"`
	Filename   string `json:"filename"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
}

type Message struct {
	ID          string       `json:"id"`
	ChatID      string       `json:"chat_id"`
	Timestamp   string       `json:"timestamp"`
	Body        string       `json:"body"`
	Direction   string       `json:"direction"`
	SenderID    string       `json:"sender_id"`
	SenderName  string       `json:"sender_name"`
	Recipients  string       `json:"recipients"` // JSON string
	Status      string       `json:"status"`
	Source      string       `json:"source"`
	Attachments []Attachment `json:"attachments"`
	IsEvidence  bool         `json:"is_evidence"`
}

type Call struct {
	ID              string `json:"id"`
	Timestamp       string `json:"timestamp"`
	Duration        string `json:"duration"`
	Direction       string `json:"direction"`
	PartyName       string `json:"party_name"`
	PartyIdentifier string `json:"party_identifier"`
	Source          string `json:"source"`
	IsEvidence      bool   `json:"is_evidence"`
}

type File struct {
	ID          string  `json:"id"`
	Path        string  `json:"path"`
	Filename    string  `json:"filename"`
	Size        int64   `json:"size"`
	Type        string  `json:"type"`
	MD5         string  `json:"md5"`
	CreatedTime string  `json:"created_time"`
	Width       *int    `json:"width"`
	Height      *int    `json:"height"`
	Latitude    *float64 `json:"gps_latitude"`
	Longitude   *float64 `json:"gps_longitude"`
	IsEvidence  bool    `json:"is_evidence"`
}

type Location struct {
	ID         string   `json:"id"`
	Timestamp  string   `json:"timestamp"`
	Latitude   float64  `json:"latitude"`
	Longitude  float64  `json:"longitude"`
	Address    string   `json:"address"`
	Source     string   `json:"source"`
	Accuracy   *float64 `json:"accuracy"`
	IsEvidence bool     `json:"is_evidence"`
}

type TimelineEvent struct {
	EventType  string `json:"event_type"`
	ID         string `json:"id"`
	Timestamp  string `json:"timestamp"`
	Text       string `json:"text"`
	Direction  string `json:"direction"`
	Detail1    string `json:"detail_1"`
	Detail2    string `json:"detail_2"`
	IsEvidence bool   `json:"is_evidence"`
}

type Evidence struct {
	ID           int    `json:"id"`
	ArtifactType string `json:"artifact_type"`
	ArtifactID   string `json:"artifact_id"`
	Notes        string `json:"notes"`
	TaggedAt     string `json:"tagged_at"`
	Snippet      string `json:"snippet"`
	Metadata     string `json:"metadata"`
}

func initDb(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}

	// Performance tuning pragmas
	pragmas := []string{
		"PRAGMA foreign_keys = ON;",
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA temp_store = MEMORY;",
		// 64 MB page cache — enough for forensic queries without risking OOM
		// on production machines that may have limited RAM.
		"PRAGMA cache_size = -64000;",
	}
	for _, pragma := range pragmas {
		if _, err := db.Exec(pragma); err != nil {
			return fmt.Errorf("failed to run pragma %q: %v", pragma, err)
		}
	}

	// Create tables and indexes individually for driver compatibility.
	// (Some SQLite drivers ignore all but the first statement in a multi-statement Exec.)
	schema := []string{
		`CREATE TABLE IF NOT EXISTS extraction_info (
			key TEXT PRIMARY KEY,
			value TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS contacts (
			id TEXT PRIMARY KEY,
			name TEXT,
			identifier TEXT,
			type TEXT,
			photo_path TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS chats (
			id TEXT PRIMARY KEY,
			name TEXT,
			source TEXT,
			participants TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			chat_id TEXT,
			timestamp TEXT,
			body TEXT,
			direction TEXT,
			sender_id TEXT,
			sender_name TEXT,
			recipients TEXT,
			status TEXT,
			source TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS attachments (
			id TEXT PRIMARY KEY,
			message_id TEXT,
			file_id TEXT,
			type TEXT,
			filename TEXT,
			path TEXT,
			size INTEGER
		)`,
		`CREATE TABLE IF NOT EXISTS calls (
			id TEXT PRIMARY KEY,
			timestamp TEXT,
			duration TEXT,
			direction TEXT,
			party_name TEXT,
			party_identifier TEXT,
			source TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS files (
			id TEXT PRIMARY KEY,
			path TEXT,
			filename TEXT,
			size INTEGER,
			type TEXT,
			md5 TEXT,
			created_time TEXT,
			width INTEGER,
			height INTEGER,
			gps_latitude REAL,
			gps_longitude REAL
		)`,
		`CREATE TABLE IF NOT EXISTS locations (
			id TEXT PRIMARY KEY,
			timestamp TEXT,
			latitude REAL,
			longitude REAL,
			address TEXT,
			source TEXT,
			accuracy REAL
		)`,
		`CREATE TABLE IF NOT EXISTS evidence (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			artifact_type TEXT,
			artifact_id TEXT,
			notes TEXT,
			tagged_at TEXT,
			UNIQUE(artifact_type, artifact_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id)`,
		`CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_files_type ON files(type)`,
		`CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp)`,
		`CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name)`,
		`CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_id, timestamp)`,
	}
	for _, stmt := range schema {
		if _, err = db.Exec(stmt); err != nil {
			return fmt.Errorf("schema init failed: %v\nStatement: %s", err, stmt)
		}
	}
	return nil
}

// Transaction helper for fast batching
func runInTransaction(fn func(*sql.Tx) error) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// Writers
func saveExtractionInfoTx(tx *sql.Tx, key, value string) error {
	_, err := tx.Exec("INSERT OR REPLACE INTO extraction_info (key, value) VALUES (?, ?)", key, value)
	return err
}

func saveContactTx(tx *sql.Tx, c Contact) error {
	_, err := tx.Exec("INSERT OR REPLACE INTO contacts (id, name, identifier, type, photo_path) VALUES (?, ?, ?, ?, ?)",
		c.ID, c.Name, c.Identifier, c.Type, c.PhotoPath)
	return err
}

func saveChatTx(tx *sql.Tx, c Chat) error {
	participantsJSON, _ := json.Marshal(c.Participants)
	_, err := tx.Exec("INSERT OR REPLACE INTO chats (id, name, source, participants) VALUES (?, ?, ?, ?)",
		c.ID, c.Name, c.Source, string(participantsJSON))
	return err
}

func saveMessageTx(tx *sql.Tx, m Message) error {
	_, err := tx.Exec(`
		INSERT OR REPLACE INTO messages 
		(id, chat_id, timestamp, body, direction, sender_id, sender_name, recipients, status, source) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.ChatID, m.Timestamp, m.Body, m.Direction, m.SenderID, m.SenderName, m.Recipients, m.Status, m.Source)
	return err
}

func saveAttachmentTx(tx *sql.Tx, a Attachment) error {
	_, err := tx.Exec("INSERT OR REPLACE INTO attachments (id, message_id, file_id, type, filename, path, size) VALUES (?, ?, ?, ?, ?, ?, ?)",
		a.ID, a.MessageID, a.FileID, a.Type, a.Filename, a.Path, a.Size)
	return err
}

func saveCallTx(tx *sql.Tx, c Call) error {
	_, err := tx.Exec("INSERT OR REPLACE INTO calls (id, timestamp, duration, direction, party_name, party_identifier, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
		c.ID, c.Timestamp, c.Duration, c.Direction, c.PartyName, c.PartyIdentifier, c.Source)
	return err
}

func saveFileTx(tx *sql.Tx, f File) error {
	_, err := tx.Exec(`
		INSERT OR REPLACE INTO files 
		(id, path, filename, size, type, md5, created_time, width, height, gps_latitude, gps_longitude) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		f.ID, f.Path, f.Filename, f.Size, f.Type, f.MD5, f.CreatedTime, f.Width, f.Height, f.Latitude, f.Longitude)
	return err
}

func saveLocationTx(tx *sql.Tx, l Location) error {
	_, err := tx.Exec("INSERT OR REPLACE INTO locations (id, timestamp, latitude, longitude, address, source, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?)",
		l.ID, l.Timestamp, l.Latitude, l.Longitude, l.Address, l.Source, l.Accuracy)
	return err
}

// Readers
func getExtractionInfo() (ExtractionInfo, error) {
	rows, err := db.Query("SELECT key, value FROM extraction_info")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	info := make(ExtractionInfo)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		info[k] = v
	}
	return info, nil
}

func getStats() (Stats, error) {
	var s Stats
	queryCount := func(q string) int {
		var count int
		_ = db.QueryRow(q).Scan(&count)
		return count
	}

	s.Contacts = queryCount("SELECT COUNT(*) FROM contacts")
	s.Chats = queryCount("SELECT COUNT(*) FROM chats")
	s.Messages = queryCount("SELECT COUNT(*) FROM messages")
	s.Calls = queryCount("SELECT COUNT(*) FROM calls")
	s.Files = queryCount("SELECT COUNT(*) FROM files")
	s.Images = queryCount("SELECT COUNT(*) FROM files WHERE type = 'image'")
	s.Videos = queryCount("SELECT COUNT(*) FROM files WHERE type = 'video'")
	s.Locations = queryCount("SELECT COUNT(*) FROM locations")
	s.Evidence = queryCount("SELECT COUNT(*) FROM evidence")

	return s, nil
}

func getChats(search string, limit, offset int) ([]Chat, error) {
	if limit <= 0 {
		limit = 100
	}
	query := `
		SELECT c.id, c.name, c.source, c.participants,
		       (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) as message_count,
		       (SELECT m.body FROM messages m WHERE m.chat_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_message,
		       (SELECT m.timestamp FROM messages m WHERE m.chat_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_message_time
		FROM chats c
	`
	var args []interface{}
	if search != "" {
		query += " WHERE c.name LIKE ? OR c.source LIKE ?"
		s := "%" + search + "%"
		args = append(args, s, s)
	}
	query += " ORDER BY last_message_time DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var chats []Chat
	for rows.Next() {
		var c Chat
		var participantsStr, lastMsgNull, lastTimeNull sql.NullString
		if err := rows.Scan(&c.ID, &c.Name, &c.Source, &participantsStr, &c.MessageCount, &lastMsgNull, &lastTimeNull); err != nil {
			return nil, err
		}
		if participantsStr.Valid {
			_ = json.Unmarshal([]byte(participantsStr.String), &c.Participants)
		}
		c.LastMessage = lastMsgNull.String
		c.LastMsgTime = lastTimeNull.String
		chats = append(chats, c)
	}
	return chats, nil
}

func getChatMessages(chatID string, limit, offset int) ([]Message, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}

	// Fetch messages with a single JOIN for attachments — avoids N+1 queries that
	// become catastrophic on large chats (e.g. 5000 messages = 5001 DB round-trips).
	query := `
		SELECT m.id, m.chat_id, m.timestamp, m.body, m.direction, m.sender_id, m.sender_name,
		       m.recipients, m.status, m.source,
		       EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'message' AND e.artifact_id = m.id) as is_evidence,
		       COALESCE(
		           (SELECT GROUP_CONCAT(a.id || '|' || COALESCE(a.file_id,'') || '|' || COALESCE(a.type,'') || '|' ||
		                               COALESCE(a.filename,'') || '|' || COALESCE(a.path,'') || '|' || COALESCE(a.size,0), '~~~')
		            FROM attachments a WHERE a.message_id = m.id),
		           ''
		       ) as attachment_blob
		FROM messages m
		WHERE m.chat_id = ?
		ORDER BY m.timestamp ASC
		LIMIT ? OFFSET ?
	`
	rows, err := db.Query(query, chatID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var m Message
		var attachmentBlob string
		if err := rows.Scan(&m.ID, &m.ChatID, &m.Timestamp, &m.Body, &m.Direction, &m.SenderID,
			&m.SenderName, &m.Recipients, &m.Status, &m.Source, &m.IsEvidence, &attachmentBlob); err != nil {
			return nil, err
		}

		// Decode attachment blob (avoids N+1 queries)
		if attachmentBlob != "" {
			for _, attStr := range strings.Split(attachmentBlob, "~~~") {
				parts := strings.SplitN(attStr, "|", 6)
				if len(parts) == 6 {
					size := int64(0)
					fmt.Sscanf(parts[5], "%d", &size)
					m.Attachments = append(m.Attachments, Attachment{
						ID:        parts[0],
						FileID:    parts[1],
						Type:      parts[2],
						Filename:  parts[3],
						Path:      parts[4],
						Size:      size,
						MessageID: m.ID,
					})
				}
			}
		}
		messages = append(messages, m)
	}
	return messages, nil
}

func getCalls(direction, search string, limit, offset int) ([]Call, error) {
	query := `
		SELECT c.id, c.timestamp, c.duration, c.direction, c.party_name, c.party_identifier, c.source,
		       EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'call' AND e.artifact_id = c.id) as is_evidence
		FROM calls c
	`
	var conditions []string
	var args []interface{}

	if direction != "" && direction != "all" {
		conditions = append(conditions, "c.direction = ?")
		args = append(args, direction)
	}
	if search != "" {
		conditions = append(conditions, "(c.party_name LIKE ? OR c.party_identifier LIKE ? OR c.source LIKE ?)")
		searchTerm := "%" + search + "%"
		args = append(args, searchTerm, searchTerm, searchTerm)
	}

	if len(conditions) > 0 {
		query += " WHERE "
		for i, cond := range conditions {
			if i > 0 {
				query += " AND "
			}
			query += cond
		}
	}

	query += " ORDER BY c.timestamp DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var calls []Call
	for rows.Next() {
		var c Call
		if err := rows.Scan(&c.ID, &c.Timestamp, &c.Duration, &c.Direction, &c.PartyName, &c.PartyIdentifier, &c.Source, &c.IsEvidence); err != nil {
			return nil, err
		}
		calls = append(calls, c)
	}
	return calls, nil
}

func getContacts(search string, limit, offset int) ([]Contact, error) {
	if limit <= 0 {
		limit = 100
	}
	query := "SELECT id, name, identifier, type, photo_path FROM contacts"
	var args []interface{}
	if search != "" {
		query += " WHERE name LIKE ? OR identifier LIKE ?"
		s := "%" + search + "%"
		args = append(args, s, s)
	}
	query += " ORDER BY name ASC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var contacts []Contact
	for rows.Next() {
		var c Contact
		if err := rows.Scan(&c.ID, &c.Name, &c.Identifier, &c.Type, &c.PhotoPath); err != nil {
			return nil, err
		}
		contacts = append(contacts, c)
	}
	return contacts, nil
}

func getFiles(fileType, search string, limit, offset int) ([]File, error) {
	query := `
		SELECT f.id, f.path, f.filename, f.size, f.type, f.md5, f.created_time, f.width, f.height, f.gps_latitude, f.gps_longitude,
		       EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'file' AND e.artifact_id = f.id) as is_evidence
		FROM files f
	`
	var conditions []string
	var args []interface{}

	if fileType != "" && fileType != "all" {
		conditions = append(conditions, "f.type = ?")
		args = append(args, fileType)
	}
	if search != "" {
		conditions = append(conditions, "(f.filename LIKE ? OR f.path LIKE ?)")
		s := "%" + search + "%"
		args = append(args, s, s)
	}

	if len(conditions) > 0 {
		query += " WHERE "
		for i, cond := range conditions {
			if i > 0 {
				query += " AND "
			}
			query += cond
		}
	}

	query += " ORDER BY f.filename ASC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []File
	for rows.Next() {
		var f File
		if err := rows.Scan(&f.ID, &f.Path, &f.Filename, &f.Size, &f.Type, &f.MD5, &f.CreatedTime, &f.Width, &f.Height, &f.Latitude, &f.Longitude, &f.IsEvidence); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, nil
}

func getLocations(limit, offset int) ([]Location, error) {
	if limit <= 0 {
		limit = 500
	}
	query := `
		SELECT l.id, l.timestamp, l.latitude, l.longitude, l.address, l.source, l.accuracy,
		       EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'location' AND e.artifact_id = l.id) as is_evidence
		FROM locations l
		ORDER BY l.timestamp ASC
		LIMIT ? OFFSET ?
	`
	rows, err := db.Query(query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var locations []Location
	for rows.Next() {
		var l Location
		if err := rows.Scan(&l.ID, &l.Timestamp, &l.Latitude, &l.Longitude, &l.Address, &l.Source, &l.Accuracy, &l.IsEvidence); err != nil {
			return nil, err
		}
		locations = append(locations, l)
	}
	return locations, nil
}

func getTimeline(typeFilter, search string, limit, offset int) ([]TimelineEvent, error) {
	query := `
		SELECT * FROM (
			SELECT 'message' as event_type, id, timestamp, body as text, direction, sender_name as detail_1, source as detail_2,
			       EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'message' AND e.artifact_id = id) as is_evidence
			FROM messages
			
			UNION ALL
			
			SELECT 'call' as event_type, id, timestamp, 'Call: ' || direction || CASE WHEN duration != '' AND duration != '0' THEN ' (' || duration || 's)' ELSE '' END as text, direction, party_name as detail_1, source as detail_2,
			       EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'call' AND e.artifact_id = id) as is_evidence
			FROM calls

			UNION ALL

			SELECT 'location' as event_type, id, timestamp, 'Location: ' || COALESCE(address, 'Coordinates: ' || latitude || ', ' || longitude) as text, 'local' as direction, 'Accuracy: ' || COALESCE(accuracy, 'N/A') as detail_1, source as detail_2,
			       EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'location' AND e.artifact_id = id) as is_evidence
			FROM locations

			UNION ALL

			SELECT 'file' as event_type, id, COALESCE(created_time, '') as timestamp, 'File Created: ' || filename as text, 'local' as direction, type as detail_1, path as detail_2,
			       EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'file' AND e.artifact_id = id) as is_evidence
			FROM files
			WHERE created_time IS NOT NULL AND created_time != ''
		)
	`
	var conditions []string
	var args []interface{}

	if typeFilter != "" && typeFilter != "all" {
		conditions = append(conditions, "event_type = ?")
		args = append(args, typeFilter)
	}
	if search != "" {
		conditions = append(conditions, "(text LIKE ? OR detail_1 LIKE ? OR detail_2 LIKE ?)")
		s := "%" + search + "%"
		args = append(args, s, s, s)
	}

	if len(conditions) > 0 {
		query += " WHERE "
		for i, cond := range conditions {
			if i > 0 {
				query += " AND "
			}
			query += cond
		}
	}

	query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []TimelineEvent
	for rows.Next() {
		var e TimelineEvent
		if err := rows.Scan(&e.EventType, &e.ID, &e.Timestamp, &e.Text, &e.Direction, &e.Detail1, &e.Detail2, &e.IsEvidence); err != nil {
			return nil, err
		}
		events = append(events, e)
	}
	return events, nil
}

// Evidence management
func addEvidence(artType, artID, notes string) error {
	_, err := db.Exec(`
		INSERT OR REPLACE INTO evidence (artifact_type, artifact_id, notes, tagged_at)
		VALUES (?, ?, ?, ?)`,
		artType, artID, notes, time.Now().Format(time.RFC3339))
	return err
}

func removeEvidence(artType, artID string) error {
	_, err := db.Exec("DELETE FROM evidence WHERE artifact_type = ? AND artifact_id = ?", artType, artID)
	return err
}

func getEvidence() ([]Evidence, error) {
	query := `
		SELECT e.id, e.artifact_type, e.artifact_id, e.notes, e.tagged_at,
		       CASE e.artifact_type
		         WHEN 'message' THEN (SELECT body FROM messages WHERE id = e.artifact_id)
		         WHEN 'call' THEN (SELECT 'Call from/to ' || party_name || ' (' || direction || ')' FROM calls WHERE id = e.artifact_id)
		         WHEN 'file' THEN (SELECT 'File: ' || filename FROM files WHERE id = e.artifact_id)
		         WHEN 'location' THEN (SELECT 'Location: ' || latitude || ', ' || longitude FROM locations WHERE id = e.artifact_id)
		       END as snippet,
		       CASE e.artifact_type
		         WHEN 'message' THEN (SELECT source FROM messages WHERE id = e.artifact_id)
		         WHEN 'call' THEN (SELECT source FROM calls WHERE id = e.artifact_id)
		         WHEN 'file' THEN (SELECT type FROM files WHERE id = e.artifact_id)
		         WHEN 'location' THEN (SELECT source FROM locations WHERE id = e.artifact_id)
		       END as metadata
		FROM evidence e
		ORDER BY e.tagged_at DESC
	`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Evidence
	for rows.Next() {
		var e Evidence
		var snippetNull, metaNull sql.NullString
		if err := rows.Scan(&e.ID, &e.ArtifactType, &e.ArtifactID, &e.Notes, &e.TaggedAt, &snippetNull, &metaNull); err != nil {
			return nil, err
		}
		e.Snippet = snippetNull.String
		e.Metadata = metaNull.String
		list = append(list, e)
	}
	return list, nil
}
