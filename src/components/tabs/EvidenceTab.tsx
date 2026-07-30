/* eslint-disable @typescript-eslint/no-explicit-any */
import { Trash2, FileText } from 'lucide-react';
import { API_BASE } from '../../App';


export default function EvidenceTab(props: any) {
  const {
    extractionInfo,
    evidenceList,
    handleToggleEvidence
  } = props;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
              <div className="glass-card" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 'bold' }}>Evidence Report Builder</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Review flagged case artifacts and compile/print a courtroom-ready report.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const a = document.createElement('a');
                    a.href = `${API_BASE}/report/export`;
                    a.download = 'Forensic_Report.html';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                  className="btn-primary"
                  style={{ gap: '8px' }}
                >
                  <FileText size={16} /> Export HTML Report
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
                      {evidenceList.map((item: any) => (
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
                            No evidence items have been flagged yet.  items in Chats, Calls, and Files.
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
  );
}
