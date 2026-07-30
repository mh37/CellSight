/* eslint-disable @typescript-eslint/no-explicit-any */
import { Database } from 'lucide-react';


export default function SqliteTab(props: any) {
  const {
    selectedSqlitePath,
    handleSelectSqlite,
    sqliteFiles,
    sqliteTables,
    selectedSqliteTable,
    handleSelectSqliteTable,
    sqliteTotalCount,
    sqlitePage,
    sqliteLimit,
    sqliteColumns,
    sqliteRows
  } = props;

  return (
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
                    {sqliteFiles.map((f: any, i: number) => (
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
                      {sqliteTables.map((tbl: any, i: number) => (
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

                  {/* Schema + Rows  */}
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
                          {sqliteColumns.map((col: any, idx: number) => (
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
                                {sqliteColumns.map((col: any, idx: number) => (
                                  <th key={idx}>{col.name}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {sqliteRows.map((row: any, rowIdx: number) => (
                                <tr key={rowIdx}>
                                  {sqliteColumns.map((col: any, colIdx: number) => (
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
  );
}
