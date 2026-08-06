import { useState, useEffect, useRef } from 'react';
import appIcon from './assets/images/appicon.png';
import {
  Shield,
    Database,
  MapPin,
  MessageSquare,
  Phone,
  User,
  Folder,
  Tag,
  FileText,
  Download,
      Clock,
    Grid,
  X,
  Sparkles,
  Activity
} from 'lucide-react';

// API Root URL — use a relative path so requests go through the Wails asset server
// handler (MediaAssetHandler) in production, and the Vite dev proxy in dev mode.
export const API_BASE = '/api';

import DashboardTab from './components/tabs/DashboardTab';
import ConversationsTab from './components/tabs/ConversationsTab';
import CallsTab from './components/tabs/CallsTab';
import ContactsTab from './components/tabs/ContactsTab';
import TimelineTab from './components/tabs/TimelineTab';
import MediaTab from './components/tabs/MediaTab';
import LocationsTab from './components/tabs/LocationsTab';
import SqliteTab from './components/tabs/SqliteTab';
import EvidenceTab from './components/tabs/EvidenceTab';

const getFileTypes = (previewMedia: any) => {
  const ext = (previewMedia.filename || '').split('.').pop()?.toLowerCase() || '';
  const isImg = previewMedia.type === 'image';
  const isVideo = previewMedia.type === 'video';
  const isAudio = previewMedia.type === 'audio';
  const isPdf = ext === 'pdf';
  const isText = ['txt', 'json', 'xml', 'html', 'log', 'plist', 'ini', 'csv', 'yaml', 'yml'].includes(ext);
  return { ext, isImg, isVideo, isAudio, isPdf, isText };
};

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('dashboard');

  // Load State
  const [ufdrPath, setUfdrPath] = useState('');
  const [isLoadModalOpen, setIsLoadModalOpen] = useState(false);
  const [extractionInfo, setExtractionInfo] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [parseStatus, setParseStatus] = useState<any>({ active: false, progress: 0, counts: { messages: 0, contacts: 0, calls: 0, files: 0, locations: 0 } });
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Data States — paginated
  const [chats, setChats] = useState<any[]>([]);
  const [chatsOffset, setChatsOffset] = useState(0);
  const [chatsHasMore, setChatsHasMore] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const [selectedChat, setSelectedChat] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [msgOffset, setMsgOffset] = useState(0);
  const [msgHasMore, setMsgHasMore] = useState(false);
  const [calls, setCalls] = useState<any[]>([]);
  const [callFilter, setCallFilter] = useState('all');
  const [callSearch, setCallSearch] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactsOffset, setContactsOffset] = useState(0);
  const [contactsHasMore, setContactsHasMore] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [filesOffset, setFilesOffset] = useState(0);
  const [filesHasMore, setFilesHasMore] = useState(false);
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [fileSearch, setFileSearch] = useState('');
  const [locations, setLocations] = useState<any[]>([]);
  const [locationsOffset, setLocationsOffset] = useState(0);
  const [locationsHasMore, setLocationsHasMore] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<any>(null);
  const [timelineEvents, setTimelineEvents] = useState<any[]>([]);
  const [timelineType, setTimelineType] = useState('all');
  const [timelineSearch, setTimelineSearch] = useState('');

  // Evidence / Notes
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [notesInput, setNotesInput] = useState('');
  const [selectedEvidenceItem, setSelectedEvidenceItem] = useState<any>(null);

  // Media / File Preview Modal
  const [previewMedia, setPreviewMedia] = useState<any>(null);
  const [previewTab, setPreviewTab] = useState<'viewer' | 'hex' | 'details'>('viewer');
  const [previewTextContent, setPreviewTextContent] = useState<string>('');
  const [previewTextLoading, setPreviewTextLoading] = useState<boolean>(false);
  const [previewHexDump, setPreviewHexDump] = useState<string>('');
  const [previewHexOffset, setPreviewHexOffset] = useState<number>(0);
  const [previewHexLoading, setPreviewHexLoading] = useState<boolean>(false);

  const fetchTextContent = async (filePath: string) => {
    setPreviewTextLoading(true);
    try {
      const w = window as any;
      if (w.go && w.go.main && w.go.main.App) {
        const res = await w.go.main.App.GetFileText(filePath, 100 * 1024);
        setPreviewTextContent(res.content);
      } else {
        const res = await fetch(`${API_BASE}/media?path=${encodeURIComponent(filePath)}`);
        const text = await res.text();
        setPreviewTextContent(text.slice(0, 100 * 1024));
      }
    } catch (err) {
      console.error(err);
      setPreviewTextContent("Failed to load text preview.");
    } finally {
      setPreviewTextLoading(false);
    }
  };

  const fetchHexDump = async (filePath: string, offset: number) => {
    setPreviewHexLoading(true);
    try {
      const w = window as any;
      if (w.go && w.go.main && w.go.main.App) {
        const res = await w.go.main.App.GetFileHex(filePath, offset, 256);
        setPreviewHexDump(res.hexDump);
      } else {
        setPreviewHexDump("Hex Viewer is only available in the compiled desktop application.");
      }
    } catch (err) {
      console.error(err);
      setPreviewHexDump("Failed to load hex dump.");
    } finally {
      setPreviewHexLoading(false);
    }
  };

  useEffect(() => {
    if (!previewMedia) return;
    
    const { isImg, isVideo, isAudio, isPdf, isText } = getFileTypes(previewMedia);

    setPreviewTextContent('');
    setPreviewHexDump('');
    setPreviewHexOffset(0);

    if (isImg || isVideo || isAudio || isPdf || isText) {
      setPreviewTab('viewer');
      if (isText) {
        fetchTextContent(previewMedia.path);
      }
    } else {
      setPreviewTab('hex');
      fetchHexDump(previewMedia.path, 0);
    }
  }, [previewMedia]);

  useEffect(() => {
    if (!previewMedia) return;
    if (previewTab === 'hex') {
      fetchHexDump(previewMedia.path, previewHexOffset);
    } else if (previewTab === 'viewer') {
      const { isText } = getFileTypes(previewMedia);
      if (isText && !previewTextContent) {
        fetchTextContent(previewMedia.path);
      }
    }
  }, [previewTab, previewHexOffset]);

  // SQLite Viewer
  const [sqliteFiles, setSqliteFiles] = useState<any[]>([]);
  const [selectedSqlitePath, setSelectedSqlitePath] = useState('');
  const [sqliteTables, setSqliteTables] = useState<string[]>([]);
  const [selectedSqliteTable, setSelectedSqliteTable] = useState('');
  const [sqliteColumns, setSqliteColumns] = useState<any[]>([]);
  const [sqliteRows, setSqliteRows] = useState<any[]>([]);
  const [sqliteTotalCount, setSqliteTotalCount] = useState(0);
  const [sqlitePage, setSqlitePage] = useState(0);
  const [sqliteLimit] = useState(25);

  // Message Thread Scroll
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Fetch initial info if already loaded
  useEffect(() => {
    fetchExtractionInfo();
    const interval = setInterval(checkParseStatus, 2000);
    // Live clock — update every second
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, []);

  const checkParseStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/parse-status`);
      const status = await res.json();
      // Ensure counts is always an object to prevent null-dereference crashes in the render
      if (!status.counts) {
        status.counts = { messages: 0, contacts: 0, calls: 0, files: 0, locations: 0 };
      }
      setParseStatus(status);
      if (status.active) {
        setIsLoading(true);
        isLoadingRef.current = true;
      } else if (isLoadingRef.current && !status.active) {
        // Use a ref instead of the isLoading state to avoid stale closure inside setInterval
        isLoadingRef.current = false;
        setIsLoading(false);
        fetchExtractionInfo(); // Refresh stats/metadata once parsed
      }
    } catch (e) {
      // Server might not be running yet
    }
  };

  const fetchExtractionInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/extraction-info`);
      if (res.ok) {
        const data = await res.json();
        setExtractionInfo(data.info);
        fetchStats();
        fetchChats();
        fetchCalls();
        fetchContacts();
        fetchSqliteFiles();
        fetchFiles();
        fetchLocations();
        fetchTimeline();
        fetchEvidence();
      }
    } catch (e) {
      console.error('Failed to fetch extraction info', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  };

  // 1. Open / Parse UFDR
  const handleLoadUfdr = async () => {
    try {
      setIsLoading(true);
      setIsLoadModalOpen(false);
      const res = await fetch(`${API_BASE}/open-ufdr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ufdrPath })
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error}`);
        setIsLoading(false);
      } else {
        // Start polling status
        checkParseStatus();
      }
    } catch (e: any) {
      alert(`Server connection failed: ${e.message}`);
      setIsLoading(false);
    }
  };

  // Page sizes
  const CHAT_PAGE = 100;
  const MSG_PAGE = 100;
  const CONTACT_PAGE = 100;
  const FILE_PAGE = 60;
  const LOC_PAGE = 500;

  // 2. Fetch specific datasets — all paginated
  const fetchChats = async (offset = 0, search = chatSearch) => {
    try {
      const q = new URLSearchParams({ search, limit: String(CHAT_PAGE), offset: String(offset) });
      const res = await fetch(`${API_BASE}/chats?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setChats(data || []);
          if ((data || []).length > 0 && !selectedChat) handleSelectChat((data || [])[0]);
        } else {
          setChats(prev => [...prev, ...(data || [])]);
        }
        setChatsOffset(offset + (data || []).length);
        setChatsHasMore((data || []).length === CHAT_PAGE);
      }
    } catch (e) { console.error('Failed to fetch chats', e); }
  };

  const handleSelectChat = async (chat: any, msgOff = 0) => {
    if (msgOff === 0) {
      setSelectedChat(chat);
      setChatMessages([]);
      setMsgOffset(0);
      setMsgHasMore(false);
    }
    try {
      const q = new URLSearchParams({ limit: String(MSG_PAGE), offset: String(msgOff) });
      const res = await fetch(`${API_BASE}/chats/${chat.id}/messages?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (msgOff === 0) {
          setChatMessages(data || []);
          setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } else {
          setChatMessages(prev => [...prev, ...(data || [])]);
        }
        setMsgOffset(msgOff + (data || []).length);
        setMsgHasMore((data || []).length === MSG_PAGE);
      }
    } catch (e) { console.error('Failed to fetch messages', e); }
  };

  const fetchCalls = async () => {
    try {
      const query = new URLSearchParams({ direction: callFilter, search: callSearch, limit: '200', offset: '0' });
      const res = await fetch(`${API_BASE}/calls?${query}`);
      if (res.ok) setCalls((await res.json()) || []);
    } catch (e) { console.error('Failed to fetch calls', e); }
  };

  useEffect(() => { if (extractionInfo) fetchCalls(); }, [callFilter, callSearch, extractionInfo]);

  const fetchContacts = async (offset = 0, search = contactSearch) => {
    try {
      const q = new URLSearchParams({ search, limit: String(CONTACT_PAGE), offset: String(offset) });
      const res = await fetch(`${API_BASE}/contacts?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setContacts(data || []);
        } else {
          setContacts(prev => [...prev, ...(data || [])]);
        }
        setContactsOffset(offset + (data || []).length);
        setContactsHasMore((data || []).length === CONTACT_PAGE);
      }
    } catch (e) { console.error('Failed to fetch contacts', e); }
  };

  // Debounced contact search — waits 400ms after last keystroke before firing
  useEffect(() => {
    if (!extractionInfo) return;
    setContactsOffset(0);
    setContacts([]);
    const t = setTimeout(() => fetchContacts(0, contactSearch), 400);
    return () => clearTimeout(t);
  }, [contactSearch, extractionInfo]);

  const fetchSqliteFiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/files?type=database&limit=1000`);
      if (res.ok) {
        const data = await res.json();
        setSqliteFiles(data || []);
      }
    } catch (e) { console.error('Failed to fetch sqlite files', e); }
  };

  const fetchFiles = async (offset = 0, type = fileTypeFilter, search = fileSearch) => {
    try {
      const q = new URLSearchParams({ type, search, limit: String(FILE_PAGE), offset: String(offset) });
      const res = await fetch(`${API_BASE}/files?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setFiles(data || []);
        } else {
          setFiles(prev => [...prev, ...(data || [])]);
        }
        setFilesOffset(offset + (data || []).length);
        setFilesHasMore((data || []).length === FILE_PAGE);
      }
    } catch (e) { console.error('Failed to fetch files', e); }
  };

  // Debounced file search
  useEffect(() => {
    if (!extractionInfo) return;
    setFilesOffset(0);
    setFiles([]);
    fetchSqliteFiles();
    const t = setTimeout(() => fetchFiles(0, fileTypeFilter, fileSearch), 400);
    return () => clearTimeout(t);
  }, [fileTypeFilter, fileSearch, extractionInfo]);

  const fetchLocations = async (offset = 0) => {
    try {
      const q = new URLSearchParams({ limit: String(LOC_PAGE), offset: String(offset) });
      const res = await fetch(`${API_BASE}/locations?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setLocations(data || []);
          if ((data || []).length > 0) setSelectedLocation((data || [])[0]);
        } else {
          setLocations(prev => [...prev, ...(data || [])]);
        }
        setLocationsOffset(offset + (data || []).length);
        setLocationsHasMore((data || []).length === LOC_PAGE);
      }
    } catch (e) { console.error('Failed to fetch locations', e); }
  };

  const fetchTimeline = async () => {
    try {
      const query = new URLSearchParams({
        type: timelineType,
        search: timelineSearch
      });
      const res = await fetch(`${API_BASE}/timeline?${query}`);
      if (res.ok) {
        setTimelineEvents(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch timeline', e);
    }
  };

  useEffect(() => {
    if (extractionInfo) fetchTimeline();
  }, [timelineType, timelineSearch, extractionInfo]);

  // 3. Evidence Tagging
  const fetchEvidence = async () => {
    try {
      const res = await fetch(`${API_BASE}/evidence`);
      if (res.ok) {
        setEvidenceList(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch evidence', e);
    }
  };

  const handleToggleEvidence = async (type: string, id: string, isTagged: boolean, textContent = '') => {
    if (isTagged) {
      // Remove tag
      const res = await fetch(`${API_BASE}/evidence?type=${type}&id=${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchEvidence();
        // Refresh active views
        if (selectedChat) handleSelectChat(selectedChat);
        fetchCalls();
        fetchFiles();
        fetchTimeline();
      }
    } else {
      // Open modal to enter notes
      setSelectedEvidenceItem({ type, id, textContent });
      setNotesInput('');
    }
  };

  const handleAddEvidenceSubmit = async () => {
    if (!selectedEvidenceItem) return;
    const res = await fetch(`${API_BASE}/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: selectedEvidenceItem.type,
        id: selectedEvidenceItem.id,
        notes: notesInput
      })
    });
    if (res.ok) {
      setSelectedEvidenceItem(null);
      fetchEvidence();
      // Refresh active views
      if (selectedChat) handleSelectChat(selectedChat);
      fetchCalls();
      fetchFiles();
      fetchTimeline();
      fetchStats();
    }
  };

  // 4. SQLite Explorer
  const handleSelectSqlite = async (filePath: string) => {
    setSelectedSqlitePath(filePath);
    setSelectedSqliteTable('');
    setSqliteRows([]);
    setSqliteColumns([]);

    if (!filePath) {
      setSqliteTables([]);
      return;
    }

    const res = await fetch(`${API_BASE}/sqlite/tables?path=${encodeURIComponent(filePath)}`);
    if (res.ok) {
      const data = await res.json();
      setSqliteTables(data.tables);
      if (data.tables.length > 0) {
        handleSelectSqliteTable(filePath, data.tables[0], 0);
      }
    }
  };

  const handleSelectSqliteTable = async (filePath: string, table: string, page = 0) => {
    setSelectedSqliteTable(table);
    setSqlitePage(page);
    const offset = page * sqliteLimit;

    const query = new URLSearchParams({
      path: filePath,
      table: table,
      limit: sqliteLimit.toString(),
      offset: offset.toString()
    });

    const res = await fetch(`${API_BASE}/sqlite/data?${query}`);
    if (res.ok) {
      const data = await res.json();
      setSqliteColumns(data.columns);
      setSqliteRows(data.rows);
      setSqliteTotalCount(data.totalCount);
    }
  };

  const handleBrowseFile = async () => {
    const wailsApp = (window as any).go?.main?.App;
    if (wailsApp) {
      try {
        const selected = await wailsApp.SelectFile();
        if (selected) {
          setUfdrPath(selected);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      alert("File browsing is only available when running in Desktop Mode. In local web browser mode, please type the path manually.");
    }
  };

  const handleBrowseFolder = async () => {
    const wailsApp = (window as any).go?.main?.App;
    if (wailsApp) {
      try {
        const selected = await wailsApp.SelectDirectory();
        if (selected) {
          setUfdrPath(selected);
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      alert("Folder browsing is only available when running in Desktop Mode. In local web browser mode, please type the path manually.");
    }
  };



  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', overflow: 'hidden' }}>
            <img src={appIcon} alt="CellSight Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '0.05em', color: '#ffffff' }}>CellSight</h1>
          </div>
        </div>

        {/* Loaded File Info Card */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
          {extractionInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'bold' }}>DEVICE ACTIVE</span>
                <span className="badge badge-incoming" style={{ fontSize: '9px' }}>LOADED</span>
              </div>
              <div style={{ fontSize: '13px', fontWeight: '600', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
                {extractionInfo['Model'] || 'Parsed Device'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                OS: {extractionInfo['OS'] || 'Unknown'}
              </div>
              <button
                onClick={() => setIsLoadModalOpen(true)}
                className="btn-secondary"
                style={{ width: '100%', padding: '6px', fontSize: '11px', justifyContent: 'center', marginTop: '6px' }}
              >
                Load Different Archive
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No extraction source loaded.</span>
              <button
                onClick={() => setIsLoadModalOpen(true)}
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Load Ingest Source
              </button>
            </div>
          )}
        </div>

        {/* Navigation links */}
        <div style={{ padding: '12px 6px', display: 'flex', flexDirection: 'column', gap: '4px', flexGrow: 1, overflowY: 'auto' }}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: Grid },
            { id: 'conversations', label: 'Conversations', icon: MessageSquare, count: stats?.messages },
            { id: 'calls', label: 'Call Logs', icon: Phone, count: stats?.calls },
            { id: 'contacts', label: 'Contacts Book', icon: User, count: stats?.contacts },
            { id: 'timeline', label: 'Timeline View', icon: Clock },
            { id: 'media', label: 'Media Gallery', icon: Folder, count: stats?.files },
            { id: 'locations', label: 'Map Coordinates', icon: MapPin, count: stats?.locations },
            { id: 'sqlite', label: 'SQLite Explorer', icon: Database },
            { id: 'evidence', label: 'Flagged Evidence', icon: Tag, count: stats?.evidence }
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  if (item.id === 'sqlite' && sqliteFiles.length > 0 && !selectedSqlitePath) {
                    handleSelectSqlite(sqliteFiles[0].path);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isActive ? 'linear-gradient(90deg, rgba(99,102,241,0.15) 0%, rgba(0,0,0,0) 100%)' : 'transparent',
                  color: isActive ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '13px',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  borderLeft: isActive ? '3px solid var(--accent-cyan)' : '3px solid transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} style={{ color: isActive ? 'var(--accent-cyan)' : 'var(--text-muted)' }} />
                  {item.label}
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span style={{ fontSize: '10px', background: isActive ? 'var(--accent-indigo)' : 'var(--bg-tertiary)', color: 'white', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div>Version 1.0.0</div>
        </div>
      </div>

      {/* Main Panel */}
      <div className="main-content">
        {/* Header */}
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)' }}>
              CASE REF: <span style={{ color: 'var(--accent-cyan)' }}>{extractionInfo?.['CaseNumber'] || 'N/A'}</span>
            </span>
            <span style={{ color: 'var(--border-color)' }}>|</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Investigator: {extractionInfo?.['Investigator'] || 'N/A'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {parseStatus.active && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(99,102,241,0.1)', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(99,102,241,0.2)' }}>
                <Activity size={14} className="animate-pulse" style={{ color: 'var(--accent-cyan)' }} />
                <span style={{ fontSize: '12px', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
                  Parsing Report: {parseStatus.progress}%
                </span>
                <div style={{ width: '80px', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${parseStatus.progress}%`, height: '100%', background: 'var(--accent-cyan)' }} />
                </div>
              </div>
            )}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={12} />
              {currentTime.toLocaleString()}
            </div>
          </div>
        </header>

        {/* Tab Content */}
        <div className="view-container">
          {isLoading && (
            <div className="glass-card glow-card" style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '16px', alignSelf: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Sparkles size={24} style={{ color: 'var(--accent-cyan)' }} className="animate-spin" />
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>Forensic Ingestion Engine Active</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    CellSight is indexing and extracting case files from {ufdrPath}...
                  </p>
                </div>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${parseStatus.progress}%` }}></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                <div>Parsed Messages: <strong>{parseStatus.counts.messages}</strong></div>
                <div>Contacts: <strong>{parseStatus.counts.contacts}</strong></div>
                <div>Call Logs: <strong>{parseStatus.counts.calls}</strong></div>
                <div>Media Files: <strong>{parseStatus.counts.files}</strong></div>
              </div>
            </div>
          )}

          {/* Tab 1: Dashboard */}
          {activeTab === 'dashboard' && (
<DashboardTab extractionInfo={extractionInfo} stats={stats} />
)}

          {/* Tab 2: Conversations */}
          {activeTab === 'conversations' && (
<ConversationsTab
              chatSearch={chatSearch}
              setChatSearch={setChatSearch}
              setChatsOffset={setChatsOffset}
              fetchChats={fetchChats}
              chats={chats}
              selectedChat={selectedChat}
              handleSelectChat={handleSelectChat}
              chatsHasMore={chatsHasMore}
              chatsOffset={chatsOffset}
              chatMessages={chatMessages}
              handleToggleEvidence={handleToggleEvidence}
              setPreviewMedia={setPreviewMedia}
              setActiveTab={setActiveTab}
              handleSelectSqlite={handleSelectSqlite}
              msgHasMore={msgHasMore}
              msgOffset={msgOffset}
              messageEndRef={messageEndRef}
            />
)}

          {/* Tab 3: Call Logs */}
          {activeTab === 'calls' && (
<CallsTab
              callFilter={callFilter}
              setCallFilter={setCallFilter}
              callSearch={callSearch}
              setCallSearch={setCallSearch}
              calls={calls}
              handleToggleEvidence={handleToggleEvidence}
            />
)}

          {/* Tab 4: Contacts */}
          {activeTab === 'contacts' && (
<ContactsTab
              contactSearch={contactSearch}
              setContactSearch={setContactSearch}
              contacts={contacts}
              contactsHasMore={contactsHasMore}
              fetchContacts={fetchContacts}
              contactsOffset={contactsOffset}
            />
)}

          {/* Tab 5: Timeline */}
          {activeTab === 'timeline' && (
<TimelineTab
              timelineType={timelineType}
              setTimelineType={setTimelineType}
              timelineSearch={timelineSearch}
              setTimelineSearch={setTimelineSearch}
              timelineEvents={timelineEvents}
              handleToggleEvidence={handleToggleEvidence}
            />
)}

          {/* Tab 6: Media Gallery */}
          {activeTab === 'media' && (
<MediaTab
              fileTypeFilter={fileTypeFilter}
              setFileTypeFilter={setFileTypeFilter}
              fileSearch={fileSearch}
              setFileSearch={setFileSearch}
              files={files}
              handleToggleEvidence={handleToggleEvidence}
              setPreviewMedia={setPreviewMedia}
              setActiveTab={setActiveTab}
              handleSelectSqlite={handleSelectSqlite}
              filesHasMore={filesHasMore}
              fetchFiles={fetchFiles}
              filesOffset={filesOffset}
            />
)}

          {/* Tab 7: Locations (Map) */}
          {activeTab === 'locations' && (
<LocationsTab
              locations={locations}
              selectedLocation={selectedLocation}
              setSelectedLocation={setSelectedLocation}
              handleToggleEvidence={handleToggleEvidence}
              locationsHasMore={locationsHasMore}
              fetchLocations={fetchLocations}
              locationsOffset={locationsOffset}
            />
)}

          {/* Tab 8: SQLite Viewer */}
          {activeTab === 'sqlite' && (
<SqliteTab
              selectedSqlitePath={selectedSqlitePath}
              handleSelectSqlite={handleSelectSqlite}
              sqliteFiles={sqliteFiles}
              sqliteTables={sqliteTables}
              selectedSqliteTable={selectedSqliteTable}
              handleSelectSqliteTable={handleSelectSqliteTable}
              sqliteTotalCount={sqliteTotalCount}
              sqlitePage={sqlitePage}
              sqliteLimit={sqliteLimit}
              sqliteColumns={sqliteColumns}
              sqliteRows={sqliteRows}
            />
)}

          {/* Tab 9: Flagged Evidence / Pinned Report */}
          {activeTab === 'evidence' && (
<EvidenceTab
              extractionInfo={extractionInfo}
              evidenceList={evidenceList}
              handleToggleEvidence={handleToggleEvidence}
            />
)}
        </div>
      </div>

      {/* Modal 1: Load Ingest Source */}
      {isLoadModalOpen && (
        <div className="modal-overlay" onClick={() => setIsLoadModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsLoadModalOpen(false)}
              style={{ position: 'absolute', right: '16px', top: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} style={{ color: 'var(--accent-cyan)' }} />
              Open Forensic Case Source
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 'bold' }}>
                  PATH TO CASE ARCHIVE (.UFDR / .ZIP) OR FOLDER
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={ufdrPath}
                    onChange={(e) => setUfdrPath(e.target.value)}
                    className="input-field"
                    placeholder="e.g. /path/to/Dataextract.ufdr"
                    style={{ flexGrow: 1 }}
                  />
                  <button
                    onClick={handleBrowseFile}
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap', fontSize: '12px' }}
                    title="Select a .ufdr or .zip archive file"
                  >
                    Browse File
                  </button>
                  <button
                    onClick={handleBrowseFolder}
                    className="btn-secondary"
                    style={{ whiteSpace: 'nowrap', fontSize: '12px' }}
                    title="Select an unzipped folder structure"
                  >
                    Browse Folder
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Provide the path to a .ufdr archive, a raw .zip system dump, or an unzipped extraction folder.
                </span>
              </div>

              {/* Demo Help */}
              <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '10px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-cyan)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ marginTop: '15px', padding: '10px', backgroundColor: 'var(--bg-card)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '4px', color: 'var(--text-primary)' }}>💡 Tip</div>
                    Select an extracted UFDR archive to begin parsing.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  onClick={() => setIsLoadModalOpen(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLoadUfdr}
                  className="btn-primary"
                >
                  Ingest & Parse
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Add Evidence Notes */}
      {selectedEvidenceItem && (
        <div className="modal-overlay" onClick={() => setSelectedEvidenceItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={16} style={{ color: 'var(--color-warning)' }} />
              Flag Artifact as Case Evidence
            </h3>

            <div style={{ background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px', fontStyle: 'italic', maxHeight: '100px', overflowY: 'auto' }}>
              "{selectedEvidenceItem.textContent}"
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 'bold' }}>
                  FORENSIC ANALYSIS NOTES (COURT REPORT)
                </label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="input-field"
                  style={{ height: '100px', resize: 'none', fontFamily: 'inherit' }}
                  placeholder="Explain why this artifact is criminally relevant or important..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  onClick={() => setSelectedEvidenceItem(null)}
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEvidenceSubmit}
                  className="btn-primary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Confirm Evidence Pin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Rich Forensic File Preview */}
      {previewMedia && (
        <div className="modal-overlay" onClick={() => setPreviewMedia(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%', padding: '20px', background: '#090d16', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} style={{ color: 'var(--accent-indigo)' }} />
                  {previewMedia.filename}
                </h4>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                  Path: {previewMedia.path}
                </div>
              </div>
              <button
                onClick={() => setPreviewMedia(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Tab Navigation inside Modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: '16px', paddingBottom: '1px' }}>
              <button
                onClick={() => setPreviewTab('viewer')}
                className={`tab-btn ${previewTab === 'viewer' ? 'active' : ''}`}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: previewTab === 'viewer' ? '2px solid var(--accent-indigo)' : '2px solid transparent',
                  padding: '6px 12px 10px 12px',
                  color: previewTab === 'viewer' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                Viewer / Preview
              </button>
              <button
                onClick={() => setPreviewTab('hex')}
                className={`tab-btn ${previewTab === 'hex' ? 'active' : ''}`}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: previewTab === 'hex' ? '2px solid var(--accent-indigo)' : '2px solid transparent',
                  padding: '6px 12px 10px 12px',
                  color: previewTab === 'hex' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                Hex Viewer
              </button>
              <button
                onClick={() => setPreviewTab('details')}
                className={`tab-btn ${previewTab === 'details' ? 'active' : ''}`}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: previewTab === 'details' ? '2px solid var(--accent-indigo)' : '2px solid transparent',
                  padding: '6px 12px 10px 12px',
                  color: previewTab === 'details' ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '13px'
                }}
              >
                Metadata Details
              </button>
            </div>

            {/* Tab Contents */}
            <div style={{ flexGrow: 1, minHeight: '380px', maxHeight: '500px', display: 'flex', flexDirection: 'column' }}>
              
              {/* Tab: Viewer */}
              {previewTab === 'viewer' && (
                <div style={{ flexGrow: 1, background: '#020617', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
                  {(() => {
                    const { isImg, isVideo, isAudio, isPdf, isText } = getFileTypes(previewMedia);

                    if (isImg) {
                      return (
                        <img
                          src={`${API_BASE}/media?path=${encodeURIComponent(previewMedia.path)}`}
                          alt={previewMedia.filename}
                          style={{ maxWidth: '100%', maxHeight: '450px', objectFit: 'contain' }}
                        />
                      );
                    } else if (isVideo) {
                      return (
                        <video
                          src={`${API_BASE}/media?path=${encodeURIComponent(previewMedia.path)}`}
                          controls
                          style={{ maxWidth: '100%', maxHeight: '450px' }}
                        />
                      );
                    } else if (isAudio) {
                      return (
                        <audio
                          src={`${API_BASE}/media?path=${encodeURIComponent(previewMedia.path)}`}
                          controls
                          style={{ width: '80%', padding: '20px' }}
                        />
                      );
                    } else if (isPdf) {
                      return (
                        <iframe
                          src={`${API_BASE}/media?path=${encodeURIComponent(previewMedia.path)}`}
                          style={{ width: '100%', height: '450px', border: 'none' }}
                          title="PDF Preview"
                        />
                      );
                    } else if (isText) {
                      if (previewTextLoading) {
                        return <div style={{ color: 'var(--text-muted)' }}>Loading file content...</div>;
                      }
                      return (
                        <pre style={{
                          width: '100%',
                          height: '450px',
                          margin: 0,
                          padding: '16px',
                          overflow: 'auto',
                          fontSize: '12px',
                          color: '#e2e8f0',
                          fontFamily: 'monospace',
                          textAlign: 'left',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          background: '#020617'
                        }}>
                          {previewTextContent}
                        </pre>
                      );
                    } else {
                      return (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                          <FileText size={48} style={{ color: 'var(--text-muted)' }} />
                          <div>No visual preview available for binary file.</div>
                          <button onClick={() => setPreviewTab('hex')} className="btn-secondary" style={{ fontSize: '12px' }}>
                            Switch to Hex Viewer
                          </button>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}

              {/* Tab: Hex Viewer */}
              {previewTab === 'hex' && (
                <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Hex dump area */}
                  <div style={{ flexGrow: 1, background: '#000', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {previewHexLoading ? (
                      <div style={{ color: '#0f0', fontFamily: 'monospace' }}>Loading bytes...</div>
                    ) : (
                      <pre style={{
                        width: '100%',
                        height: '380px',
                        margin: 0,
                        padding: '16px',
                        overflow: 'auto',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        color: '#00ff00',
                        textAlign: 'left',
                        whiteSpace: 'pre'
                      }}>
                        {previewHexDump || "[Empty / No data at offset]"}
                      </pre>
                    )}
                  </div>
                  
                  {/* Hex pagination controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setPreviewHexOffset(prev => Math.max(0, prev - 256))}
                        disabled={previewHexOffset === 0 || previewHexLoading}
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        ◄ Prev 256B
                      </button>
                      <button
                        onClick={() => setPreviewHexOffset(prev => prev + 256)}
                        disabled={previewHexLoading || (previewMedia.size > 0 && previewHexOffset + 256 >= previewMedia.size)}
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        Next 256B ►
                      </button>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      Offset: <span style={{ color: 'var(--text-primary)' }}>{previewHexOffset} (0x{previewHexOffset.toString(16).toUpperCase()})</span> / {previewMedia.size} bytes
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Jump:</span>
                      <input
                        type="number"
                        placeholder="Offset"
                        value={previewHexOffset}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 0) {
                            setPreviewHexOffset(val);
                          }
                        }}
                        className="input-field"
                        style={{ width: '90px', padding: '2px 8px', fontSize: '12px', height: '26px' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Details */}
              {previewTab === 'details' && (
                <div className="glass-card" style={{ flexGrow: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <h5 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Forensic Metadata</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '10px 20px', fontSize: '13px' }}>
                    <div style={{ color: 'var(--text-muted)' }}>File ID</div>
                    <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{previewMedia.id || "N/A"}</div>
                    
                    <div style={{ color: 'var(--text-muted)' }}>Filename</div>
                    <div style={{ color: 'var(--text-primary)' }}>{previewMedia.filename}</div>

                    <div style={{ color: 'var(--text-muted)' }}>Size</div>
                    <div style={{ color: 'var(--text-primary)' }}>{previewMedia.size ? `${previewMedia.size.toLocaleString()} bytes (${(previewMedia.size / 1024).toFixed(2)} KB)` : "0 bytes"}</div>

                    <div style={{ color: 'var(--text-muted)' }}>Type</div>
                    <div style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{previewMedia.type || "unknown"}</div>

                    <div style={{ color: 'var(--text-muted)' }}>Created/Modified Time</div>
                    <div style={{ color: 'var(--text-primary)' }}>{previewMedia.created_time || "N/A"}</div>

                    <div style={{ color: 'var(--text-muted)' }}>Extraction Path</div>
                    <div style={{ color: 'var(--text-primary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{previewMedia.path}</div>
                  </div>
                </div>
              )}

            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleToggleEvidence('file', previewMedia.id, previewMedia.is_evidence, `File: ${previewMedia.filename}`)}
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px', gap: '6px' }}
                >
                  <Tag size={14} style={{ color: previewMedia.is_evidence ? 'var(--color-warning)' : 'inherit' }} />
                  {previewMedia.is_evidence ? "Remove Flag" : "Flag as Evidence"}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <a
                  href={`${API_BASE}/media?path=${encodeURIComponent(previewMedia.path)}`}
                  download={previewMedia.filename}
                  className="btn-primary"
                  style={{ fontSize: '12px', padding: '6px 12px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={14} /> Download File
                </a>
                <button
                  onClick={() => setPreviewMedia(null)}
                  className="btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
