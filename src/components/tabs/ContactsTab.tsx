/* eslint-disable @typescript-eslint/no-explicit-any */
import { Search, User } from 'lucide-react';
import { API_BASE } from '../../App';


export default function ContactsTab(props: any) {
  const {
    contactSearch,
    setContactSearch,
    contacts,
    contactsHasMore,
    fetchContacts,
    contactsOffset
  } = props;

  return (
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
                {contacts.map((contact: any) => (
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
  );
}
