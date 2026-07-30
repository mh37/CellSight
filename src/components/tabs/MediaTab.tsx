/* eslint-disable @typescript-eslint/no-explicit-any */
import { Search, FileText, Tag, Database, ExternalLink, Eye, Download } from 'lucide-react';
import { API_BASE } from '../../App';


export default function MediaTab(props: any) {
  const {
    fileTypeFilter,
    setFileTypeFilter,
    fileSearch,
    setFileSearch,
    files,
    handleToggleEvidence,
    setPreviewMedia,
    setActiveTab,
    handleSelectSqlite,
    filesHasMore,
    fetchFiles,
    filesOffset
  } = props;

  return (
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

              {/*  of Files */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                {files.map((file: any) => {
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
  );
}
