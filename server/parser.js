const yauzl = require('yauzl');
const sax = require('sax');
const fs = require('fs');
const db = require('./db');
const path = require('path');

let parseStatus = {
  active: false,
  progress: 0,
  bytesRead: 0,
  totalBytes: 0,
  currentItem: '',
  error: null,
  counts: {
    contacts: 0,
    chats: 0,
    messages: 0,
    calls: 0,
    files: 0,
    locations: 0
  }
};

function getParseStatus() {
  return parseStatus;
}

// Helper to look up fields case-insensitively
function getField(model, name) {
  if (!model || !model.fields) return '';
  const target = name.toLowerCase();
  for (const k of Object.keys(model.fields)) {
    if (k.toLowerCase() === target) return model.fields[k];
  }
  return '';
}

// Process and insert a root model into SQLite
function processRootModel(model) {
  if (!model || !model.type) return;

  const type = model.type.toLowerCase();
  const id = model.id || Math.random().toString(36).substring(2, 11);

  if (type === 'device' || type === 'extraction' || type === 'report') {
    // Save device metadata
    for (const [key, value] of Object.entries(model.fields)) {
      db.saveExtractionInfo(key, value);
    }
  } else if (type === 'contact' || type === 'party') {
    const name = getField(model, 'Name') || getField(model, 'Display_Name') || getField(model, 'NameName');
    const identifier = getField(model, 'Identifier') || getField(model, 'Value') || getField(model, 'PhoneNumber') || getField(model, 'Email');
    const contactType = getField(model, 'Type') || getField(model, 'Source') || 'Contact';
    
    db.saveContact({
      id,
      name,
      identifier,
      type: contactType,
      photo_path: getField(model, 'Photo') || getField(model, 'Avatar')
    });
    parseStatus.counts.contacts++;
  } else if (type === 'instantmessage' || type === 'message' || type === 'sms' || type === 'mms') {
    const body = getField(model, 'Body') || getField(model, 'Text') || getField(model, 'MessageText') || '';
    const timestamp = getField(model, 'TimeStamp') || getField(model, 'Time') || getField(model, 'Date') || '';
    const direction = getField(model, 'Direction') || 'Incoming';
    const status = getField(model, 'Status') || getField(model, 'MessageStatus') || '';
    const source = getField(model, 'Source') || getField(model, 'Application') || 'SMS';

    // Parse sender (From)
    let senderId = '';
    let senderName = '';
    const fromModel = model.modelFields.From || model.modelFields.Sender;
    if (fromModel) {
      senderId = fromModel.id || '';
      senderName = getField(fromModel, 'Name') || getField(fromModel, 'Display_Name') || getField(fromModel, 'Identifier') || '';
      // Save contact if it doesn't exist yet
      db.saveContact({
        id: senderId || senderName,
        name: senderName,
        identifier: getField(fromModel, 'Identifier') || '',
        type: source,
        photo_path: ''
      });
    } else {
      senderName = getField(model, 'SenderName') || getField(model, 'From') || '';
    }

    // Parse recipients (To)
    const recipients = [];
    const toModels = model.multiModelFields.To || model.multiModelFields.Recipients || [];
    for (const rModel of toModels) {
      const rName = getField(rModel, 'Name') || getField(rModel, 'Display_Name') || getField(rModel, 'Identifier') || '';
      const rId = rModel.id || rName;
      recipients.push({ id: rId, name: rName, identifier: getField(rModel, 'Identifier') || '' });
      db.saveContact({
        id: rId,
        name: rName,
        identifier: getField(rModel, 'Identifier') || '',
        type: source,
        photo_path: ''
      });
    }

    // Link to Chat group / conversation
    let chatId = getField(model, 'ChatId') || getField(model, 'ConversationId') || getField(model, 'ThreadId');
    let chatName = getField(model, 'ChatName') || getField(model, 'GroupName') || getField(model, 'ConversationName');
    
    if (!chatId) {
      // Reconstruct Chat ID if missing
      if (chatName) {
        chatId = `chat_${chatName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      } else {
        // 1-to-1 conversation: group by the other party
        if (direction.toLowerCase() === 'incoming') {
          chatId = senderId || senderName || 'unknown_sender';
          chatName = senderName || 'Unknown Contact';
        } else {
          const firstRecipient = recipients[0];
          chatId = firstRecipient ? (firstRecipient.id || firstRecipient.name) : 'unknown_recipient';
          chatName = firstRecipient ? firstRecipient.name : 'Unknown Recipient';
        }
      }
    }

    if (!chatName) {
      chatName = chatId;
    }

    // Save chat
    db.saveChat({
      id: chatId,
      name: chatName,
      source: source,
      participants: recipients.map(r => r.name).concat(senderName ? [senderName] : [])
    });

    // Save message
    db.saveMessage({
      id,
      chat_id: chatId,
      timestamp,
      body,
      direction,
      sender_id: senderId || senderName,
      sender_name: senderName,
      recipients: recipients,
      status,
      source
    });

    // Parse attachments
    const attModels = model.multiModelFields.Attachment || model.multiModelFields.Attachments || [];
    for (const att of attModels) {
      const fileModel = att.modelFields.File || att;
      const fileId = fileModel.id || '';
      const filename = getField(att, 'Filename') || getField(fileModel, 'Name') || getField(fileModel, 'Filename') || 'attachment';
      const path = getField(fileModel, 'Path') || getField(fileModel, 'RelativePath') || '';
      const size = parseInt(getField(fileModel, 'Size') || '0', 10);
      const attId = att.id || `${id}_att_${Math.random().toString(36).substring(2, 6)}`;

      db.saveAttachment({
        id: attId,
        message_id: id,
        file_id: fileId,
        type: getFileType(filename),
        filename,
        path,
        size
      });

      if (fileId && path) {
        db.saveFile({
          id: fileId,
          path,
          filename,
          size,
          type: getFileType(filename),
          md5: getField(fileModel, 'MD5') || getField(fileModel, 'Hash'),
          created_time: timestamp
        });
      }
    }

    parseStatus.counts.messages++;
  } else if (type === 'call' || type === 'call_log') {
    const timestamp = getField(model, 'TimeStamp') || getField(model, 'Time') || getField(model, 'Date') || '';
    const duration = getField(model, 'Duration') || '0';
    const direction = getField(model, 'Direction') || 'Incoming';
    const source = getField(model, 'Source') || getField(model, 'Application') || 'CallLog';
    
    // Parse party info
    const partyModel = model.modelFields.Party || model.modelFields.Contact;
    let partyName = '';
    let partyIdentifier = '';
    
    if (partyModel) {
      partyName = getField(partyModel, 'Name') || getField(partyModel, 'Display_Name') || '';
      partyIdentifier = getField(partyModel, 'Identifier') || getField(partyModel, 'Value') || '';
    } else {
      partyName = getField(model, 'PartyName') || getField(model, 'Name') || '';
      partyIdentifier = getField(model, 'PartyIdentifier') || getField(model, 'PhoneNumber') || getField(model, 'Identifier') || '';
    }

    db.saveCall({
      id,
      timestamp,
      duration,
      direction,
      party_name: partyName || partyIdentifier,
      party_identifier: partyIdentifier,
      source
    });
    parseStatus.counts.calls++;
  } else if (type === 'file' || type === 'taggedfile') {
    const path = getField(model, 'Path') || getField(model, 'RelativePath') || '';
    const filename = getField(model, 'Name') || getField(model, 'Filename') || path.split('/').pop() || '';
    const size = parseInt(getField(model, 'Size') || '0', 10);
    const fileType = getFileType(filename);
    const md5 = getField(model, 'MD5') || getField(model, 'Hash') || '';
    const created_time = getField(model, 'CreationTime') || getField(model, 'Created') || getField(model, 'Modified') || '';
    const width = parseInt(getField(model, 'Width') || '0', 10) || null;
    const height = parseInt(getField(model, 'Height') || '0', 10) || null;
    const latitude = parseFloat(getField(model, 'Latitude') || '0') || null;
    const longitude = parseFloat(getField(model, 'Longitude') || '0') || null;

    db.saveFile({
      id,
      path,
      filename,
      size,
      type: fileType,
      md5,
      created_time,
      width,
      height,
      gps_latitude: latitude,
      gps_longitude: longitude
    });

    // If it has GPS coordinates, also save it in the locations table
    if (latitude && longitude) {
      db.saveLocation({
        id: `loc_file_${id}`,
        timestamp: created_time,
        latitude,
        longitude,
        address: `Exif metadata from ${filename}`,
        source: 'Exif Metadata',
        accuracy: null
      });
      parseStatus.counts.locations++;
    }

    parseStatus.counts.files++;
  } else if (type === 'location' || type === 'gps' || type === 'coordinate') {
    const timestamp = getField(model, 'TimeStamp') || getField(model, 'Time') || '';
    const latitude = parseFloat(getField(model, 'Latitude') || '0');
    const longitude = parseFloat(getField(model, 'Longitude') || '0');
    const address = getField(model, 'Address') || getField(model, 'Name') || '';
    const source = getField(model, 'Source') || getField(model, 'Application') || 'GPS';
    const accuracy = parseFloat(getField(model, 'Accuracy') || '0') || null;

    if (latitude && longitude) {
      db.saveLocation({
        id,
        timestamp,
        latitude,
        longitude,
        address,
        source,
        accuracy
      });
      parseStatus.counts.locations++;
    }
  }
}

function getFileType(filename) {
  if (!filename) return 'other';
  const ext = filename.split('.').pop().toLowerCase();
  const images = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'heic'];
  const videos = ['mp4', 'mov', 'avi', 'mkv', '3gp', 'wmv', 'flv'];
  const audios = ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'amr'];
  const docs = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'html', 'rtf'];
  const dbs = ['db', 'sqlite', 'sqlite3', 'sql'];

  if (images.includes(ext)) return 'image';
  if (videos.includes(ext)) return 'video';
  if (audios.includes(ext)) return 'audio';
  if (docs.includes(ext)) return 'document';
  if (dbs.includes(ext)) return 'database';
  return 'other';
}

// Parse UFDR (zip archive) using SAX and SQLite
function parseUfdr(ufdrPath, dbPath) {
  return new Promise((resolve, reject) => {
    parseStatus.active = true;
    parseStatus.progress = 0;
    parseStatus.bytesRead = 0;
    parseStatus.currentItem = 'Initializing database...';
    parseStatus.error = null;
    parseStatus.counts = { contacts: 0, chats: 0, messages: 0, calls: 0, files: 0, locations: 0 };

    try {
      db.initDb(dbPath);
    } catch (e) {
      parseStatus.active = false;
      parseStatus.error = `Database initialization failed: ${e.message}`;
      return reject(e);
    }

    parseStatus.currentItem = 'Opening UFDR archive...';

    yauzl.open(ufdrPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) {
        parseStatus.active = false;
        parseStatus.error = `Failed to open ZIP: ${err.message}`;
        return reject(err);
      }

      let reportXmlEntry = null;

      zipfile.readEntry();

      zipfile.on('entry', (entry) => {
        // Cellebrite report is usually named report.xml and sits at the root
        if (entry.fileName.toLowerCase() === 'report.xml') {
          reportXmlEntry = entry;
          parseStatus.totalBytes = entry.uncompressedSize;
          parseStatus.currentItem = 'Found report.xml, starting parse...';
          
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              parseStatus.active = false;
              parseStatus.error = `Failed to read report.xml: ${err.message}`;
              zipfile.close();
              return reject(err);
            }

            // Set up SAX stream parser
            const saxStream = sax.createStream(true, { lowercase: true, trim: true });
            const modelStack = [];
            let currentField = null;
            let currentModelField = null;
            let currentMultiModelField = null;

            // Start transaction for fast insert
            db.transaction(() => {
              // We'll commit/rollback as we run
            });

            // Re-open transaction manually so we can commit periodically
            db.exec('BEGIN TRANSACTION;');
            let insertCount = 0;

            readStream.on('data', (chunk) => {
              parseStatus.bytesRead += chunk.length;
              parseStatus.progress = Math.min(99, Math.round((parseStatus.bytesRead / parseStatus.totalBytes) * 100));
            });

            saxStream.on('opentag', (node) => {
              if (node.name === 'model') {
                const model = {
                  type: node.attributes.type || '',
                  id: node.attributes.id || '',
                  fields: {},
                  modelFields: {},
                  multiModelFields: {}
                };
                modelStack.push(model);
              } else if (node.name === 'field') {
                currentField = node.attributes.name;
              } else if (node.name === 'modelfield') {
                currentModelField = node.attributes.name;
              } else if (node.name === 'multimodelfield') {
                currentMultiModelField = node.attributes.name;
              }
            });

            saxStream.on('text', (text) => {
              if (currentField && modelStack.length > 0) {
                const currentModel = modelStack[modelStack.length - 1];
                if (!currentModel.fields[currentField]) {
                  currentModel.fields[currentField] = '';
                }
                currentModel.fields[currentField] += text;
              }
            });

            saxStream.on('cdata', (cdataText) => {
              if (currentField && modelStack.length > 0) {
                const currentModel = modelStack[modelStack.length - 1];
                if (!currentModel.fields[currentField]) {
                  currentModel.fields[currentField] = '';
                }
                currentModel.fields[currentField] += cdataText;
              }
            });

            saxStream.on('closetag', (tagName) => {
              if (tagName === 'model') {
                const finishedModel = modelStack.pop();
                if (modelStack.length > 0) {
                  const parentModel = modelStack[modelStack.length - 1];
                  
                  if (currentModelField) {
                    parentModel.modelFields[currentModelField] = finishedModel;
                  } else if (currentMultiModelField) {
                    if (!parentModel.multiModelFields[currentMultiModelField]) {
                      parentModel.multiModelFields[currentMultiModelField] = [];
                    }
                    parentModel.multiModelFields[currentMultiModelField].push(finishedModel);
                  }
                } else {
                  // Root model complete!
                  try {
                    processRootModel(finishedModel);
                    insertCount++;
                    
                    // Commit transaction every 1000 items to avoid running out of memory and keep database active
                    if (insertCount % 1000 === 0) {
                      db.exec('COMMIT; BEGIN TRANSACTION;');
                    }
                  } catch (e) {
                    console.error('Error inserting model:', e);
                  }
                }
              } else if (tagName === 'field') {
                currentField = null;
              } else if (tagName === 'modelfield') {
                currentModelField = null;
              } else if (tagName === 'multimodelfield') {
                currentMultiModelField = null;
              }
            });

            saxStream.on('end', () => {
              try {
                db.exec('COMMIT;'); // Commit the final transaction
                
                // Set metadata about extraction file path
                db.saveExtractionInfo('UFDR Path', ufdrPath);
                db.saveExtractionInfo('Database Recreated At', new Date().toISOString());

                parseStatus.active = false;
                parseStatus.progress = 100;
                parseStatus.currentItem = 'Parsing completed successfully!';
                zipfile.close();
                resolve();
              } catch (e) {
                db.exec('ROLLBACK;');
                parseStatus.active = false;
                parseStatus.error = `Failed to commit final database transaction: ${e.message}`;
                zipfile.close();
                reject(e);
              }
            });

            saxStream.on('error', (e) => {
              db.exec('ROLLBACK;');
              parseStatus.active = false;
              parseStatus.error = `XML Parse Error: ${e.message}`;
              zipfile.close();
              reject(e);
            });

            readStream.pipe(saxStream);
          });
        } else {
          // Keep reading entries until we find report.xml
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        if (!reportXmlEntry) {
          parseStatus.active = false;
          parseStatus.error = 'Could not find report.xml at the root of the UFDR archive.';
          reject(new Error('report.xml not found'));
        }
      });
    });
  });
}

// Extra utility: Extract a single file from the UFDR zip and stream it to a response
function streamFileFromZip(zipPath, fileInZipPath, writeStream) {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);

      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        // Cellebrite ZIP paths can be case-sensitive or backslash-delimited, standardize comparison
        const normalizedEntryPath = entry.fileName.replace(/\\/g, '/').toLowerCase();
        const normalizedTargetPath = fileInZipPath.replace(/\\/g, '/').toLowerCase();

        if (normalizedEntryPath === normalizedTargetPath) {
          zipfile.openReadStream(entry, (err, readStream) => {
            if (err) {
              zipfile.close();
              return reject(err);
            }
            readStream.pipe(writeStream);
            readStream.on('end', () => {
              zipfile.close();
              resolve();
            });
            readStream.on('error', (e) => {
              zipfile.close();
              reject(e);
            });
          });
        } else {
          zipfile.readEntry();
        }
      });

      zipfile.on('end', () => {
        reject(new Error(`File ${fileInZipPath} not found in zip archive`));
      });
    });
  });
}

module.exports = {
  parseUfdr,
  getParseStatus,
  streamFileFromZip
};
