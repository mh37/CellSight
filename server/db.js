const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

let db = null;

function initDb(dbPath) {
  // Ensure the directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new DatabaseSync(dbPath);

  // Enable foreign keys
  db.exec('PRAGMA foreign_keys = ON;');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS extraction_info (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT,
      identifier TEXT,
      type TEXT,
      photo_path TEXT
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      name TEXT,
      source TEXT,
      participants TEXT -- JSON array of contact IDs/identifiers
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      timestamp TEXT,
      body TEXT,
      direction TEXT,
      sender_id TEXT,
      sender_name TEXT,
      recipients TEXT, -- JSON array
      status TEXT,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      file_id TEXT,
      type TEXT,
      filename TEXT,
      path TEXT,
      size INTEGER
    );

    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      duration TEXT,
      direction TEXT,
      party_name TEXT,
      party_identifier TEXT,
      source TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT,
      filename TEXT,
      size INTEGER,
      type TEXT, -- image, video, audio, document, database, other
      md5 TEXT,
      created_time TEXT,
      width INTEGER,
      height INTEGER,
      gps_latitude REAL,
      gps_longitude REAL
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      latitude REAL,
      longitude REAL,
      address TEXT,
      source TEXT,
      accuracy REAL
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_type TEXT, -- message, call, file, location
      artifact_id TEXT,
      notes TEXT,
      tagged_at TEXT,
      UNIQUE(artifact_type, artifact_id)
    );
  `);

  // Create indexes for performance
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_calls_timestamp ON calls(timestamp);
    CREATE INDEX IF NOT EXISTS idx_files_type ON files(type);
    CREATE INDEX IF NOT EXISTS idx_locations_timestamp ON locations(timestamp);
  `);
}

// Transaction helper
function transaction(callback) {
  if (!db) throw new Error('Database is not initialized');
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = callback();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function exec(sql) {
  if (!db) throw new Error('Database is not initialized');
  return db.exec(sql);
}

// Writers
function saveExtractionInfo(key, value) {
  const stmt = db.prepare('INSERT OR REPLACE INTO extraction_info (key, value) VALUES (?, ?)');
  stmt.run(key, value);
}

function saveContact(c) {
  const stmt = db.prepare('INSERT OR REPLACE INTO contacts (id, name, identifier, type, photo_path) VALUES (?, ?, ?, ?, ?)');
  stmt.run(c.id, c.name || '', c.identifier || '', c.type || '', c.photo_path || '');
}

function saveChat(c) {
  const stmt = db.prepare('INSERT OR REPLACE INTO chats (id, name, source, participants) VALUES (?, ?, ?, ?)');
  stmt.run(c.id, c.name || '', c.source || '', JSON.stringify(c.participants || []));
}

function saveMessage(m) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO messages 
    (id, chat_id, timestamp, body, direction, sender_id, sender_name, recipients, status, source) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    m.id,
    m.chat_id || '',
    m.timestamp || '',
    m.body || '',
    m.direction || '',
    m.sender_id || '',
    m.sender_name || '',
    JSON.stringify(m.recipients || []),
    m.status || '',
    m.source || ''
  );
}

function saveAttachment(a) {
  const stmt = db.prepare('INSERT OR REPLACE INTO attachments (id, message_id, file_id, type, filename, path, size) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(a.id, a.message_id || '', a.file_id || '', a.type || '', a.filename || '', a.path || '', a.size || 0);
}

function saveCall(c) {
  const stmt = db.prepare('INSERT OR REPLACE INTO calls (id, timestamp, duration, direction, party_name, party_identifier, source) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(c.id, c.timestamp || '', c.duration || '', c.direction || '', c.party_name || '', c.party_identifier || '', c.source || '');
}

function saveFile(f) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO files 
    (id, path, filename, size, type, md5, created_time, width, height, gps_latitude, gps_longitude) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    f.id,
    f.path || '',
    f.filename || '',
    f.size || 0,
    f.type || 'other',
    f.md5 || '',
    f.created_time || '',
    f.width || null,
    f.height || null,
    f.gps_latitude || null,
    f.gps_longitude || null
  );
}

function saveLocation(l) {
  const stmt = db.prepare('INSERT OR REPLACE INTO locations (id, timestamp, latitude, longitude, address, source, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?)');
  stmt.run(l.id, l.timestamp || '', l.latitude || null, l.longitude || null, l.address || '', l.source || '', l.accuracy || null);
}

// Queries
function getExtractionInfo() {
  if (!db) return {};
  const stmt = db.prepare('SELECT * FROM extraction_info');
  const rows = stmt.all();
  const info = {};
  for (const r of rows) {
    info[r.key] = r.value;
  }
  return info;
}

function getStats() {
  if (!db) return {};
  const stats = {};
  stats.contacts = db.prepare('SELECT COUNT(*) as count FROM contacts').get().count;
  stats.chats = db.prepare('SELECT COUNT(*) as count FROM chats').get().count;
  stats.messages = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
  stats.calls = db.prepare('SELECT COUNT(*) as count FROM calls').get().count;
  stats.files = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
  stats.images = db.prepare("SELECT COUNT(*) as count FROM files WHERE type = 'image'").get().count;
  stats.videos = db.prepare("SELECT COUNT(*) as count FROM files WHERE type = 'video'").get().count;
  stats.locations = db.prepare('SELECT COUNT(*) as count FROM locations').get().count;
  stats.evidence = db.prepare('SELECT COUNT(*) as count FROM evidence').get().count;
  return stats;
}

function getChats() {
  if (!db) return [];
  // Get all chats, count messages, and get the last message for each chat
  const stmt = db.prepare(`
    SELECT c.*, 
           (SELECT COUNT(*) FROM messages m WHERE m.chat_id = c.id) as message_count,
           (SELECT m.body FROM messages m WHERE m.chat_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_message,
           (SELECT m.timestamp FROM messages m WHERE m.chat_id = c.id ORDER BY m.timestamp DESC LIMIT 1) as last_message_time
    FROM chats c
    ORDER BY last_message_time DESC
  `);
  return stmt.all();
}

function getChatMessages(chatId, limit = 100, offset = 0) {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT m.*, 
           (SELECT json_group_array(json_object(
             'id', a.id, 'file_id', a.file_id, 'type', a.type, 'filename', a.filename, 'path', a.path, 'size', a.size
           )) FROM attachments a WHERE a.message_id = m.id AND a.id IS NOT NULL) as attachments,
           EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'message' AND e.artifact_id = m.id) as is_evidence
    FROM messages m
    WHERE m.chat_id = ?
    ORDER BY m.timestamp ASC
    LIMIT ? OFFSET ?
  `);
  const rows = stmt.all(chatId, limit, offset);
  
  // Parse attachments JSON
  return rows.map(r => {
    try {
      r.attachments = JSON.parse(r.attachments);
      // Clean up empty JSON arrays
      if (r.attachments.length === 1 && r.attachments[0].id === null) {
        r.attachments = [];
      }
    } catch (e) {
      r.attachments = [];
    }
    r.is_evidence = !!r.is_evidence;
    return r;
  });
}

function getCalls(direction = null, search = '', limit = 100, offset = 0) {
  if (!db) return [];
  let query = `
    SELECT c.*, 
           EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'call' AND e.artifact_id = c.id) as is_evidence
    FROM calls c
  `;
  const params = [];
  const conditions = [];

  if (direction && direction !== 'all') {
    conditions.push('c.direction = ?');
    params.push(direction);
  }
  if (search) {
    conditions.push('(c.party_name LIKE ? OR c.party_identifier LIKE ? OR c.source LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY c.timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  return stmt.all(...params).map(r => {
    r.is_evidence = !!r.is_evidence;
    return r;
  });
}

function getContacts(search = '') {
  if (!db) return [];
  let query = 'SELECT * FROM contacts';
  const params = [];
  if (search) {
    query += ' WHERE name LIKE ? OR identifier LIKE ?';
    const s = `%${search}%`;
    params.push(s, s);
  }
  query += ' ORDER BY name ASC';
  const stmt = db.prepare(query);
  return stmt.all(...params);
}

function getFiles(type = 'all', search = '', limit = 100, offset = 0) {
  if (!db) return [];
  let query = `
    SELECT f.*, 
           EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'file' AND e.artifact_id = f.id) as is_evidence
    FROM files f
  `;
  const params = [];
  const conditions = [];

  if (type && type !== 'all') {
    conditions.push('f.type = ?');
    params.push(type);
  }
  if (search) {
    conditions.push('(f.filename LIKE ? OR f.path LIKE ?)');
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY f.filename ASC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  return stmt.all(...params).map(r => {
    r.is_evidence = !!r.is_evidence;
    return r;
  });
}

function getLocations() {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT l.*,
           EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'location' AND e.artifact_id = l.id) as is_evidence
    FROM locations l
    ORDER BY l.timestamp ASC
  `);
  return stmt.all().map(r => {
    r.is_evidence = !!r.is_evidence;
    return r;
  });
}

function getTimeline(typeFilter = 'all', search = '', limit = 100, offset = 0) {
  if (!db) return [];
  // Union messages, calls, locations, and files (with metadata) into a unified timeline
  let query = `
    SELECT * FROM (
      SELECT 'message' as event_type, id, timestamp, body as text, direction, sender_name as detail_1, source as detail_2, 
             EXISTS(SELECT 1 FROM evidence e WHERE e.artifact_type = 'message' AND e.artifact_id = id) as is_evidence
      FROM messages
      
      UNION ALL
      
      SELECT 'call' as event_type, id, timestamp, 'Call: ' || direction || ' (' || duration || 's)' as text, direction, party_name as detail_1, source as detail_2,
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
  `;

  const params = [];
  const conditions = [];

  if (typeFilter && typeFilter !== 'all') {
    conditions.push('event_type = ?');
    params.push(typeFilter);
  }

  if (search) {
    conditions.push('(text LIKE ? OR detail_1 LIKE ? OR detail_2 LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const stmt = db.prepare(query);
  return stmt.all(...params).map(r => {
    r.is_evidence = !!r.is_evidence;
    return r;
  });
}

// Evidence management
function addEvidence(artifactType, artifactId, notes = '') {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO evidence (artifact_type, artifact_id, notes, tagged_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  return stmt.run(artifactType, artifactId, notes);
}

function removeEvidence(artifactType, artifactId) {
  const stmt = db.prepare('DELETE FROM evidence WHERE artifact_type = ? AND artifact_id = ?');
  return stmt.run(artifactType, artifactId);
}

function getEvidence() {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT e.*, 
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
  `);
  return stmt.all();
}

module.exports = {
  initDb,
  transaction,
  exec,
  saveExtractionInfo,
  saveContact,
  saveChat,
  saveMessage,
  saveAttachment,
  saveCall,
  saveFile,
  saveLocation,
  
  getExtractionInfo,
  getStats,
  getChats,
  getChatMessages,
  getCalls,
  getContacts,
  getFiles,
  getLocations,
  getTimeline,
  
  addEvidence,
  removeEvidence,
  getEvidence
};
