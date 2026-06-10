// Node.js Backend Forensic Parser Tests
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const parser = require('./parser');

const TEST_DB_PATH = path.join(__dirname, '../temp/test_run.db');

// Setup clean directory
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

console.log('--- RUNNING CELLSIGHT NODE.JS FORENSIC TESTS ---');

try {
  // 1. Test DB Initialization
  console.log('Test 1: Initializing SQLite Test DB...');
  db.initDb(TEST_DB_PATH);
  
  // Verify stats exist
  const stats1 = db.getStats();
  assert.strictEqual(stats1.messages, 0, 'Initial messages count should be 0');
  assert.strictEqual(stats1.contacts, 0, 'Initial contacts count should be 0');
  console.log('✓ Database tables and indexes created successfully.');

  // 2. Test Contact Ingestion
  console.log('Test 2: Ingesting Contact...');
  db.saveContact({
    id: 'contact-dave',
    name: 'Dave "The Plug"',
    identifier: '+1555000999',
    type: 'WhatsApp',
    photo_path: 'Images/avatar_dave.png'
  });
  
  const contacts = db.getContacts();
  assert.strictEqual(contacts.length, 1, 'Should have exactly 1 contact');
  assert.strictEqual(contacts[0].name, 'Dave "The Plug"', 'Contact name mapping mismatch');
  assert.strictEqual(contacts[0].identifier, '+1555000999', 'Contact identifier mapping mismatch');
  console.log('✓ Contact parsed and written successfully.');

  // 3. Test Message & Chat Ingestion
  console.log('Test 3: Ingesting Instant Message & Reconstructing Chat...');
  
  // Save Chat first
  db.saveChat({
    id: 'chat-deal-whatsapp',
    name: 'Deal Chat',
    source: 'WhatsApp',
    participants: ['Alice Smith', 'Dave "The Plug"']
  });

  // Save Message
  db.saveMessage({
    id: 'msg-wa-101',
    chat_id: 'chat-deal-whatsapp',
    timestamp: '2026-06-09T10:00:00Z',
    body: 'Cargo arriving at docks tonight.',
    direction: 'Incoming',
    sender_id: 'contact-dave',
    sender_name: 'Dave "The Plug"',
    recipients: [{ id: 'contact-bob', name: 'Bob Cooper' }],
    status: 'Read',
    source: 'WhatsApp'
  });

  const chats = db.getChats();
  assert.strictEqual(chats.length, 1, 'Should have created 1 chat');
  assert.strictEqual(chats[0].name, 'Deal Chat', 'Chat name mismatch');
  assert.strictEqual(chats[0].message_count, 1, 'Chat message count should be 1');

  const messages = db.getChatMessages('chat-deal-whatsapp');
  assert.strictEqual(messages.length, 1, 'Should have 1 message in chat');
  assert.strictEqual(messages[0].body, 'Cargo arriving at docks tonight.', 'Message body mismatch');
  assert.strictEqual(messages[0].sender_name, 'Dave "The Plug"', 'Message sender mismatch');
  console.log('✓ Chat group created and messages grouped successfully.');

  // 4. Test Evidence Tagging
  console.log('Test 4: Tagging Message as Legal Evidence...');
  db.addEvidence('message', 'msg-wa-101', 'Suspect details shipping coordinates.');
  
  const evidence = db.getEvidence();
  assert.strictEqual(evidence.length, 1, 'Should have 1 evidence tag');
  assert.strictEqual(evidence[0].artifact_id, 'msg-wa-101', 'Tagged message ID mismatch');
  assert.strictEqual(evidence[0].notes, 'Suspect details shipping coordinates.', 'Evidence note mismatch');

  // Verify message query reflects evidence status
  const messages2 = db.getChatMessages('chat-deal-whatsapp');
  assert.strictEqual(messages2[0].is_evidence, true, 'Message is_evidence flag should be true');

  // Remove evidence
  db.removeEvidence('message', 'msg-wa-101');
  const evidence2 = db.getEvidence();
  assert.strictEqual(evidence2.length, 0, 'Evidence list should be empty after removal');
  console.log('✓ Evidence pinning, note updates, and flag queries function correctly.');

  // Clean up
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  
  console.log('\n--- ALL NODE.JS FORENSIC TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);

} catch (err) {
  console.error('\n❌ TEST SUITE FAILURE:');
  console.error(err);
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  process.exit(1);
}
