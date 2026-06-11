package main

import (
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

// Helper to initialize a clean in-memory database for testing
func setupTestDb(t *testing.T) {
	var err error
	db, err = sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}

	// Create tables and indexes
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS extraction_info (key TEXT PRIMARY KEY, value TEXT);
		CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, name TEXT, identifier TEXT, type TEXT, photo_path TEXT);
		CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, name TEXT, source TEXT, participants TEXT);
		CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, chat_id TEXT, timestamp TEXT, body TEXT, direction TEXT, sender_id TEXT, sender_name TEXT, recipients TEXT, status TEXT, source TEXT);
		CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, message_id TEXT, file_id TEXT, type TEXT, filename TEXT, path TEXT, size INTEGER);
		CREATE TABLE IF NOT EXISTS calls (id TEXT PRIMARY KEY, timestamp TEXT, duration TEXT, direction TEXT, party_name TEXT, party_identifier TEXT, source TEXT);
		CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, path TEXT, filename TEXT, size INTEGER, type TEXT, md5 TEXT, created_time TEXT, width INTEGER, height INTEGER, gps_latitude REAL, gps_longitude REAL);
		CREATE TABLE IF NOT EXISTS locations (id TEXT PRIMARY KEY, timestamp TEXT, latitude REAL, longitude REAL, address TEXT, source TEXT, accuracy REAL);
		CREATE TABLE IF NOT EXISTS evidence (id INTEGER PRIMARY KEY AUTOINCREMENT, artifact_type TEXT, artifact_id TEXT, notes TEXT, tagged_at TEXT, UNIQUE(artifact_type, artifact_id));
	`)
	if err != nil {
		t.Fatalf("failed to create tables: %v", err)
	}
}

func TestSaveAndGetExtractionInfo(t *testing.T) {
	setupTestDb(t)
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}

	err = saveExtractionInfoTx(tx, "DeviceModel", "iPhone 15")
	if err != nil {
		t.Fatalf("failed to save extraction info: %v", err)
	}
	tx.Commit()

	info, err := getExtractionInfo()
	if err != nil {
		t.Fatal(err)
	}

	if info["DeviceModel"] != "iPhone 15" {
		t.Errorf("expected iPhone 15, got %s", info["DeviceModel"])
	}
}

func TestProcessRootModelContact(t *testing.T) {
	setupTestDb(t)
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}

	contactModel := &ParsedModel{
		Type: "Contact",
		ID:   "contact-101",
		Fields: map[string]string{
			"Name":       "Alice",
			"Identifier": "+12345",
			"Type":       "WhatsApp",
		},
	}

	processRootModel(tx, contactModel)
	tx.Commit()

	contacts, err := getContacts("")
	if err != nil {
		t.Fatal(err)
	}

	if len(contacts) != 1 {
		t.Fatalf("expected 1 contact, got %d", len(contacts))
	}

	c := contacts[0]
	if c.ID != "contact-101" || c.Name != "Alice" || c.Identifier != "+12345" || c.Type != "WhatsApp" {
		t.Errorf("contact mapping incorrect: %+v", c)
	}
}

func TestProcessRootModelInstantMessage(t *testing.T) {
	setupTestDb(t)
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}

	// Mock WhatsApp Message Model
	msgModel := &ParsedModel{
		Type: "InstantMessage",
		ID:   "msg-202",
		Fields: map[string]string{
			"Body":      "Suspicious meeting at docks",
			"TimeStamp": "2026-06-09T10:00:00Z",
			"Direction": "Incoming",
			"Source":    "WhatsApp",
			"ChatId":    "chat-deal",
			"ChatName":  "Deal Group",
		},
		ModelFields: map[string]*ParsedModel{
			"From": {
				Type: "Party",
				ID:   "contact-dave",
				Fields: map[string]string{
					"Name":       "Dave",
					"Identifier": "+54321",
				},
			},
		},
	}

	processRootModel(tx, msgModel)
	tx.Commit()

	// 1. Verify Chat Reconstructed
	chats, err := getChats()
	if err != nil {
		t.Fatal(err)
	}
	if len(chats) != 1 {
		t.Fatalf("expected 1 chat, got %d", len(chats))
	}
	if chats[0].ID != "chat-deal" || chats[0].Name != "Deal Group" {
		t.Errorf("chat reconstruction mismatch: %+v", chats[0])
	}

	// 2. Verify Message Parsed
	messages, err := getChatMessages("chat-deal", 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(messages))
	}

	m := messages[0]
	if m.ID != "msg-202" || m.Body != "Suspicious meeting at docks" || m.SenderName != "Dave" || m.SenderID != "contact-dave" {
		t.Errorf("message parsing mismatch: %+v", m)
	}
}

func TestProcessRootModelCall(t *testing.T) {
	setupTestDb(t)
	defer db.Close()

	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}

	callModel := &ParsedModel{
		Type: "Call",
		ID:   "call-303",
		Fields: map[string]string{
			"TimeStamp": "2026-06-09T10:30:00Z",
			"Duration":  "45",
			"Direction": "Missed",
			"Source":    "Viber",
			"PartyName": "Charlie",
		},
	}

	processRootModel(tx, callModel)
	tx.Commit()

	calls, err := getCalls("all", "", 10, 0)
	if err != nil {
		t.Fatal(err)
	}

	if len(calls) != 1 {
		t.Fatalf("expected 1 call log, got %d", len(calls))
	}

	c := calls[0]
	if c.ID != "call-303" || c.Direction != "Missed" || c.PartyName != "Charlie" || c.Source != "Viber" {
		t.Errorf("call log mapping mismatch: %+v", c)
	}
}

func TestEvidenceTagging(t *testing.T) {
	setupTestDb(t)
	defer db.Close()

	// Add mock message to check is_evidence flags
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	
	_ = saveMessageTx(tx, Message{
		ID:     "msg-test",
		ChatID: "chat-test",
		Body:   "evidence text",
	})
	tx.Commit()

	// Tag as evidence
	err = addEvidence("message", "msg-test", "Suspect coordination proof")
	if err != nil {
		t.Fatalf("failed to add evidence: %v", err)
	}

	// Verify is_evidence flag inside query
	msgs, err := getChatMessages("chat-test", 10, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 1 || !msgs[0].IsEvidence {
		t.Errorf("expected message to be flagged as evidence, got: %+v", msgs)
	}

	// Check evidence index list
	list, err := getEvidence()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ArtifactID != "msg-test" || list[0].Notes != "Suspect coordination proof" {
		t.Errorf("evidence report details incorrect: %+v", list)
	}

	// Untag evidence
	err = removeEvidence("message", "msg-test")
	if err != nil {
		t.Fatal(err)
	}

	list2, _ := getEvidence()
	if len(list2) != 0 {
		t.Errorf("expected evidence list to be empty after untagging, got %d", len(list2))
	}
}
