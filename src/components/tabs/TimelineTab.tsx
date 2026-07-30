/* eslint-disable @typescript-eslint/no-explicit-any */
import { Search, Folder, Phone, MapPin, Tag, MessageSquare } from 'lucide-react';


export default function TimelineTab(props: any) {
  const {
    timelineType,
    setTimelineType,
    timelineSearch,
    setTimelineSearch,
    timelineEvents,
    handleToggleEvidence
  } = props;

  return (
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
                {timelineEvents.map((evt: any, idx: number) => {
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
  );
}
