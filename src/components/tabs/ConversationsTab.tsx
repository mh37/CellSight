/* eslint-disable @typescript-eslint/no-explicit-any */
import { Search, Eye, FileText, Tag, Database, MessageSquare, ExternalLink } from 'lucide-react';
import { API_BASE } from '../../App';


export default function ConversationsTab(props: any) {
  const {
    chatSearch,
    setChatSearch,
    setChatsOffset,
    fetchChats,
    chats,
    selectedChat,
    handleSelectChat,
    chatsHasMore,
    chatsOffset,
    chatMessages,
    handleToggleEvidence,
    setPreviewMedia,
    setActiveTab,
    handleSelectSqlite,
    msgHasMore,
    msgOffset,
    messageEndRef
  } = props;

  return (
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
                  {chats.map((chat: any) => (
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
                      {chatMessages.map((msg: any) => {
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
  );
}
