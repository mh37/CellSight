const yazl = require('yazl');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function generateMockUfdr(outputPath) {
  return new Promise((resolve, reject) => {
    const zipfile = new yazl.ZipFile();
    
    // 1. Create a mock SQLite database file to include in the ZIP
    const tempDbPath = path.join(__dirname, 'ledger.db');
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
    
    const db = new DatabaseSync(tempDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        amount REAL,
        description TEXT,
        status TEXT
      );
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY,
        name TEXT,
        role TEXT
      );
    `);
    
    const insertTx = db.prepare('INSERT INTO transactions (date, amount, description, status) VALUES (?, ?, ?, ?)');
    insertTx.run('2026-06-01', 50000.00, 'Batch Alpha shipment payment', 'Completed');
    insertTx.run('2026-06-05', 12000.00, 'Customs clearance fee', 'Pending');
    insertTx.run('2026-06-08', 75000.00, 'Batch Beta deposit', 'Completed');
    
    const insertContact = db.prepare('INSERT INTO contacts (name, role) VALUES (?, ?)');
    insertContact.run('Dave', 'Supplier');
    insertContact.run('Bob', 'Broker');
    insertContact.run('Alice', 'Logistics');
    
    db.close();
    
    // Read the database bytes
    const dbBuffer = fs.readFileSync(tempDbPath);
    fs.unlinkSync(tempDbPath); // clean up temp file

    // 2. Minimal valid 1x1 transparent PNG buffer to represent mock images
    const pngBuffer = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
      "0000000d49444154789cc5c00109000000020001836e9d6b0000000049454e44ae426082",
      "hex"
    );

    // 3. Simple mock document content
    const docBuffer = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\n" +
      "4 0 obj\n<< /Length 50 >>\nstream\nBT /F1 12 Tf 70 700 Td (MOCK INSTRUCTIONS FOR CARGO LOGISTICS) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n0000000220 00000 n\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n318\n%%EOF"
    );

    // 4. Generate report.xml
    const reportXml = `<?xml version="1.0" encoding="utf-8"?>
<UFEDReport version="10.2.1">
  <ufed-report-meta>
    <field name="CaseNumber"><value><![CDATA[CASE-2026-NARC-089]]></value></field>
    <field name="Investigator"><value><![CDATA[Officer Marc]]></value></field>
    <field name="ExtractionTime"><value>2026-06-09T18:30:00Z</value></field>
  </ufed-report-meta>
  
  <decodedData>
    <!-- Device Metadata -->
    <model type="Device" id="dev-1">
      <field name="Model" type="String"><value><![CDATA[iPhone 14 Pro Max (A2894)]]></value></field>
      <field name="OS" type="String"><value><![CDATA[iOS 17.2]]></value></field>
      <field name="Serial" type="String"><value><![CDATA[G6DVF17XQ0DY]]></value></field>
      <field name="IMEI" type="String"><value><![CDATA[351748293847291]]></value></field>
      <field name="PhoneNumber" type="String"><value><![CDATA[+1 (555) 123-4567]]></value></field>
    </model>

    <!-- Contacts / Parties -->
    <model type="Party" id="contact-dave">
      <field name="Name" type="String"><value><![CDATA[Dave "The Plug"]]></value></field>
      <field name="Identifier" type="String"><value><![CDATA[+1 (555) 987-6543]]></value></field>
      <field name="Type" type="String"><value><![CDATA[WhatsApp]]></value></field>
      <field name="Photo" type="String"><value><![CDATA[Images/avatar_dave.png]]></value></field>
    </model>
    
    <model type="Party" id="contact-alice">
      <field name="Name" type="String"><value><![CDATA[Alice Smith]]></value></field>
      <field name="Identifier" type="String"><value><![CDATA[+1 (555) 234-5678]]></value></field>
      <field name="Type" type="String"><value><![CDATA[WhatsApp]]></value></field>
      <field name="Photo" type="String"><value><![CDATA[Images/avatar_alice.png]]></value></field>
    </model>

    <model type="Party" id="contact-bob">
      <field name="Name" type="String"><value><![CDATA[Bob Cooper]]></value></field>
      <field name="Identifier" type="String"><value><![CDATA[+1 (555) 123-4567]]></value></field>
      <field name="Type" type="String"><value><![CDATA[Local]]></value></field>
    </model>

    <!-- WhatsApp Group Chat messages -->
    <model type="InstantMessage" id="msg-wa-1">
      <field name="Source" type="String"><value><![CDATA[WhatsApp]]></value></field>
      <field name="Body" type="String"><value><![CDATA[Hey guys, did you get the sample cargo listing?]]></value></field>
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T10:00:00Z</value></field>
      <field name="Direction" type="String"><value><![CDATA[Incoming]]></value></field>
      <field name="ChatName" type="String"><value><![CDATA[Deal Chat]]></value></field>
      <field name="ChatId" type="String"><value><![CDATA[chat_deal_whatsapp]]></value></field>
      <modelField name="From" type="Party">
        <model type="Party" id="contact-alice">
          <field name="Name" type="String"><value><![CDATA[Alice Smith]]></value></field>
          <field name="Identifier" type="String"><value><![CDATA[+1 (555) 234-5678]]></value></field>
        </model>
      </modelField>
    </model>

    <model type="InstantMessage" id="msg-wa-2">
      <field name="Source" type="String"><value><![CDATA[WhatsApp]]></value></field>
      <field name="Body" type="String"><value><![CDATA[Yeah, looking at it now. Everything looks solid.]]></value></field>
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T10:01:00Z</value></field>
      <field name="Direction" type="String"><value><![CDATA[Outgoing]]></value></field>
      <field name="ChatName" type="String"><value><![CDATA[Deal Chat]]></value></field>
      <field name="ChatId" type="String"><value><![CDATA[chat_deal_whatsapp]]></value></field>
      <modelField name="From" type="Party">
        <model type="Party" id="contact-bob">
          <field name="Name" type="String"><value><![CDATA[Bob Cooper]]></value></field>
          <field name="Identifier" type="String"><value><![CDATA[+1 (555) 123-4567]]></value></field>
        </model>
      </modelField>
    </model>

    <model type="InstantMessage" id="msg-wa-3">
      <field name="Source" type="String"><value><![CDATA[WhatsApp]]></value></field>
      <field name="Body" type="String"><value><![CDATA[The shipment is arriving at the Miami docks tonight at 11 PM. Photo of the crate coordinates attached.]]></value></field>
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T10:02:00Z</value></field>
      <field name="Direction" type="String"><value><![CDATA[Incoming]]></value></field>
      <field name="ChatName" type="String"><value><![CDATA[Deal Chat]]></value></field>
      <field name="ChatId" type="String"><value><![CDATA[chat_deal_whatsapp]]></value></field>
      <modelField name="From" type="Party">
        <model type="Party" id="contact-dave">
          <field name="Name" type="String"><value><![CDATA[Dave "The Plug"]]></value></field>
          <field name="Identifier" type="String"><value><![CDATA[+1 (555) 987-6543]]></value></field>
        </model>
      </modelField>
      <multiModelField name="Attachment" type="Attachment">
        <model type="Attachment" id="wa-att-1">
          <field name="Filename" type="String"><value><![CDATA[docks_deal.png]]></value></field>
          <modelField name="File" type="File">
            <model type="File" id="file-docks-png">
              <field name="Path" type="String"><value><![CDATA[Images/docks_deal.png]]></value></field>
              <field name="Size" type="Integer"><value>5124</value></field>
              <field name="MD5" type="String"><value><![CDATA[895af895af895af895af895af895af89]]></value></field>
            </model>
          </modelField>
        </model>
      </multiModelField>
    </model>

    <model type="InstantMessage" id="msg-wa-4">
      <field name="Source" type="String"><value><![CDATA[WhatsApp]]></value></field>
      <field name="Body" type="String"><value><![CDATA[Also, check out our encrypted accounting database. It lists all transactions.]]></value></field>
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T10:07:00Z</value></field>
      <field name="Direction" type="String"><value><![CDATA[Incoming]]></value></field>
      <field name="ChatName" type="String"><value><![CDATA[Deal Chat]]></value></field>
      <field name="ChatId" type="String"><value><![CDATA[chat_deal_whatsapp]]></value></field>
      <modelField name="From" type="Party">
        <model type="Party" id="contact-dave">
          <field name="Name" type="String"><value><![CDATA[Dave "The Plug"]]></value></field>
          <field name="Identifier" type="String"><value><![CDATA[+1 (555) 987-6543]]></value></field>
        </model>
      </modelField>
      <multiModelField name="Attachment" type="Attachment">
        <model type="Attachment" id="wa-att-2">
          <field name="Filename" type="String"><value><![CDATA[ledger.db]]></value></field>
          <modelField name="File" type="File">
            <model type="File" id="file-ledger-db">
              <field name="Path" type="String"><value><![CDATA[Databases/ledger.db]]></value></field>
              <field name="Size" type="Integer"><value>16384</value></field>
              <field name="MD5" type="String"><value><![CDATA[d2a1b3c4e5f6g7h8i9j0k1l2m3n4o5p6]]></value></field>
            </model>
          </modelField>
        </model>
      </multiModelField>
    </model>

    <!-- SMS Chat Messages -->
    <model type="InstantMessage" id="msg-sms-1">
      <field name="Source" type="String"><value><![CDATA[SMS]]></value></field>
      <field name="Body" type="String"><value><![CDATA[Where are you? The meeting at the hotel lobby was scheduled for 10!]]></value></field>
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T10:15:00Z</value></field>
      <field name="Direction" type="String"><value><![CDATA[Incoming]]></value></field>
      <field name="ChatId" type="String"><value><![CDATA[+1 (555) 987-6543]]></value></field>
      <modelField name="From" type="Party">
        <model type="Party" id="contact-dave">
          <field name="Name" type="String"><value><![CDATA[Dave "The Plug"]]></value></field>
          <field name="Identifier" type="String"><value><![CDATA[+1 (555) 987-6543]]></value></field>
        </model>
      </modelField>
    </model>

    <model type="InstantMessage" id="msg-sms-2">
      <field name="Source" type="String"><value><![CDATA[SMS]]></value></field>
      <field name="Body" type="String"><value><![CDATA[Stuck in traffic on I-95, will be there in 10 mins.]]></value></field>
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T10:16:00Z</value></field>
      <field name="Direction" type="String"><value><![CDATA[Outgoing]]></value></field>
      <field name="ChatId" type="String"><value><![CDATA[+1 (555) 987-6543]]></value></field>
    </model>

    <!-- Call Logs -->
    <model type="Call" id="call-1">
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T09:30:00Z</value></field>
      <field name="Duration" type="Integer"><value>145</value></field>
      <field name="Direction" type="String"><value><![CDATA[Incoming]]></value></field>
      <field name="Source" type="String"><value><![CDATA[Phone]]></value></field>
      <modelField name="Party" type="Party">
        <model type="Party" id="contact-dave">
          <field name="Name" type="String"><value><![CDATA[Dave "The Plug"]]></value></field>
          <field name="Identifier" type="String"><value><![CDATA[+1 (555) 987-6543]]></value></field>
        </model>
      </modelField>
    </model>

    <model type="Call" id="call-2">
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T09:35:00Z</value></field>
      <field name="Duration" type="Integer"><value>32</value></field>
      <field name="Direction" type="String"><value><![CDATA[Outgoing]]></value></field>
      <field name="Source" type="String"><value><![CDATA[Phone]]></value></field>
      <modelField name="Party" type="Party">
        <model type="Party" id="contact-alice">
          <field name="Name" type="String"><value><![CDATA[Alice Smith]]></value></field>
          <field name="Identifier" type="String"><value><![CDATA[+1 (555) 234-5678]]></value></field>
        </model>
      </modelField>
    </model>

    <model type="Call" id="call-3">
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T09:55:00Z</value></field>
      <field name="Duration" type="Integer"><value>0</value></field>
      <field name="Direction" type="String"><value><![CDATA[Missed]]></value></field>
      <field name="Source" type="String"><value><![CDATA[Phone]]></value></field>
      <modelField name="Party" type="Party">
        <model type="Party" id="contact-dave">
          <field name="Name" type="String"><value><![CDATA[Dave "The Plug"]]></value></field>
          <field name="Identifier" type="String"><value><![CDATA[+1 (555) 987-6543]]></value></field>
        </model>
      </modelField>
    </model>

    <!-- Geolocation GPS Logs -->
    <model type="Location" id="loc-1">
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T10:55:00Z</value></field>
      <field name="Latitude" type="Double"><value>25.7617</value></field>
      <field name="Longitude" type="Double"><value>-80.1918</value></field>
      <field name="Address" type="String"><value><![CDATA[Miami Downtown Hotel Lobby]]></value></field>
      <field name="Source" type="String"><value><![CDATA[GPS Navigation]]></value></field>
      <field name="Accuracy" type="Double"><value>5.0</value></field>
    </model>
    
    <model type="Location" id="loc-2">
      <field name="TimeStamp" type="DateTime"><value>2026-06-09T23:00:00Z</value></field>
      <field name="Latitude" type="Double"><value>25.7743</value></field>
      <field name="Longitude" type="Double"><value>-80.1303</value></field>
      <field name="Address" type="String"><value><![CDATA[Miami Beach Crate Terminal 4]]></value></field>
      <field name="Source" type="String"><value><![CDATA[Cell Tower Triangulation]]></value></field>
      <field name="Accuracy" type="Double"><value>45.2</value></field>
    </model>

    <!-- General files list -->
    <model type="File" id="file-docks-png">
      <field name="Path" type="String"><value><![CDATA[Images/docks_deal.png]]></value></field>
      <field name="Name" type="String"><value><![CDATA[docks_deal.png]]></value></field>
      <field name="Size" type="Integer"><value>5124</value></field>
      <field name="MD5" type="String"><value><![CDATA[895af895af895af895af895af895af89]]></value></field>
      <field name="CreationTime" type="DateTime"><value>2026-06-09T10:02:00Z</value></field>
      <field name="Width" type="Integer"><value>1024</value></field>
      <field name="Height" type="Integer"><value>768</value></field>
    </model>

    <model type="File" id="file-ledger-db">
      <field name="Path" type="String"><value><![CDATA[Databases/ledger.db]]></value></field>
      <field name="Name" type="String"><value><![CDATA[ledger.db]]></value></field>
      <field name="Size" type="Integer"><value>16384</value></field>
      <field name="MD5" type="String"><value><![CDATA[d2a1b3c4e5f6g7h8i9j0k1l2m3n4o5p6]]></value></field>
      <field name="CreationTime" type="DateTime"><value>2026-06-09T10:07:00Z</value></field>
    </model>

    <model type="File" id="file-avatar-dave">
      <field name="Path" type="String"><value><![CDATA[Images/avatar_dave.png]]></value></field>
      <field name="Name" type="String"><value><![CDATA[avatar_dave.png]]></value></field>
      <field name="Size" type="Integer"><value>4192</value></field>
      <field name="CreationTime" type="DateTime"><value>2026-06-09T08:00:00Z</value></field>
    </model>

    <model type="File" id="file-avatar-alice">
      <field name="Path" type="String"><value><![CDATA[Images/avatar_alice.png]]></value></field>
      <field name="Name" type="String"><value><![CDATA[avatar_alice.png]]></value></field>
      <field name="Size" type="Integer"><value>4520</value></field>
      <field name="CreationTime" type="DateTime"><value>2026-06-09T08:05:00Z</value></field>
    </model>

    <model type="File" id="file-instructions-pdf">
      <field name="Path" type="String"><value><![CDATA[Documents/instructions.pdf]]></value></field>
      <field name="Name" type="String"><value><![CDATA[instructions.pdf]]></value></field>
      <field name="Size" type="Integer"><value>14234</value></field>
      <field name="CreationTime" type="DateTime"><value>2026-06-09T09:00:00Z</value></field>
    </model>
  </decodedData>
</UFEDReport>`;

    // Add buffers to the ZIP
    zipfile.addBuffer(Buffer.from(reportXml), 'report.xml');
    zipfile.addBuffer(dbBuffer, 'Databases/ledger.db');
    zipfile.addBuffer(pngBuffer, 'Images/docks_deal.png');
    zipfile.addBuffer(pngBuffer, 'Images/avatar_dave.png');
    zipfile.addBuffer(pngBuffer, 'Images/avatar_alice.png');
    zipfile.addBuffer(docBuffer, 'Documents/instructions.pdf');

    // Create write stream
    const outputStream = fs.createWriteStream(outputPath);
    zipfile.outputStream.pipe(outputStream);
    
    zipfile.end();

    outputStream.on('close', () => {
      resolve();
    });

    outputStream.on('error', (err) => {
      reject(err);
    });
  });
}

if (require.main === module) {
  const targetPath = path.join(__dirname, '../mock_extraction.ufdr');
  console.log(`Generating mock UFDR file at ${targetPath}...`);
  generateMockUfdr(targetPath)
    .then(() => console.log('Mock UFDR generated successfully!'))
    .catch(err => console.error('Error generating mock UFDR:', err));
}

module.exports = {
  generateMockUfdr
};
