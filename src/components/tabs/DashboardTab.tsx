/* eslint-disable @typescript-eslint/no-explicit-any */
import { Shield, Folder, Phone, MapPin, Tag, Database, MessageSquare, User } from 'lucide-react';


export default function DashboardTab(props: any) {
  const { extractionInfo, stats } = props;

  return (
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

              {/* Stats Counters  */}
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
  );
}
