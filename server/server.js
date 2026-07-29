const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const db = require('./db');
const parser = require('./parser');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

// In-memory state for the active UFDR path
let currentUfdrPath = '';
let openDatabases = {}; // Keep track of open temp SQLite databases: { fileInZipPath: { tempPath, dbInstance } }

// Helper to determine Content-Type
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.tiff': 'image/tiff',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// 1. Parsing APIs
app.post('/api/open-ufdr', async (req, res) => {
  const { ufdrPath, dbPath } = req.body;

  if (!ufdrPath) {
    return res.status(400).json({ error: 'ufdrPath is required' });
  }

  // Resolve absolute paths
  const absoluteUfdrPath = path.resolve(ufdrPath);

  const dataDir = path.resolve(__dirname, '../data');
  let defaultDbPath = path.join(dataDir, 'case_session.db');

  if (dbPath) {
    const resolvedDbPath = path.resolve(dataDir, dbPath);
    if (!resolvedDbPath.startsWith(dataDir + path.sep) && resolvedDbPath !== dataDir) {
      return res.status(400).json({ error: 'Invalid dbPath: Path traversal detected' });
    }
    defaultDbPath = resolvedDbPath;
  }

  if (!fs.existsSync(absoluteUfdrPath)) {
    return res.status(404).json({ error: `UFDR file not found at: ${absoluteUfdrPath}` });
  }

  // Close any open temp SQLite databases
  for (const key of Object.keys(openDatabases)) {
    try {
      openDatabases[key].dbInstance.close();
      if (fs.existsSync(openDatabases[key].tempPath)) {
        fs.unlinkSync(openDatabases[key].tempPath);
      }
    } catch (e) {
      console.error('Error closing temp db:', e);
    }
  }
  openDatabases = {};

  currentUfdrPath = absoluteUfdrPath;

  // Run the parser in the background
  parser.parseUfdr(absoluteUfdrPath, defaultDbPath)
    .then(() => {
      console.log('UFDR parsed successfully!');
    })
    .catch((err) => {
      console.error('UFDR parsing failed:', err);
    });

  return res.json({ 
    message: 'Parsing started in background', 
    dbPath: defaultDbPath,
    ufdrPath: absoluteUfdrPath
  });
});

app.get('/api/parse-status', (req, res) => {
  res.json(parser.getParseStatus());
});

// Middleware to check if database is loaded
function checkDb(req, res, next) {
  const info = db.getExtractionInfo();
  if (!info || Object.keys(info).length === 0) {
    // If we have currentUfdrPath, maybe it is still parsing
    const status = parser.getParseStatus();
    if (status.active) {
      return res.status(503).json({ error: 'Database is currently parsing', parsing: true, progress: status.progress });
    }
    return res.status(400).json({ error: 'No UFDR loaded. Please load a UFDR file first.' });
  }
  next();
}

// 2. Metadata & Stats
app.get('/api/extraction-info', checkDb, (req, res) => {
  res.json({
    info: db.getExtractionInfo(),
    ufdrPath: currentUfdrPath
  });
});

app.get('/api/stats', checkDb, (req, res) => {
  res.json(db.getStats());
});

// 3. Contacts
app.get('/api/contacts', checkDb, (req, res) => {
  const { search } = req.query;
  res.json(db.getContacts(search || ''));
});

// 4. Chats & Messages
app.get('/api/chats', checkDb, (req, res) => {
  res.json(db.getChats());
});

app.get('/api/chats/:id/messages', checkDb, (req, res) => {
  const chatId = req.params.id;
  const limit = parseInt(req.query.limit || '100', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json(db.getChatMessages(chatId, limit, offset));
});

// 5. Call Logs
app.get('/api/calls', checkDb, (req, res) => {
  const { direction, search } = req.query;
  const limit = parseInt(req.query.limit || '100', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json(db.getCalls(direction, search || '', limit, offset));
});

// 6. Files
app.get('/api/files', checkDb, (req, res) => {
  const { type, search } = req.query;
  const limit = parseInt(req.query.limit || '100', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json(db.getFiles(type, search || '', limit, offset));
});

// 7. Locations
app.get('/api/locations', checkDb, (req, res) => {
  res.json(db.getLocations());
});

// 8. Timeline
app.get('/api/timeline', checkDb, (req, res) => {
  const { type, search } = req.query;
  const limit = parseInt(req.query.limit || '100', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  res.json(db.getTimeline(type, search || '', limit, offset));
});

// 9. Evidence Tagging
app.get('/api/evidence', checkDb, (req, res) => {
  res.json(db.getEvidence());
});

app.post('/api/evidence', checkDb, (req, res) => {
  const { type, id, notes } = req.body;
  if (!type || !id) {
    return res.status(400).json({ error: 'type and id are required' });
  }
  db.addEvidence(type, id, notes || '');
  res.json({ success: true, message: 'Artifact tagged as evidence' });
});

app.delete('/api/evidence', checkDb, (req, res) => {
  const { type, id } = req.query;
  if (!type || !id) {
    return res.status(400).json({ error: 'type and id are required' });
  }
  db.removeEvidence(type, id);
  res.json({ success: true, message: 'Evidence tag removed' });
});

// 10. Media Streaming directly from ZIP
app.get('/api/media', (req, res) => {
  const fileInZipPath = req.query.path;
  if (!fileInZipPath) {
    return res.status(400).send('path parameter is required');
  }

  // Get active UFDR path
  let zipPath = currentUfdrPath;
  if (!zipPath) {
    const info = db.getExtractionInfo();
    zipPath = info['UFDR Path'];
  }

  if (!zipPath) {
    return res.status(400).send('No UFDR loaded');
  }

  const contentType = getContentType(fileInZipPath);
  res.setHeader('Content-Type', contentType);

  parser.streamFileFromZip(zipPath, fileInZipPath, res)
    .catch((err) => {
      console.error(`Error serving file ${fileInZipPath}:`, err);
      if (!res.headersSent) {
        res.status(404).send('File not found in archive');
      }
    });
});

// 11. SQLite Database Explorer APIs (MIND-BLOWING FORENSIC TOOL)
app.get('/api/sqlite/tables', checkDb, async (req, res) => {
  const fileInZipPath = req.query.path;
  if (!fileInZipPath) {
    return res.status(400).json({ error: 'path parameter is required' });
  }

  let zipPath = currentUfdrPath;
  if (!zipPath) {
    const info = db.getExtractionInfo();
    zipPath = info['UFDR Path'];
  }

  try {
    let activeDbInfo = openDatabases[fileInZipPath];
    
    if (!activeDbInfo) {
      // Create a unique temporary file path
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempPath = path.join(tempDir, `temp_${Date.now()}_${path.basename(fileInZipPath)}`);
      
      // Extract the SQLite file from ZIP to temp path
      const writeStream = fs.createWriteStream(tempPath);
      await parser.streamFileFromZip(zipPath, fileInZipPath, writeStream);
      
      // Open using node:sqlite
      const sqliteInstance = new DatabaseSync(tempPath);
      
      activeDbInfo = {
        tempPath,
        dbInstance: sqliteInstance
      };
      
      openDatabases[fileInZipPath] = activeDbInfo;
    }

    // List all tables
    const stmt = activeDbInfo.dbInstance.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tables = stmt.all().map(row => row.name);
    
    res.json({ tables });
  } catch (err) {
    console.error('Error opening sqlite db:', err);
    res.status(500).json({ error: `Failed to explore SQLite database: ${err.message}` });
  }
});

app.get('/api/sqlite/data', checkDb, (req, res) => {
  const { path: fileInZipPath, table } = req.query;
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);

  if (!fileInZipPath || !table) {
    return res.status(400).json({ error: 'path and table parameters are required' });
  }

  const activeDbInfo = openDatabases[fileInZipPath];
  if (!activeDbInfo) {
    return res.status(400).json({ error: 'Database is not open. Call /api/sqlite/tables first.' });
  }

  try {
    // Standardize inputs to prevent SQL injection (table names can't be parameterized)
    // Validate table name is alphanumeric or underscores
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Get Table Schema info
    const infoStmt = activeDbInfo.dbInstance.prepare(`PRAGMA table_info(${table})`);
    const columns = infoStmt.all().map(col => ({
      name: col.name,
      type: col.type
    }));

    // Get total count
    const countStmt = activeDbInfo.dbInstance.prepare(`SELECT COUNT(*) as count FROM ${table}`);
    const totalCount = countStmt.get().count;

    // Get table data
    const dataStmt = activeDbInfo.dbInstance.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`);
    const rows = dataStmt.all(limit, offset);

    res.json({
      columns,
      rows,
      totalCount,
      limit,
      offset
    });
  } catch (err) {
    console.error('Error querying sqlite db:', err);
    res.status(500).json({ error: `Failed to query table data: ${err.message}` });
  }
});

// Clean up temp database files on server shutdown
function cleanup() {
  console.log('Cleaning up temp databases...');
  for (const key of Object.keys(openDatabases)) {
    try {
      openDatabases[key].dbInstance.close();
      if (fs.existsSync(openDatabases[key].tempPath)) {
        fs.unlinkSync(openDatabases[key].tempPath);
      }
    } catch (e) {
      // ignore
    }
  }
  process.exit();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Serve static frontend files in production
const frontendBuildPath = path.join(__dirname, '../dist');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`CellSight Server running on http://localhost:${PORT}`);
});
