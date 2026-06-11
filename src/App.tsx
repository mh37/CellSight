import { useState, useEffect, useRef } from 'react';
import {
  Shield,
  Search,
  Database,
  MapPin,
  MessageSquare,
  Phone,
  User,
  Folder,
  Tag,
  FileText,
  Download,
  ExternalLink,
  Eye,
  Clock,
  Trash2,
  Grid,
  X,
  Sparkles,
  Activity
} from 'lucide-react';

// API Root URL — use a relative path so requests go through the Wails asset server
// handler (MediaAssetHandler) in production, and the Vite dev proxy in dev mode.
const API_BASE = '/api';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('dashboard');

  // Load State
  const [ufdrPath, setUfdrPath] = useState('mock_extraction.ufdr');
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
    
    const ext = previewMedia.filename.split('.').pop()?.toLowerCase() || '';
    const isImg = previewMedia.type === 'image';
    const isVideo = previewMedia.type === 'video';
    const isAudio = previewMedia.type === 'audio';
    const isPdf = ext === 'pdf';
    const isText = ['txt', 'json', 'xml', 'html', 'log', 'plist', 'ini', 'csv', 'yaml', 'yml'].includes(ext);

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
      const ext = previewMedia.filename.split('.').pop()?.toLowerCase() || '';
      const isText = ['txt', 'json', 'xml', 'html', 'log', 'plist', 'ini', 'csv', 'yaml', 'yml'].includes(ext);
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
          setChats(data);
          if (data.length > 0 && !selectedChat) handleSelectChat(data[0]);
        } else {
          setChats(prev => [...prev, ...data]);
        }
        setChatsOffset(offset + data.length);
        setChatsHasMore(data.length === CHAT_PAGE);
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
          setChatMessages(data);
          setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } else {
          setChatMessages(prev => [...prev, ...data]);
        }
        setMsgOffset(msgOff + data.length);
        setMsgHasMore(data.length === MSG_PAGE);
      }
    } catch (e) { console.error('Failed to fetch messages', e); }
  };

  const fetchCalls = async () => {
    try {
      const query = new URLSearchParams({ direction: callFilter, search: callSearch, limit: '200', offset: '0' });
      const res = await fetch(`${API_BASE}/calls?${query}`);
      if (res.ok) setCalls(await res.json());
    } catch (e) { console.error('Failed to fetch calls', e); }
  };

  useEffect(() => { if (extractionInfo) fetchCalls(); }, [callFilter, callSearch, extractionInfo]);

  const fetchContacts = async (offset = 0, search = contactSearch) => {
    try {
      const q = new URLSearchParams({ search, limit: String(CONTACT_PAGE), offset: String(offset) });
      const res = await fetch(`${API_BASE}/contacts?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) setContacts(data); else setContacts(prev => [...prev, ...data]);
        setContactsOffset(offset + data.length);
        setContactsHasMore(data.length === CONTACT_PAGE);
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

  const fetchFiles = async (offset = 0, type = fileTypeFilter, search = fileSearch) => {
    try {
      const q = new URLSearchParams({ type, search, limit: String(FILE_PAGE), offset: String(offset) });
      const res = await fetch(`${API_BASE}/files?${q}`);
      if (res.ok) {
        const data = await res.json();
        if (offset === 0) {
          setFiles(data);
          setSqliteFiles(data.filter((f: any) => f.type === 'database'));
        } else {
          setFiles(prev => [...prev, ...data]);
        }
        setFilesOffset(offset + data.length);
        setFilesHasMore(data.length === FILE_PAGE);
      }
    } catch (e) { console.error('Failed to fetch files', e); }
  };

  // Debounced file search
  useEffect(() => {
    if (!extractionInfo) return;
    setFilesOffset(0);
    setFiles([]);
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
          setLocations(data);
          if (data.length > 0) setSelectedLocation(data[0]);
        } else {
          setLocations(prev => [...prev, ...data]);
        }
        setLocationsOffset(offset + data.length);
        setLocationsHasMore(data.length === LOC_PAGE);
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

  const renderOfflineMap = () => {
    if (locations.length === 0) {
      return (
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          No coordinate logs extracted to plot.
        </div>
      );
    }

    const lats = locations.map(l => l.latitude);
    const lons = locations.map(l => l.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const latRange = maxLat - minLat || 0.001;
    const lonRange = maxLon - minLon || 0.001;

    const width = 800;
    const height = 460;
    const padding = 60;

    const getXY = (lat: number, lon: number) => {
      const x = padding + ((lon - minLon) / lonRange) * (width - 2 * padding);
      const y = height - padding - ((lat - minLat) / latRange) * (height - 2 * padding);
      return { x, y };
    };

    // Build SVG path
    let pathD = "";
    locations.forEach((loc, idx) => {
      const { x, y } = getXY(loc.latitude, loc.longitude);
      if (idx === 0) {
        pathD = `M ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
      }
    });

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0a0e1a', display: 'flex', flexDirection: 'column' }}>
        {/* Security alert header */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '13px', fontWeight: 'bold' }}>Offline Coordinate Track Plotter</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '4px 10px', borderRadius: '12px' }}>
            <Shield size={12} style={{ color: 'var(--color-success)' }} />
            <span style={{ fontSize: '10px', color: 'var(--color-success)', fontWeight: 'bold', textTransform: 'uppercase' }}>OFFLINE PRIVATE PLOT</span>
          </div>
        </div>

        <div style={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
          <svg width="100%" height="100%" viewBox="0 0 800 460" style={{ background: '#070a13' }}>
            {/* Compass grid lines */}
            <line x1="0" y1="230" x2="800" y2="230" stroke="rgba(255,255,255,0.03)" strokeDasharray="5,5" />
            <line x1="400" y1="0" x2="400" y2="460" stroke="rgba(255,255,255,0.03)" strokeDasharray="5,5" />

            {/* Movement Path */}
            {locations.length > 1 && (
              <path
                d={pathD}
                fill="none"
                stroke="url(#trail-gradient)"
                strokeWidth="3"
                strokeDasharray="8,4"
              />
            )}

            {/* Definitions for gradients */}
            <defs>
              <linearGradient id="trail-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-cyan)" />
                <stop offset="100%" stopColor="var(--accent-indigo)" />
              </linearGradient>
              <radialGradient id="selected-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--accent-cyan)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Coordinate points */}
            {locations.map((loc, idx) => {
              const { x, y } = getXY(loc.latitude, loc.longitude);
              const isSelected = selectedLocation?.id === loc.id;
              return (
                <g key={loc.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedLocation(loc)}>
                  {isSelected && (
                    <circle cx={x} cy={y} r="20" fill="url(#selected-glow)" />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? "7" : "5"}
                    fill={isSelected ? "var(--accent-cyan)" : "var(--bg-tertiary)"}
                    stroke={isSelected ? "#fff" : "var(--accent-indigo)"}
                    strokeWidth="2"
                  />
                  {/* Labels for points */}
                  <text
                    x={x + 10}
                    y={y - 6}
                    fill={isSelected ? "var(--accent-cyan)" : "var(--text-muted)"}
                    fontSize={isSelected ? "11px" : "9px"}
                    fontWeight={isSelected ? "bold" : "normal"}
                    style={{ pointerEvents: 'none' }}
                  >
                    Point {idx + 1}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Selected Point overlay card inside container */}
          {selectedLocation && (
            <div className="glass-card" style={{ position: 'absolute', bottom: '15px', left: '15px', right: '15px', padding: '14px', background: 'rgba(9, 13, 22, 0.9)', backdropFilter: 'blur(10px)', zIndex: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 'bold' }}>{selectedLocation.address || 'GPS Coordinate Log'}</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Lat: {selectedLocation.latitude} | Lon: {selectedLocation.longitude} (Accuracy: {selectedLocation.accuracy ? `${selectedLocation.accuracy}m` : 'N/A'})
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleToggleEvidence('location', selectedLocation.id, selectedLocation.is_evidence, `Location: ${selectedLocation.latitude}, ${selectedLocation.longitude}`)}
                    className="btn-secondary"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                  >
                    <Tag size={10} style={{ color: selectedLocation.is_evidence ? 'var(--color-warning)' : 'var(--text-muted)' }} />
                    {selectedLocation.is_evidence ? 'Unflag' : 'Flag Evidence'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/logo.png" alt="CellSight Logo" style={{ width: '38px', height: '38px', borderRadius: '8px', boxShadow: '0 0 12px rgba(0, 242, 254, 0.25)', border: '1px solid rgba(255,255,255,0.05)' }} />
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '0.05em', background: 'linear-gradient(90deg, #fff 0%, #a5b4fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>CellSight</h1>
            <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase' }}>PA v10 Decoder</span>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              {/* Top Summary Banner */}
              <div className="glass-card" style={{ padding: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, rgba(16, 22, 38, 0.9) 0%, rgba(22, 31, 54, 0.9) 100%)', border: '1px solid rgba(0, 242, 254, 0.15)' }}>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.5px' }}>Extraction Overview</h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px' }}>
                    Forensic summary for device extraction case <strong style={{ color: 'var(--accent-cyan)' }}>{extractionInfo?.['CaseNumber'] || 'N/A'}</strong>.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ borderLeft: '4px solid var(--accent-cyan)', paddingLeft: '14px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Report Date</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>
                      {extractionInfo?.['ExtractionTime'] ? new Date(extractionInfo['ExtractionTime']).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                  <div style={{ borderLeft: '4px solid var(--accent-indigo)', paddingLeft: '14px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Ingest Type</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '2px' }}>
                      {extractionInfo?.['ExtractionType'] || extractionInfo?.['SoftwareVersion'] || (extractionInfo?.['Model']?.includes('Raw') ? 'Raw Filesystem' : 'Cellebrite UFDR')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Counters Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                {[
                  { title: 'Conversations', count: stats?.chats || 0, sub: `${stats?.messages || 0} Decoded Messages`, icon: MessageSquare, color: 'var(--accent-cyan)' },
                  { title: 'Call Logs', count: stats?.calls || 0, sub: 'Phone, VoIP logs', icon: Phone, color: 'var(--accent-blue)' },
                  { title: 'Contacts Book', count: stats?.contacts || 0, sub: 'Extracted Names & IDs', icon: User, color: 'var(--accent-indigo)' },
                  { title: 'Files & Media', count: stats?.files || 0, sub: `${stats?.images || 0} Images, ${stats?.videos || 0} Videos`, icon: Folder, color: 'var(--accent-purple)' },
                  { title: 'Locations', count: stats?.locations || 0, sub: 'GPS Geotags & Towers', icon: MapPin, color: 'var(--color-success)' },
                  { title: 'Evidence Flagged', count: stats?.evidence || 0, sub: 'Pinned for investigation', icon: Tag, color: 'var(--color-warning)' }
                ].map((stat, i) => {
                  const Icon = stat.icon;
                  return (
                    <div key={i} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '20px' }}>
                      <div style={{ background: `rgba(255,255,255,0.03)`, border: `1px solid var(--border-color)`, padding: '12px', borderRadius: '12px' }}>
                        <Icon size={24} style={{ color: stat.color }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{stat.title}</div>
                        <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '4px', color: 'var(--text-primary)' }}>{stat.count}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{stat.sub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Specs & Hardware */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                {/* Hardware Spec */}
                <div className="glass-card">
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={16} style={{ color: 'var(--accent-cyan)' }} />
                    Target Hardware & OS
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <tbody>
                      {extractionInfo && Object.entries(extractionInfo).map(([key, value]: any, idx) => {
                        if (['UFDR Path', 'Database Recreated At'].includes(key)) return null;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '12px 0', color: 'var(--text-muted)', fontWeight: '500', width: '40%' }}>{key}</td>
                            <td style={{ padding: '12px 0', color: 'var(--text-primary)', fontWeight: '600' }}>{value}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Session Info — actual data only, no fabricated claims */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={16} style={{ color: 'var(--accent-indigo)' }} />
                    Session Info
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, justifyContent: 'center' }}>
                    <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Source Archive / Directory</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>
                        {extractionInfo?.['UFDR Path'] || 'N/A'}
                      </div>
                    </div>
                    <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Database Last Built</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                        {extractionInfo?.['Database Recreated At']
                          ? new Date(extractionInfo['Database Recreated At']).toLocaleString()
                          : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Conversations */}
          {activeTab === 'conversations' && (
            <div className="chat-container" style={{ height: 'calc(100vh - 150px)' }}>
              {/* Chat List sidebar */}
              <div className="chats-sidebar">
                <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Decoded Conversations</h3>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Search chats..."
                      value={chatSearch}
                      onChange={(e) => { setChatSearch(e.target.value); setChatsOffset(0); fetchChats(0, e.target.value); }}
                      className="input-field"
                      style={{ paddingLeft: '30px', fontSize: '12px', padding: '8px 8px 8px 28px' }}
                    />
                  </div>
                </div>
                <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {chats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => handleSelectChat(chat)}
                      style={{
                        padding: '16px',
                        border: 'none',
                        borderBottom: '1px solid var(--border-color)',
                        background: selectedChat?.id === chat.id ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        transition: 'all 0.2s ease',
                        borderLeft: selectedChat?.id === chat.id ? '4px solid var(--accent-cyan)' : '4px solid transparent'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', maxWidth: '75%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chat.name}
                        </span>
                        <span className="badge badge-outgoing" style={{ fontSize: '9px', padding: '1px 5px' }}>
                          {chat.source}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {chat.last_message || 'Media Attachment'}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        <span>{chat.message_count} messages</span>
                        <span>{chat.last_message_time ? new Date(chat.last_message_time).toLocaleDateString() : ''}</span>
                      </div>
                    </button>
                  ))}
                  {chatsHasMore && (
                    <button onClick={() => fetchChats(chatsOffset)} className="btn-secondary"
                      style={{ margin: '8px', fontSize: '11px', justifyContent: 'center' }}>
                      Load More Chats
                    </button>
                  )}
                </div>
              </div>

              {/* Active Chat Thread */}
              <div className="chat-history">
                {selectedChat ? (
                  <>
                    {/* Chat Header */}
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'rgba(16, 22, 38, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ fontSize: '15px', fontWeight: 'bold' }}>{selectedChat.name}</h4>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Source Channel: {selectedChat.source} | ID: {selectedChat.id}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          Participants: {(() => { try { return JSON.parse(selectedChat.participants || '[]').join(', '); } catch { return selectedChat.participants || ''; } })()}
                        </span>
                      </div>
                    </div>

                    {/* Messages bubbles area */}
                    <div style={{ flexGrow: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                      {chatMessages.map((msg) => {
                        const isOutgoing = (msg.direction || '').toLowerCase() === 'outgoing';
                        const isPinned = msg.is_evidence;
                        return (
                          <div
                            key={msg.id}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: isOutgoing ? 'flex-end' : 'flex-start',
                              marginBottom: '14px'
                            }}
                          >
                            {/* Message metadata (Sender name / Time) */}
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {!isOutgoing && <strong>{msg.sender_name}</strong>}
                               <span>{msg.timestamp ? new Date(msg.timestamp).toLocaleString() : 'N/A'}</span>
                            </span>

                            {/* Bubble Content */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', justifyContent: isOutgoing ? 'flex-end' : 'flex-start' }}>
                              {!isOutgoing && (
                                <button
                                  onClick={() => handleToggleEvidence('message', msg.id, isPinned, `${msg.sender_name}: ${msg.body}`)}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                  title={isPinned ? 'Remove evidence pin' : 'Pin as case evidence'}
                                >
                                  <Tag size={14} style={{ color: isPinned ? 'var(--color-warning)' : 'var(--text-muted)' }} />
                                </button>
                              )}

                              <div className={`message-bubble ${isOutgoing ? 'message-outgoing' : 'message-incoming'}`}>
                                <div>{msg.body}</div>

                                {/* Attachments inside bubbles */}
                                {msg.attachments && msg.attachments.length > 0 && (
                                  <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                                    {msg.attachments.map((att: any, idx: number) => {
                                      const isImg = att.type === 'image';
                                      return (
                                        <div
                                          key={idx}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            background: 'rgba(0,0,0,0.2)',
                                            padding: '8px',
                                            borderRadius: '6px',
                                            cursor: att.type !== 'database' ? 'pointer' : 'default'
                                          }}
                                          onClick={() => {
                                            if (att.type !== 'database') {
                                              setPreviewMedia(att);
                                            }
                                          }}
                                        >
                                          {isImg ? (
                                            <div style={{ position: 'relative', width: '80px', height: '60px', borderRadius: '4px', overflow: 'hidden', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }}>
                                              <img
                                                src={`${API_BASE}/media?path=${encodeURIComponent(att.path)}`}
                                                alt={att.filename}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                              />
                                            </div>
                                          ) : (
                                            <div style={{ background: 'var(--bg-tertiary)', padding: '8px', borderRadius: '4px' }}>
                                              {att.type === 'database' ? (
                                                <Database size={20} style={{ color: 'var(--accent-cyan)' }} />
                                              ) : (
                                                <FileText size={20} style={{ color: 'var(--text-muted)' }} />
                                              )}
                                            </div>
                                          )}
                                          <div style={{ flexGrow: 1 }}>
                                            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', wordBreak: 'break-all' }}>{att.filename}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                              {((att.size || 0) / 1024).toFixed(1)} KB | {(att.type || 'file').toUpperCase()}
                                            </div>
                                          </div>
                                          {isImg && <Eye size={14} style={{ color: 'var(--text-muted)', marginRight: '6px' }} />}
                                          {!isImg && att.type === 'database' && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveTab('sqlite');
                                                handleSelectSqlite(att.path);
                                              }}
                                              className="btn-primary"
                                              style={{ padding: '4px 8px', fontSize: '10px', gap: '4px' }}
                                            >
                                              Browse DB <ExternalLink size={10} />
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {isOutgoing && (
                                <button
                                  onClick={() => handleToggleEvidence('message', msg.id, isPinned, `${msg.sender_name}: ${msg.body}`)}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                  title={isPinned ? 'Remove evidence pin' : 'Pin as case evidence'}
                                >
                                  <Tag size={14} style={{ color: isPinned ? 'var(--color-warning)' : 'var(--text-muted)' }} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {msgHasMore && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px' }}>
                          <button onClick={() => handleSelectChat(selectedChat, msgOffset)} className="btn-secondary"
                            style={{ fontSize: '12px' }}>
                            Load older messages ({selectedChat.message_count - msgOffset} remaining)
                          </button>
                        </div>
                      )}
                      <div ref={messageEndRef} />
                    </div>
                  </>
                ) : (
                  <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                    <MessageSquare size={48} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>Select a conversation from the sidebar to inspect logs.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Call Logs */}
          {activeTab === 'calls' && (
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Call Logs</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ display: 'flex', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-color)' }}>
                    {['all', 'incoming', 'outgoing', 'missed'].map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setCallFilter(filter)}
                        style={{
                          padding: '6px 12px',
                          border: 'none',
                          background: callFilter === filter ? 'var(--bg-tertiary)' : 'transparent',
                          color: callFilter === filter ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          textTransform: 'uppercase'
                        }}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                  <div style={{ position: 'relative', width: '220px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Search phone number..."
                      value={callSearch}
                      onChange={(e) => setCallSearch(e.target.value)}
                      className="input-field"
                      style={{ paddingLeft: '36px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Pin</th>
                      <th>Direction</th>
                      <th>Contact Name / Number</th>
                      <th>Call Source</th>
                      <th>Timestamp</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((call) => {
                      const isPinned = call.is_evidence;
                      const dir = (call.direction || '').toLowerCase();
                      let badgeClass = 'badge-incoming';
                      if (dir === 'outgoing') badgeClass = 'badge-outgoing';
                      if (dir === 'missed') badgeClass = 'badge-missed';

                      return (
                        <tr key={call.id}>
                          <td>
                            <button
                              onClick={() => handleToggleEvidence('call', call.id, isPinned, `${call.direction} Call: ${call.party_name}`)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >
                              <Tag size={16} style={{ color: isPinned ? 'var(--color-warning)' : 'var(--text-muted)' }} />
                            </button>
                          </td>
                          <td>
                            <span className={`badge ${badgeClass}`}>{call.direction}</span>
                          </td>
                          <td style={{ fontWeight: '600' }}>
                            <div>{call.party_name}</div>
                            {call.party_identifier && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{call.party_identifier}</div>
                            )}
                          </td>
                          <td>{call.source}</td>
                          <td>{call.timestamp ? new Date(call.timestamp).toLocaleString() : 'N/A'}</td>
                          <td>{!call.duration || call.duration === '0' ? '-' : `${call.duration}s`}</td>
                        </tr>
                      );
                    })}
                    {calls.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                          No call logs found matching filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 4: Contacts */}
          {activeTab === 'contacts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Extracted Address Book</h3>
                <div style={{ position: 'relative', width: '280px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search contacts by name..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '36px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                {contacts.map((contact) => (
                  <div key={contact.id} className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px' }}>
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--bg-tertiary)', overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {contact.photo_path ? (
                        <img
                          src={`${API_BASE}/media?path=${encodeURIComponent(contact.photo_path)}`}
                          alt={contact.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <User size={20} style={{ color: 'var(--text-muted)' }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-primary)' }}>{contact.name || 'Unknown'}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', wordBreak: 'break-all' }}>{contact.identifier || '-'}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                        <span style={{ fontSize: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--accent-cyan)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          {contact.type}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {contacts.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No contacts found.
                  </div>
                )}
                {contactsHasMore && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                    <button onClick={() => fetchContacts(contactsOffset)} className="btn-secondary" style={{ fontSize: '12px' }}>
                      Load More Contacts
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 5: Timeline */}
          {activeTab === 'timeline' && (
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Unified Forensic Timeline</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <select
                    value={timelineType}
                    onChange={(e) => setTimelineType(e.target.value)}
                    className="input-field"
                    style={{ width: '140px' }}
                  >
                    <option value="all">All Events</option>
                    <option value="message">Messages Only</option>
                    <option value="call">Calls Only</option>
                    <option value="location">Locations Only</option>
                    <option value="file">Files Created</option>
                  </select>
                  <div style={{ position: 'relative', width: '220px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Filter timeline text..."
                      value={timelineSearch}
                      onChange={(e) => setTimelineSearch(e.target.value)}
                      className="input-field"
                      style={{ paddingLeft: '36px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Timeline list */}
              <div style={{ display: 'flex', flexDirection: 'column', position: 'relative', borderLeft: '2px solid var(--bg-tertiary)', marginLeft: '12px', paddingLeft: '24px', gap: '20px' }}>
                {timelineEvents.map((evt, idx) => {
                  const isPinned = evt.is_evidence;
                  let iconBg = 'var(--accent-cyan)';
                  let Icon = MessageSquare;

                  if (evt.event_type === 'call') {
                    Icon = Phone;
                    iconBg = 'var(--accent-blue)';
                  } else if (evt.event_type === 'location') {
                    Icon = MapPin;
                    iconBg = 'var(--color-success)';
                  } else if (evt.event_type === 'file') {
                    Icon = Folder;
                    iconBg = 'var(--accent-purple)';
                  }

                  return (
                    <div key={idx} style={{ position: 'relative', animation: 'fadeIn 0.25s ease-out' }}>
                      {/* Timeline dot */}
                      <div style={{
                        position: 'absolute',
                        left: '-37px',
                        top: '4px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: iconBg,
                        border: '4px solid var(--bg-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <Icon size={10} style={{ color: '#090d16' }} />
                      </div>

                      <div className="glass-card" style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>
                            {evt.timestamp ? new Date(evt.timestamp).toLocaleString() : 'No Timestamp'}
                          </span>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span className="badge" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '9px' }}>
                              {evt.event_type}
                            </span>
                            <button
                              onClick={() => handleToggleEvidence(evt.event_type, evt.id, isPinned, evt.text)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                            >
                              <Tag size={12} style={{ color: isPinned ? 'var(--color-warning)' : 'var(--text-muted)' }} />
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '6px', color: 'var(--text-primary)' }}>
                          {evt.text}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                          {evt.detail_1 && <span>Info: {evt.detail_1}</span>}
                          {evt.detail_2 && <span>Channel: {evt.detail_2}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {timelineEvents.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>
                    No timeline items found matching selection.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 6: Media Gallery */}
          {activeTab === 'media' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Media & Files</h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <select
                    value={fileTypeFilter}
                    onChange={(e) => setFileTypeFilter(e.target.value)}
                    className="input-field"
                    style={{ width: '140px' }}
                  >
                    <option value="all">All File Types</option>
                    <option value="image">Images</option>
                    <option value="video">Videos</option>
                    <option value="document">Documents</option>
                    <option value="database">SQLite DBs</option>
                  </select>
                  <div style={{ position: 'relative', width: '220px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      placeholder="Search files by name..."
                      value={fileSearch}
                      onChange={(e) => setFileSearch(e.target.value)}
                      className="input-field"
                      style={{ paddingLeft: '36px' }}
                    />
                  </div>
                </div>
              </div>

              {/* Grid of Files */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                {files.map((file) => {
                  const isImg = file.type === 'image';
                  const isDb = file.type === 'database';
                  const isPinned = file.is_evidence;

                  return (
                    <div
                      key={file.id}
                      className="glass-card"
                      style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', height: '240px', justifyContent: 'space-between', position: 'relative' }}
                    >
                      {/* Evidence Tag Pin */}
                      <button
                        onClick={() => handleToggleEvidence('file', file.id, isPinned, `File: ${file.filename}`)}
                        style={{ position: 'absolute', right: '12px', top: '12px', zIndex: 5, background: 'rgba(2, 6, 23, 0.6)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                      >
                        <Tag size={12} style={{ color: isPinned ? 'var(--color-warning)' : 'var(--text-muted)' }} />
                      </button>

                      {/* File visual wrapper */}
                      <div
                        style={{ height: '110px', background: 'var(--bg-tertiary)', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !isDb ? 'pointer' : 'default', border: '1px solid rgba(255,255,255,0.02)' }}
                        onClick={() => {
                          if (!isDb) setPreviewMedia(file);
                        }}
                      >
                        {isImg ? (
                          <img
                            src={`${API_BASE}/media?path=${encodeURIComponent(file.path)}`}
                            alt={file.filename}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : isDb ? (
                          <Database size={36} style={{ color: 'var(--accent-cyan)' }} />
                        ) : (
                          <FileText size={36} style={{ color: 'var(--text-muted)' }} />
                        )}
                      </div>

                      {/* File Details */}
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', color: 'var(--text-primary)' }} title={file.filename}>
                          {file.filename}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{(file.size / 1024).toFixed(1)} KB</span>
                          <span style={{ textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>{file.type}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {!isDb && (
                          <button
                            onClick={() => setPreviewMedia(file)}
                            className="btn-secondary"
                            style={{ flexGrow: 1, padding: '4px', fontSize: '11px', justifyContent: 'center', gap: '4px' }}
                          >
                            <Eye size={12} /> Preview
                          </button>
                        )}
                        {isDb && (
                          <button
                            onClick={() => {
                              setActiveTab('sqlite');
                              handleSelectSqlite(file.path);
                            }}
                            className="btn-primary"
                            style={{ flexGrow: 1, padding: '4px', fontSize: '11px', justifyContent: 'center', gap: '4px' }}
                          >
                            Explore <ExternalLink size={12} />
                          </button>
                        )}
                        <a
                          href={`${API_BASE}/media?path=${encodeURIComponent(file.path)}`}
                          download={file.filename}
                          className="btn-secondary"
                          style={{ padding: '6px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                        >
                          <Download size={12} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
              {filesHasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '16px' }}>
                  <button onClick={() => fetchFiles(filesOffset)} className="btn-secondary" style={{ fontSize: '12px' }}>
                    Load More Files
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 7: Locations (Map) */}
          {activeTab === 'locations' && (
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '30px' }}>
              {/* Coordinates List */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '550px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 'bold', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Geotag logs</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1 }}>
                  {locations.map((loc) => {
                    const isPinned = loc.is_evidence;
                    return (
                      <button
                        key={loc.id}
                        onClick={() => setSelectedLocation(loc)}
                        style={{
                          padding: '12px',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          background: selectedLocation?.id === loc.id ? 'rgba(0,242,254,0.06)' : 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          borderLeft: selectedLocation?.id === loc.id ? '3px solid var(--accent-cyan)' : '1px solid var(--border-color)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(loc.timestamp).toLocaleString()}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {isPinned && <Tag size={10} style={{ color: 'var(--color-warning)' }} />}
                            <span style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--accent-cyan)' }}>{loc.source}</span>
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{loc.address || 'GPS Coordinates'}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {loc.latitude}, {loc.longitude}
                        </div>
                      </button>
                    );
                  })}
                  {locationsHasMore && (
                    <button onClick={() => fetchLocations(locationsOffset)} className="btn-secondary"
                      style={{ fontSize: '11px', justifyContent: 'center', marginTop: '8px' }}>
                      Load More Locations
                    </button>
                  )}
                </div>
              </div>

              {/* Map embed iframe */}
              <div className="map-container">
                {renderOfflineMap()}
              </div>
            </div>
          )}

          {/* Tab 8: SQLite Viewer */}
          {activeTab === 'sqlite' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <Database size={24} style={{ color: 'var(--accent-cyan)' }} />
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 'bold' }}>SQLite Database Explorer</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Analyze raw SQLite relational databases extracted inside the UFDR archive.
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Target DB:</span>
                  <select
                    value={selectedSqlitePath}
                    onChange={(e) => handleSelectSqlite(e.target.value)}
                    className="input-field"
                    style={{ width: '250px' }}
                  >
                    <option value="">-- Choose SQLite File --</option>
                    {sqliteFiles.map((f, i) => (
                      <option key={i} value={f.path}>{f.filename}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedSqlitePath ? (
                <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '24px' }}>
                  {/* Tables list */}
                  <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '500px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>DATABASE TABLES</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', flexGrow: 1 }}>
                      {sqliteTables.map((tbl, i) => (
                        <button
                          key={i}
                          onClick={() => handleSelectSqliteTable(selectedSqlitePath, tbl, 0)}
                          style={{
                            padding: '10px 12px',
                            border: 'none',
                            borderRadius: '6px',
                            background: selectedSqliteTable === tbl ? 'rgba(99,102,241,0.15)' : 'transparent',
                            color: selectedSqliteTable === tbl ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: selectedSqliteTable === tbl ? '600' : '500'
                          }}
                        >
                          {tbl}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Schema + Rows Grid */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', overflow: 'hidden' }}>
                    {selectedSqliteTable ? (
                      <>
                        {/* Table Header & Pagination */}
                        <div className="glass-card" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '13px' }}>
                            Browsing table: <strong style={{ color: 'var(--accent-cyan)' }}>{selectedSqliteTable}</strong>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '10px' }}>({sqliteTotalCount} total rows)</span>
                          </div>

                          {/* Pagination controls */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                              disabled={sqlitePage === 0}
                              onClick={() => handleSelectSqliteTable(selectedSqlitePath, selectedSqliteTable, sqlitePage - 1)}
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '11px', opacity: sqlitePage === 0 ? 0.5 : 1 }}
                            >
                              Prev
                            </button>
                            <span style={{ fontSize: '12px' }}>Page {sqlitePage + 1}</span>
                            <button
                              disabled={(sqlitePage + 1) * sqliteLimit >= sqliteTotalCount}
                              onClick={() => handleSelectSqliteTable(selectedSqlitePath, selectedSqliteTable, sqlitePage + 1)}
                              className="btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '11px', opacity: (sqlitePage + 1) * sqliteLimit >= sqliteTotalCount ? 0.5 : 1 }}
                            >
                              Next
                            </button>
                          </div>
                        </div>

                        {/* Schema PRAGMA panel */}
                        <div className="glass-card" style={{ padding: '16px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold', width: '100%', marginBottom: '4px' }}>COLUMN SCHEMAS:</span>
                          {sqliteColumns.map((col, idx) => (
                            <span key={idx} style={{ fontSize: '11px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '3px 8px', borderRadius: '4px', color: 'var(--text-primary)' }}>
                              <strong>{col.name}</strong> <span style={{ color: 'var(--accent-cyan)' }}>{col.type}</span>
                            </span>
                          ))}
                        </div>

                        {/* Data grid */}
                        <div className="table-container" style={{ overflow: 'auto', maxHeight: '400px' }}>
                          <table className="custom-table" style={{ width: 'max-content', minWidth: '100%' }}>
                            <thead>
                              <tr>
                                {sqliteColumns.map((col, idx) => (
                                  <th key={idx}>{col.name}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sqliteRows.map((row, rowIdx) => (
                                <tr key={rowIdx}>
                                  {sqliteColumns.map((col, colIdx) => (
                                    <td key={colIdx} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                                      {row[col.name] !== null ? row[col.name].toString() : <span style={{ color: 'var(--text-muted)' }}>NULL</span>}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="glass-card" style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                        Select a table to browse its data rows.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-card" style={{ display: 'flex', height: '300px', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
                  <Database size={40} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>Select a SQLite database file from the dropdown above to explore.</span>
                </div>
              )}
            </div>
          )}

          {/* Tab 9: Flagged Evidence / Pinned Report */}
          {activeTab === 'evidence' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              <div className="glass-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Evidence Report Builder</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Review flagged case artifacts and compile/print a courtroom-ready report.
                  </p>
                </div>
                <button
                  onClick={() => window.print()}
                  className="btn-primary"
                  style={{ gap: '8px' }}
                >
                  <FileText size={16} /> Print Case Report
                </button>
              </div>

              {/* Printable Area Wrapper */}
              <div className="glass-card printable-report" style={{ padding: '40px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                {/* Printable Header (Visible in print layout) */}
                <div className="print-header" style={{ marginBottom: '30px', borderBottom: '2px solid var(--accent-cyan)', paddingBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h1 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--text-primary)' }}>LAW ENFORCEMENT DIGITAL EVIDENCE REPORT</h1>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>GENERATED VIA CELLSIGHT PA DECODER</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className="badge badge-incoming" style={{ fontSize: '10px', padding: '4px 10px' }}>CONFIDENTIAL</span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '20px', fontSize: '12px' }}>
                    <div><strong>Case ID:</strong> {extractionInfo?.['CaseNumber'] || 'CASE-2026-NARC-089'}</div>
                    <div><strong>Investigator:</strong> {extractionInfo?.['Investigator'] || 'Officer Marc'}</div>
                    <div><strong>Device:</strong> {extractionInfo?.['Model']} ({extractionInfo?.['OS']})</div>
                    <div><strong>IMEI / Serial:</strong> {extractionInfo?.['IMEI']} / {extractionInfo?.['Serial']}</div>
                    <div><strong>Extraction Time:</strong> {extractionInfo?.['ExtractionTime'] ? new Date(extractionInfo['ExtractionTime']).toLocaleString() : 'N/A'}</div>
                    <div><strong>Report Compiled:</strong> {new Date().toLocaleString()}</div>
                  </div>
                </div>

                <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px', color: 'var(--accent-cyan)' }}>INDEX OF FLAGGED ARTIFACTS ({evidenceList.length} items)</h2>

                <div className="table-container">
                  <table className="custom-table" style={{ background: 'transparent' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '80px' }}>Type</th>
                        <th style={{ width: '220px' }}>Artifact Identifier / Source</th>
                        <th>Evidence Content / Snippet</th>
                        <th>Investigator Analysis / Notes</th>
                        <th style={{ width: '60px' }}>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evidenceList.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className="badge" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', fontSize: '9px' }}>
                              {item.artifact_type}
                            </span>
                          </td>
                          <td style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                            <div>ID: {item.artifact_id}</div>
                            {item.metadata && (
                              <div style={{ fontSize: '10px', color: 'var(--accent-cyan)', marginTop: '2px' }}>Channel: {item.metadata}</div>
                            )}
                          </td>
                          <td style={{ fontWeight: '500', fontSize: '13px' }}>
                            {item.snippet}
                          </td>
                          <td>
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '12px', minHeight: '40px' }}>
                              {item.notes || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No notes provided.</span>}
                            </div>
                          </td>
                          <td>
                            <button
                              onClick={() => handleToggleEvidence(item.artifact_type, item.artifact_id, true)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}
                              title="Delete tag"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {evidenceList.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            No evidence items have been flagged yet. Tag items in Chats, Calls, and Files.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Report Signoff (Visible in print layout) */}
                <div style={{ marginTop: '50px', borderTop: '1px solid var(--border-color)', paddingTop: '30px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '50px', fontSize: '13px' }}>
                  <div>
                    <div style={{ height: '50px', borderBottom: '1px solid var(--text-muted)' }}></div>
                    <div style={{ marginTop: '8px', fontWeight: 'bold' }}>Officer / Investigator Signature</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Date: ________________________</div>
                  </div>
                  <div>
                    <div style={{ height: '50px', borderBottom: '1px solid var(--text-muted)' }}></div>
                    <div style={{ marginTop: '8px', fontWeight: 'bold' }}>Supervisor Signature</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Date: ________________________</div>
                  </div>
                </div>
              </div>
            </div>
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
                    placeholder="e.g. mock_extraction.ufdr or /path/to/raw_dump"
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
                  <div style={{ fontSize: '12px', fontWeight: 'bold' }}>Demonstration Mode</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Type <code style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>mock_extraction.ufdr</code> or <code style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>mock_extraction_dir</code> to load the test extraction (zipped or unzipped)!
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
                    const ext = (previewMedia.filename || '').split('.').pop()?.toLowerCase() || '';
                    const isImg = previewMedia.type === 'image';
                    const isVideo = previewMedia.type === 'video';
                    const isAudio = previewMedia.type === 'audio';
                    const isPdf = ext === 'pdf';
                    const isText = ['txt', 'json', 'xml', 'html', 'log', 'plist', 'ini', 'csv', 'yaml', 'yml'].includes(ext);

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
