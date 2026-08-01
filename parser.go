package main

import (
	"archive/zip"
	"database/sql"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type ParseCounts struct {
	Contacts  int `json:"contacts"`
	Chats     int `json:"chats"`
	Messages  int `json:"messages"`
	Calls     int `json:"calls"`
	Files     int `json:"files"`
	Locations  int `json:"locations"`
	WebHistory int `json:"web_history"`
}

type ParseStatus struct {
	Active      bool        `json:"active"`
	Progress    int         `json:"progress"`
	BytesRead   int64       `json:"bytesRead"`
	TotalBytes  int64       `json:"totalBytes"`
	CurrentItem string      `json:"currentItem"`
	Error       string      `json:"error,omitempty"`
	Counts      ParseCounts `json:"counts"`
}

var (
	statusMutex sync.Mutex
	parseStatus ParseStatus
)

func getParseStatus() ParseStatus {
	statusMutex.Lock()
	defer statusMutex.Unlock()
	return parseStatus
}

func updateStatus(fn func(*ParseStatus)) {
	statusMutex.Lock()
	defer statusMutex.Unlock()
	fn(&parseStatus)
}

type ParsedModel struct {
	Type             string
	ID               string
	Fields           map[string]string
	ModelFields      map[string]*ParsedModel
	MultiModelFields map[string][]*ParsedModel
}

func getField(pm *ParsedModel, name string) string {
	if pm == nil || pm.Fields == nil {
		return ""
	}
	// Fast path for exact match
	if v, ok := pm.Fields[name]; ok {
		return v
	}
	// Slow path for case-insensitive match
	for k, v := range pm.Fields {
		if strings.EqualFold(k, name) {
			return v
		}
	}
	return ""
}

func getAttr(attrs []xml.Attr, name string) string {
	target := strings.ToLower(name)
	for _, attr := range attrs {
		if strings.ToLower(attr.Name.Local) == target {
			return attr.Value
		}
	}
	return ""
}

func getFileType(filePath string) string {
	if filePath == "" {
		return "other"
	}
	
	// Normalize path separators to forward slashes for easier checking
	normalizedPath := "/" + strings.ToLower(strings.ReplaceAll(filePath, "\\", "/"))
	filename := filepath.Base(filePath)
	
	parts := strings.Split(filename, ".")
	ext := ""
	if len(parts) > 1 {
		ext = strings.ToLower(parts[len(parts)-1])
	}

	images := map[string]bool{"jpg": true, "jpeg": true, "png": true, "gif": true, "bmp": true, "webp": true, "tiff": true, "heic": true}
	videos := map[string]bool{"mp4": true, "mov": true, "avi": true, "mkv": true, "3gp": true, "wmv": true, "flv": true}
	audios := map[string]bool{"mp3": true, "wav": true, "m4a": true, "aac": true, "ogg": true, "amr": true}
	docs := map[string]bool{"pdf": true, "doc": true, "docx": true, "xls": true, "xlsx": true, "ppt": true, "pptx": true, "txt": true, "csv": true, "html": true, "rtf": true}
	dbs := map[string]bool{"db": true, "sqlite": true, "sqlite3": true, "sql": true}

	if ext != "" {
		if images[ext] {
			return "image"
		}
		if videos[ext] {
			return "video"
		}
		if audios[ext] {
			return "audio"
		}
		if docs[ext] {
			return "document"
		}
		if dbs[ext] {
			return "database"
		}
	}

	// Fallback heuristic: check path segments for standard media folder names
	segments := strings.Split(normalizedPath, "/")
	for _, part := range segments {
		if part == "image" || part == "images" || part == "picture" || part == "pictures" || part == "photo" || part == "photos" || part == "img" || part == "dcim" {
			return "image"
		}
		if part == "video" || part == "videos" || part == "movie" || part == "movies" || part == "mp4" {
			return "video"
		}
		if part == "audio" || part == "voice" || part == "music" || part == "recordings" {
			return "audio"
		}
		if part == "document" || part == "documents" || part == "text" || part == "txt" || part == "pdf" {
			return "document"
		}
		if part == "database" || part == "databases" || part == "db" || part == "sqlite" || part == "dbdata" {
			return "database"
		}
	}

	return "other"
}

func processRootModel(tx *sql.Tx, pm *ParsedModel) {
	if pm == nil || pm.Type == "" {
		return
	}

	modelType := strings.ToLower(pm.Type)
	id := pm.ID
	if id == "" {
		id = fmt.Sprintf("gen_%d", time.Now().UnixNano())
	}

	switch modelType {
	case "device", "extraction", "report":
		for k, v := range pm.Fields {
			_ = saveExtractionInfoTx(tx, k, v)
		}

	case "contact", "party":
		name := getField(pm, "Name")
		if name == "" {
			name = getField(pm, "Display_Name")
		}
		identifier := getField(pm, "Identifier")
		if identifier == "" {
			identifier = getField(pm, "Value")
		}
		cType := getField(pm, "Type")
		if cType == "" {
			cType = "Contact"
		}

		_ = saveContactTx(tx, Contact{
			ID:         id,
			Name:       name,
			Identifier: identifier,
			Type:       cType,
			PhotoPath:  getField(pm, "Photo"),
		})
		updateStatus(func(s *ParseStatus) { s.Counts.Contacts++ })

	case "instantmessage", "message", "sms", "mms":
		body := getField(pm, "Body")
		if body == "" {
			body = getField(pm, "Text")
		}
		if body == "" {
			body = getField(pm, "MessageText")
		}
		timestamp := getField(pm, "TimeStamp")
		if timestamp == "" {
			timestamp = getField(pm, "Time")
		}
		direction := getField(pm, "Direction")
		if direction == "" {
			direction = "Incoming"
		}
		status := getField(pm, "Status")
		source := getField(pm, "Source")
		if source == "" {
			source = "SMS"
		}

		// Parse Sender (From)
		senderID := ""
		senderName := ""
		fromModel, hasFrom := pm.ModelFields["From"]
		if !hasFrom {
			fromModel, hasFrom = pm.ModelFields["Sender"]
		}
		if hasFrom {
			senderID = fromModel.ID
			senderName = getField(fromModel, "Name")
			if senderName == "" {
				senderName = getField(fromModel, "Display_Name")
			}
			if senderName == "" {
				senderName = getField(fromModel, "Identifier")
			}

			_ = saveContactTx(tx, Contact{
				ID:         senderID,
				Name:       senderName,
				Identifier: getField(fromModel, "Identifier"),
				Type:       source,
			})
		} else {
			senderName = getField(pm, "SenderName")
			if senderName == "" {
				senderName = getField(pm, "From")
			}
		}

		// Parse Recipients (To)
		var recipients []map[string]string
		toModels := pm.MultiModelFields["To"]
		if len(toModels) == 0 {
			toModels = pm.MultiModelFields["Recipients"]
		}
		for _, rModel := range toModels {
			rName := getField(rModel, "Name")
			if rName == "" {
				rName = getField(rModel, "Display_Name")
			}
			if rName == "" {
				rName = getField(rModel, "Identifier")
			}
			rID := rModel.ID
			if rID == "" {
				rID = rName
			}
			recipients = append(recipients, map[string]string{
				"id":         rID,
				"name":       rName,
				"identifier": getField(rModel, "Identifier"),
			})
			_ = saveContactTx(tx, Contact{
				ID:         rID,
				Name:       rName,
				Identifier: getField(rModel, "Identifier"),
				Type:       source,
			})
		}

		// Chat linking
		chatID := getField(pm, "ChatID")
		if chatID == "" {
			chatID = getField(pm, "ConversationID")
		}
		chatName := getField(pm, "ChatName")
		if chatName == "" {
			chatName = getField(pm, "GroupName")
		}

		if chatID == "" {
			if chatName != "" {
				chatID = "chat_" + strings.ReplaceAll(strings.ToLower(chatName), " ", "_")
			} else {
				if strings.ToLower(direction) == "incoming" {
					chatID = senderID
					if chatID == "" {
						chatID = senderName
					}
					chatName = senderName
				} else if len(recipients) > 0 {
					chatID = recipients[0]["id"]
					chatName = recipients[0]["name"]
				} else {
					chatID = "unknown_chat"
					chatName = "Unknown Chat"
				}
			}
		}
		if chatName == "" {
			chatName = chatID
		}

		var partNames []string
		for _, r := range recipients {
			partNames = append(partNames, r["name"])
		}
		if senderName != "" {
			partNames = append(partNames, senderName)
		}

		_ = saveChatTx(tx, Chat{
			ID:           chatID,
			Name:         chatName,
			Source:       source,
			Participants: partNames,
		})

		recipientsJSON, _ := json.Marshal(recipients)
		_ = saveMessageTx(tx, Message{
			ID:         id,
			ChatID:     chatID,
			Timestamp:  timestamp,
			Body:       body,
			Direction:  direction,
			SenderID:   senderID,
			SenderName: senderName,
			Recipients: string(recipientsJSON),
			Status:     status,
			Source:     source,
		})

		// Attachments
		attachments := pm.MultiModelFields["Attachment"]
		if len(attachments) == 0 {
			attachments = pm.MultiModelFields["Attachments"]
		}
		for _, att := range attachments {
			fileModel, hasFile := att.ModelFields["File"]
			if !hasFile {
				fileModel = att
			}
			fileID := fileModel.ID
			filename := getField(att, "Filename")
			if filename == "" {
				filename = getField(fileModel, "Name")
			}
			path := getField(fileModel, "Path")
			size, _ := strconv.ParseInt(getField(fileModel, "Size"), 10, 64)
			attID := att.ID
			if attID == "" {
				attID = id + "_att_" + filename
			}

			_ = saveAttachmentTx(tx, Attachment{
				ID:        attID,
				MessageID: id,
				FileID:    fileID,
				Type:      getFileType(filename),
				Filename:  filename,
				Path:      path,
				Size:      size,
			})

			if fileID != "" && path != "" {
				var widthPtr, heightPtr *int
				w, _ := strconv.Atoi(getField(fileModel, "Width"))
				h, _ := strconv.Atoi(getField(fileModel, "Height"))
				if w > 0 {
					widthPtr = &w
				}
				if h > 0 {
					heightPtr = &h
				}

				var latPtr, lonPtr *float64
				lat, _ := strconv.ParseFloat(getField(fileModel, "Latitude"), 64)
				lon, _ := strconv.ParseFloat(getField(fileModel, "Longitude"), 64)
				if lat != 0.0 {
					latPtr = &lat
				}
				if lon != 0.0 {
					lonPtr = &lon
				}

				_ = saveFileTx(tx, File{
					ID:          fileID,
					Path:        path,
					Filename:    filename,
					Size:        size,
					Type:        getFileType(filename),
					MD5:         getField(fileModel, "MD5"),
					CreatedTime: timestamp,
					Width:       widthPtr,
					Height:      heightPtr,
					Latitude:    latPtr,
					Longitude:   lonPtr,
				})
			}
		}
		updateStatus(func(s *ParseStatus) { s.Counts.Messages++ })

	case "call", "call_log":
		timestamp := getField(pm, "TimeStamp")
		if timestamp == "" {
			timestamp = getField(pm, "Time")
		}
		duration := getField(pm, "Duration")
		direction := getField(pm, "Direction")
		source := getField(pm, "Source")
		if source == "" {
			source = "Phone"
		}

		partyModel, hasParty := pm.ModelFields["Party"]
		if !hasParty {
			partyModel = pm.ModelFields["Contact"]
		}
		partyName := ""
		partyIdentifier := ""
		if partyModel != nil {
			partyName = getField(partyModel, "Name")
			if partyName == "" {
				partyName = getField(partyModel, "Display_Name")
			}
			partyIdentifier = getField(partyModel, "Identifier")
			if partyIdentifier == "" {
				partyIdentifier = getField(partyModel, "Value")
			}
		} else {
			partyName = getField(pm, "PartyName")
			if partyName == "" {
				partyName = getField(pm, "Name")
			}
			partyIdentifier = getField(pm, "PartyIdentifier")
			if partyIdentifier == "" {
				partyIdentifier = getField(pm, "PhoneNumber")
			}
		}

		_ = saveCallTx(tx, Call{
			ID:              id,
			Timestamp:       timestamp,
			Duration:        duration,
			Direction:       direction,
			PartyName:       partyName,
			PartyIdentifier: partyIdentifier,
			Source:          source,
		})
		updateStatus(func(s *ParseStatus) { s.Counts.Calls++ })

	case "file", "taggedfile":
		path := getField(pm, "Path")
		if path == "" {
			path = getField(pm, "RelativePath")
		}
		filename := getField(pm, "Name")
		if filename == "" {
			filename = getField(pm, "Filename")
		}
		if filename == "" {
			parts := strings.Split(path, "/")
			filename = parts[len(parts)-1]
		}
		size, _ := strconv.ParseInt(getField(pm, "Size"), 10, 64)
		created := getField(pm, "CreationTime")
		if created == "" {
			created = getField(pm, "Created")
		}
		w, _ := strconv.Atoi(getField(pm, "Width"))
		h, _ := strconv.Atoi(getField(pm, "Height"))
		var widthPtr, heightPtr *int
		if w > 0 {
			widthPtr = &w
		}
		if h > 0 {
			heightPtr = &h
		}

		var latPtr, lonPtr *float64
		lat, _ := strconv.ParseFloat(getField(pm, "Latitude"), 64)
		lon, _ := strconv.ParseFloat(getField(pm, "Longitude"), 64)
		if lat != 0.0 {
			latPtr = &lat
		}
		if lon != 0.0 {
			lonPtr = &lon
		}

		_ = saveFileTx(tx, File{
			ID:          id,
			Path:        path,
			Filename:    filename,
			Size:        size,
			Type:        getFileType(filename),
			MD5:         getField(pm, "MD5"),
			CreatedTime: created,
			Width:       widthPtr,
			Height:      heightPtr,
			Latitude:    latPtr,
			Longitude:   lonPtr,
		})

		if latPtr != nil && lonPtr != nil {
			_ = saveLocationTx(tx, Location{
				ID:        "loc_file_" + id,
				Timestamp: created,
				Latitude:  lat,
				Longitude: lon,
				Address:   "Exif Metadata from " + filename,
				Source:    "Exif Metadata",
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Locations++ })
		}
		updateStatus(func(s *ParseStatus) { s.Counts.Files++ })

	case "location", "gps", "coordinate":
		timestamp := getField(pm, "TimeStamp")
		if timestamp == "" {
			timestamp = getField(pm, "Time")
		}
		lat, _ := strconv.ParseFloat(getField(pm, "Latitude"), 64)
		lon, _ := strconv.ParseFloat(getField(pm, "Longitude"), 64)
		address := getField(pm, "Address")
		if address == "" {
			address = getField(pm, "Name")
		}
		source := getField(pm, "Source")
		if source == "" {
			source = "GPS"
		}
		var accPtr *float64
		acc, _ := strconv.ParseFloat(getField(pm, "Accuracy"), 64)
		if acc > 0 {
			accPtr = &acc
		}

		if lat != 0.0 && lon != 0.0 {
			_ = saveLocationTx(tx, Location{
				ID:        id,
				Timestamp: timestamp,
				Latitude:  lat,
				Longitude: lon,
				Address:   address,
				Source:    source,
				Accuracy:  accPtr,
			})
			updateStatus(func(s *ParseStatus) { s.Counts.Locations++ })
		}
	}
}

// Ingests report.xml inside large ZIP
// Ingests report.xml inside large ZIP or on filesystem
func parseUfdr(ufdrPath, dbPath string) error {
	updateStatus(func(s *ParseStatus) {
		s.Active = true
		s.Progress = 0
		s.BytesRead = 0
		s.CurrentItem = "Initializing SQLite Database..."
		s.Error = ""
		s.Counts = ParseCounts{}
	})

	if err := initDb(dbPath); err != nil {
		updateStatus(func(s *ParseStatus) {
			s.Active = false
			s.Error = "Db Init Failed: " + err.Error()
		})
		return err
	}

	fi, err := os.Stat(ufdrPath)
	if err != nil {
		updateStatus(func(s *ParseStatus) {
			s.Active = false
			s.Error = "Path Stat Failed: " + err.Error()
		})
		return err
	}

	if fi.IsDir() {
		return parseUfdrDir(ufdrPath, dbPath)
	}

	updateStatus(func(s *ParseStatus) { s.CurrentItem = "Opening UFDR ZIP archive..." })
	r, err := zip.OpenReader(ufdrPath)
	if err != nil {
		updateStatus(func(s *ParseStatus) {
			s.Active = false
			s.Error = "Zip Open Failed: " + err.Error()
		})
		return err
	}
	defer r.Close()

	var xmlFile *zip.File
	for _, f := range r.File {
		if strings.ToLower(f.Name) == "report.xml" {
			xmlFile = f
			break
		}
	}

	if xmlFile == nil {
		// Fallback: Check for DbData/database SQLite file
		var sqliteDbFile *zip.File
		for _, f := range r.File {
			lowerName := strings.ToLower(f.Name)
			if lowerName == "dbdata/database" || lowerName == "dbdata\\database" || lowerName == "dbdata/database.db" || lowerName == "dbdata\\database.db" || lowerName == "database" || lowerName == "database.db" || lowerName == "database.sqlite" {
				sqliteDbFile = f
				break
			}
		}

		if sqliteDbFile != nil {
			updateStatus(func(s *ParseStatus) { s.CurrentItem = "Extracting Cellebrite SQLite Database..." })
			// Extract it
			tempPath := filepath.Join(os.TempDir(), fmt.Sprintf("cellsight_extraction_%d.sqlite", time.Now().UnixNano()))
			out, err := os.Create(tempPath)
			if err != nil {
				return err
			}
			defer os.Remove(tempPath)
			
			rc, err := sqliteDbFile.Open()
			if err != nil {
				out.Close()
				return err
			}
			_, _ = io.Copy(out, rc)
			rc.Close()
			out.Close()

			// Parse the SQLite DB first
			errSqlite := parseSqliteDb(tempPath, dbPath, ufdrPath)
			
			// Then we MUST also run the raw zip extraction so the files/media gallery are populated!
			// We recreate the zip reader because parseSqliteDb has run its course.
			r2, err2 := zip.OpenReader(ufdrPath)
			if err2 == nil {
				defer r2.Close()
				errRaw := parseRawZip(r2, ufdrPath, dbPath)
				if errSqlite != nil {
					updateStatus(func(s *ParseStatus) {
						s.Error = "SQLite parsing failed, trying Postgres: " + errSqlite.Error()
					})
					
					// Try postgres dump parser
					errPg := parsePostgresDump(tempPath, dbPath, ufdrPath)
					if errPg != nil {
						updateStatus(func(s *ParseStatus) {
							s.Error = "Postgres parsing also failed: " + errPg.Error()
						})
					}
				}
				return errRaw
			}

			if errSqlite != nil {
				return errSqlite
			}
			return err2
		}

		// Fallback: Parse as a Raw ZIP Archive (Triage mode)
		return parseRawZip(r, ufdrPath, dbPath)
	}

	rc, err := xmlFile.Open()
	if err != nil {
		updateStatus(func(s *ParseStatus) {
			s.Active = false
			s.Error = "File Read Failed: " + err.Error()
		})
		return err
	}
	defer rc.Close()

	errXml := parseUfdrStream(rc, int64(xmlFile.UncompressedSize64), ufdrPath)
	if errXml != nil {
		return errXml
	}

	// Now run the raw zip extraction so the files/media gallery is populated!
	r2, err2 := zip.OpenReader(ufdrPath)
	if err2 == nil {
		defer r2.Close()
		return parseRawZip(r2, ufdrPath, dbPath)
	}

	return err2
}

func parseUfdrStream(rc io.Reader, totalBytes int64, ufdrPath string) error {
	updateStatus(func(s *ParseStatus) {
		s.TotalBytes = totalBytes
		s.CurrentItem = "Piping streaming XML token parser..."
	})

	progressReader := &ProgressTrackingReader{
		Reader: rc,
		OnProgress: func(read int64) {
			updateStatus(func(s *ParseStatus) {
				s.BytesRead += read
				if s.TotalBytes > 0 {
					s.Progress = int(math.Min(99.0, float64(s.BytesRead)*100.0/float64(s.TotalBytes)))
				}
			})
		},
	}

	decoder := xml.NewDecoder(progressReader)
	var modelStack []*ParsedModel
	var currentField string
	var currentModelField string
	var currentMultiModelField string

	// Ingest transactions
	var tx *sql.Tx
	var err error
	tx, err = db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	insertCount := 0

	for {
		t, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			updateStatus(func(s *ParseStatus) {
				s.Active = false
				s.Error = "XML Parse Error: " + err.Error()
			})
			return err
		}

		switch se := t.(type) {
		case xml.StartElement:
			name := strings.ToLower(se.Name.Local)
			if name == "model" {
				m := &ParsedModel{
					Type:             getAttr(se.Attr, "type"),
					ID:               getAttr(se.Attr, "id"),
					Fields:           make(map[string]string),
					ModelFields:      make(map[string]*ParsedModel),
					MultiModelFields: make(map[string][]*ParsedModel),
				}
				modelStack = append(modelStack, m)
			} else if name == "field" {
				currentField = getAttr(se.Attr, "name")
			} else if name == "modelfield" {
				currentModelField = getAttr(se.Attr, "name")
			} else if name == "multimodelfield" {
				currentMultiModelField = getAttr(se.Attr, "name")
			}

		case xml.CharData:
			if currentField != "" && len(modelStack) > 0 {
				top := modelStack[len(modelStack)-1]
				top.Fields[currentField] += string(se)
			}

		case xml.EndElement:
			name := strings.ToLower(se.Name.Local)
			if name == "model" {
				if len(modelStack) > 0 {
					finished := modelStack[len(modelStack)-1]
					modelStack = modelStack[:len(modelStack)-1] // pop

					if len(modelStack) > 0 {
						parent := modelStack[len(modelStack)-1]
						if currentModelField != "" {
							parent.ModelFields[currentModelField] = finished
						} else if currentMultiModelField != "" {
							parent.MultiModelFields[currentMultiModelField] = append(parent.MultiModelFields[currentMultiModelField], finished)
						}
					} else {
						// Root model parsed
						processRootModel(tx, finished)
						insertCount++

						// Commit chunk transaction to optimize memory
						if insertCount%1000 == 0 {
							if commitErr := tx.Commit(); commitErr != nil {
								log.Printf("Warning: chunk commit failed at %d: %v", insertCount, commitErr)
							}
							tx, err = db.Begin()
							if err != nil {
								return fmt.Errorf("failed to begin new transaction after chunk commit: %v", err)
							}
						}
					}
				}
			} else if name == "field" {
				currentField = ""
			} else if name == "modelfield" {
				currentModelField = ""
			} else if name == "multimodelfield" {
				currentMultiModelField = ""
			}
		}
	}

	// Commit final transaction
	if err := tx.Commit(); err != nil {
		return err
	}

	// Save extraction location info
	_ = runInTransaction(func(t *sql.Tx) error {
		_ = saveExtractionInfoTx(t, "UFDR Path", ufdrPath)
		_ = saveExtractionInfoTx(t, "Database Recreated At", time.Now().Format(time.RFC3339))
		return nil
	})

	updateStatus(func(s *ParseStatus) {
		s.Active = false
		s.Progress = 100
		s.CurrentItem = "UFDR parsed successfully in Go!"
	})
	return nil
}

func parseUfdrDir(dirPath, dbPath string) error {
	var xmlPath string
	files, err := os.ReadDir(dirPath)
	if err == nil {
		for _, f := range files {
			if strings.ToLower(f.Name()) == "report.xml" {
				xmlPath = filepath.Join(dirPath, f.Name())
				break
			}
		}
	}

	if xmlPath != "" {
		// Found report.xml, parse unzipped UFDR
		fi, err := os.Stat(xmlPath)
		if err != nil {
			return err
		}
		
		rc, err := os.Open(xmlPath)
		if err != nil {
			return err
		}
		defer rc.Close()

		return parseUfdrStream(rc, fi.Size(), dirPath)
	}

	// Check for DbData/database or root databases
	dbCandidates := []string{
		filepath.Join(dirPath, "DbData", "database"),
		filepath.Join(dirPath, "DbData", "database.db"),
		filepath.Join(dirPath, "dbdata", "database"),
		filepath.Join(dirPath, "dbdata", "database.db"),
		filepath.Join(dirPath, "database"),
		filepath.Join(dirPath, "database.db"),
		filepath.Join(dirPath, "database.sqlite"),
	}

	for _, candPath := range dbCandidates {
		if _, err := os.Stat(candPath); err == nil {
			errSql := parseSqliteDb(candPath, dbPath, dirPath)
			if errSql != nil {
				updateStatus(func(s *ParseStatus) {
					s.Error = "SQLite parsing failed, trying Postgres: " + errSql.Error()
				})
				
				// Try postgres dump parser
				errPg := parsePostgresDump(candPath, dbPath, dirPath)
				if errPg != nil {
					updateStatus(func(s *ParseStatus) {
						s.Error = "Postgres parsing also failed: " + errPg.Error()
					})
				}
			}
			return parseRawDirectory(dirPath, dbPath)
		}
	}

	// Raw Filesystem Triage!
	return parseRawDirectory(dirPath, dbPath)
}

func parseRawDirectory(dirPath, dbPath string) error {
	updateStatus(func(s *ParseStatus) {
		s.CurrentItem = "Scanning Raw Directory Structure..."
	})

	// Start database transaction
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Recursively walk the directory
	var fileList []string
	err = filepath.WalkDir(dirPath, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			log.Printf("Skipping unreadable path %s: %v", path, err)
			return nil // Skip and continue
		}
		if !d.IsDir() {
			fileList = append(fileList, path)
		}
		return nil
	})
	if err != nil {
		updateStatus(func(s *ParseStatus) {
			s.Active = false
			s.Error = "Directory walk failed: " + err.Error()
		})
		return err
	}

	totalFiles := int64(len(fileList))
	updateStatus(func(s *ParseStatus) {
		s.TotalBytes = totalFiles
		s.CurrentItem = "Indexing files into database..."
	})

	for i, absPath := range fileList {
		relPath, err := filepath.Rel(dirPath, absPath)
		if err != nil {
			relPath = absPath
		}

		info, err := os.Stat(absPath)
		var size int64
		var createdTime string
		if err == nil {
			size = info.Size()
			createdTime = info.ModTime().Format(time.RFC3339)
		}

		// Normalize separators to forward slash for frontend consistency
		normalizedRelPath := strings.ReplaceAll(relPath, "\\", "/")
		filename := filepath.Base(absPath)
		fileType := getFileType(normalizedRelPath)

		// Create a file record
		f := File{
			ID:          fmt.Sprintf("raw_file_%d", i),
			Path:        normalizedRelPath,
			Filename:    filename,
			Size:        size,
			Type:        fileType,
			CreatedTime: createdTime,
		}

		_ = saveFileTx(tx, f)

		updateStatus(func(s *ParseStatus) {
			s.BytesRead = int64(i + 1)
			s.Counts.Files++
			if s.TotalBytes > 0 {
				s.Progress = int(math.Min(99.0, float64(s.BytesRead)*100.0/float64(s.TotalBytes)))
			}
		})

		// Commit chunks
		if (i+1)%1000 == 0 {
			if commitErr := tx.Commit(); commitErr != nil {
				log.Printf("Warning: chunk commit failed at file %d: %v", i, commitErr)
			}
			tx, err = db.Begin()
			if err != nil {
				return fmt.Errorf("failed to begin new transaction: %v", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Insert mock extraction info
	_ = runInTransaction(func(t *sql.Tx) error {
		_ = saveExtractionInfoTx(t, "Model", "Raw Filesystem Dump")
		_ = saveExtractionInfoTx(t, "OS", "N/A")
		_ = saveExtractionInfoTx(t, "Case Name", filepath.Base(dirPath))
		_ = saveExtractionInfoTx(t, "UFDR Path", dirPath)
		_ = saveExtractionInfoTx(t, "Database Recreated At", time.Now().Format(time.RFC3339))
		return nil
	})

	updateStatus(func(s *ParseStatus) {
		s.Active = false
		s.Progress = 100
		s.CurrentItem = "Raw directory indexed successfully!"
	})

	return nil
}

type ProgressTrackingReader struct {
	Reader     io.Reader
	OnProgress func(int64)
}

func (pr *ProgressTrackingReader) Read(p []byte) (int, error) {
	n, err := pr.Reader.Read(p)
	if n > 0 {
		pr.OnProgress(int64(n))
	}
	return n, err
}

// Unified file provider function supporting both directories and zip files
func streamFile(archivePath, relativeFilePath string, w io.Writer) error {
	fi, err := os.Stat(archivePath)
	if err != nil {
		return err
	}

	if fi.IsDir() {
		filePath := filepath.Join(archivePath, filepath.FromSlash(relativeFilePath))
		f, err := os.Open(filePath)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = io.Copy(w, f)
		return err
	}

	return streamFileFromZip(archivePath, relativeFilePath, w)
}

// Utility to stream file out of ZIP
func streamFileFromZip(zipPath, fileInZipPath string, w io.Writer) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	normalizedTarget := strings.ReplaceAll(strings.ToLower(fileInZipPath), "\\", "/")

	for _, f := range r.File {
		normalizedEntry := strings.ReplaceAll(strings.ToLower(f.Name), "\\", "/")
		if normalizedEntry == normalizedTarget {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			defer rc.Close()
			_, err = io.Copy(w, rc)
			return err
		}
	}
	return fmt.Errorf("file %q not found in ZIP", fileInZipPath)
}

// Unified file reader that supports zip files and unzipped folder structures
func getFileReader(archivePath, relativeFilePath string) (io.ReadCloser, int64, error) {
	fi, err := os.Stat(archivePath)
	if err != nil {
		return nil, 0, err
	}

	if fi.IsDir() {
		filePath := filepath.Join(archivePath, filepath.FromSlash(relativeFilePath))
		f, err := os.Open(filePath)
		if err != nil {
			return nil, 0, err
		}
		stat, err := f.Stat()
		if err != nil {
			f.Close()
			return nil, 0, err
		}
		return f, stat.Size(), nil
	}

	// ZIP
	r, err := zip.OpenReader(archivePath)
	if err != nil {
		return nil, 0, err
	}

	normalizedTarget := strings.ReplaceAll(strings.ToLower(relativeFilePath), "\\", "/")
	for _, f := range r.File {
		normalizedEntry := strings.ReplaceAll(strings.ToLower(f.Name), "\\", "/")
		if normalizedEntry == normalizedTarget {
			rc, err := f.Open()
			if err != nil {
				r.Close()
				return nil, 0, err
			}
			return &zipReadCloser{rc: rc, zr: r}, int64(f.UncompressedSize64), nil
		}
	}
	r.Close()
	return nil, 0, fmt.Errorf("file not found: %s", relativeFilePath)
}

type zipReadCloser struct {
	rc io.ReadCloser
	zr *zip.ReadCloser
}

func (z *zipReadCloser) Read(p []byte) (int, error) {
	return z.rc.Read(p)
}

func (z *zipReadCloser) Close() error {
	err1 := z.rc.Close()
	err2 := z.zr.Close()
	if err1 != nil {
		return err1
	}
	return err2
}

func parseRawZip(r *zip.ReadCloser, zipPath, dbPath string) error {
	updateStatus(func(s *ParseStatus) {
		s.CurrentItem = "Scanning Raw ZIP Archive Structure..."
	})

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	totalFiles := int64(len(r.File))
	updateStatus(func(s *ParseStatus) {
		s.TotalBytes = totalFiles
		s.CurrentItem = "Indexing files from ZIP..."
	})

	for i, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}

		filename := filepath.Base(f.Name)
		fileType := getFileType(f.Name)
		createdTime := f.Modified.Format(time.RFC3339)

		// Create a file record
		fileRec := File{
			ID:          fmt.Sprintf("raw_zip_file_%d", i),
			Path:        f.Name,
			Filename:    filename,
			Size:        int64(f.UncompressedSize64),
			Type:        fileType,
			CreatedTime: createdTime,
		}

		_ = saveFileTx(tx, fileRec)

		updateStatus(func(s *ParseStatus) {
			s.BytesRead = int64(i + 1)
			s.Counts.Files++
			if s.TotalBytes > 0 {
				s.Progress = int(math.Min(99.0, float64(s.BytesRead)*100.0/float64(s.TotalBytes)))
			}
		})

		// Commit chunks
		if (i+1)%1000 == 0 {
			if commitErr := tx.Commit(); commitErr != nil {
				log.Printf("Warning: chunk commit failed at zip file %d: %v", i, commitErr)
			}
			tx, err = db.Begin()
			if err != nil {
				return fmt.Errorf("failed to begin new transaction: %v", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	// Insert mock extraction info
	_ = runInTransaction(func(t *sql.Tx) error {
		_ = saveExtractionInfoTx(t, "Model", "Raw ZIP Dump")
		_ = saveExtractionInfoTx(t, "OS", "N/A")
		_ = saveExtractionInfoTx(t, "Case Name", filepath.Base(zipPath))
		_ = saveExtractionInfoTx(t, "UFDR Path", zipPath)
		_ = saveExtractionInfoTx(t, "Database Recreated At", time.Now().Format(time.RFC3339))
		return nil
	})

	updateStatus(func(s *ParseStatus) {
		s.Active = false
		s.Progress = 100
		s.CurrentItem = "Raw ZIP indexed successfully!"
	})

	return nil
}
