/* eslint-disable @typescript-eslint/no-explicit-any */
import { Tag, Search } from 'lucide-react';


export default function CallsTab(props: any) {
  const {
    callFilter,
    setCallFilter,
    callSearch,
    setCallSearch,
    calls,
    handleToggleEvidence
  } = props;

  return (
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
                    {calls.map((call: any) => {
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
  );
}
