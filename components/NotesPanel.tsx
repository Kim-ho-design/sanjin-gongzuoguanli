'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { PixelLoader } from './Pixel';
import { weekdayCn } from '@/lib/utils';
import type { Note } from '@/lib/notes';

function monthStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr(): string {
  return `${monthStr(new Date())}-${String(new Date().getDate()).padStart(2, '0')}`;
}

/** 月份加减：'2026-01' - 1 → '2025-12' */
export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5));
  const d = new Date(y, m - 1 + delta, 1);
  return monthStr(d);
}

interface Session {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatMsg {
  id: number;
  session_id: number;
  role: 'user' | 'assistant';
  content: string;
}

/** 「✦ AI 复盘上月」自动发送的首条消息（复盘对象永远是上一个完整月份，当月复盘走自由对话） */
function reviewPrompt(): string {
  const [y, m] = shiftMonth(monthStr(new Date()), -1).split('-');
  return `帮我复盘 ${y} 年 ${Number(m)} 月做过的事：归纳主题、点明反复出现的模式、给 2~3 条可执行建议`;
}

/** 随手记浮窗：记（日期+一句话）、按月翻看、AI 复盘对话（v20 起对话式） */
export default function NotesPanel({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [month, setMonth] = useState(monthStr(new Date()));
  const [notes, setNotes] = useState<Note[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [text, setText] = useState('');
  const [date, setDate] = useState(todayStr());
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<'list' | 'chat'>('list');
  const inputRef = useRef<HTMLInputElement>(null);

  // ---- 复盘对话状态 ----
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async (m: string) => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/notes?month=${m}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { notes: Note[] };
      setNotes(d.notes);
    } catch {
      onToast('随手记加载失败，请重试');
    } finally {
      setListLoading(false);
    }
  }, [onToast]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/notes/chat/sessions', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const d = (await res.json()) as { sessions: Session[] };
      setSessions(d.sessions);
    } catch {
      onToast('会话列表加载失败，请重试');
    }
  }, [onToast]);

  const loadMessages = useCallback(
    async (sid: number) => {
      setMsgsLoading(true);
      try {
        const res = await fetch(`/api/notes/chat/sessions/${sid}`, { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const d = (await res.json()) as { messages: ChatMsg[] };
        setMessages(d.messages);
      } catch {
        onToast('消息加载失败，请重试');
      } finally {
        setMsgsLoading(false);
      }
    },
    [onToast],
  );

  useEffect(() => {
    load(month);
  }, [month, load]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 进入对话视图时拉会话列表
  useEffect(() => {
    if (view === 'chat') loadSessions();
  }, [view, loadSessions]);

  // 新消息自动滚到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, view]);

  async function add() {
    const content = text.trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, note_date: date }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; note?: Note };
      if (!res.ok || !d.note) throw new Error(d.error || '保存失败');
      setText('');
      // 记到别的月份时切过去，保证用户立刻看到自己刚记的内容
      const noteMonth = d.note.note_date.slice(0, 7);
      if (noteMonth !== month) setMonth(noteMonth);
      else setNotes((ns) => [d.note as Note, ...ns]);
      onToast('已记下');
    } catch (e) {
      onToast(e instanceof Error ? `记下失败：${e.message}` : '记下失败，请重试');
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: number) {
    const prev = notes;
    setNotes((ns) => ns.filter((n) => n.id !== id));
    const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setNotes(prev);
      onToast('删除失败，请重试');
    }
  }

  // ---- 复盘对话 ----

  /** 本地乐观消息的负数 id，避免与库 id 冲突 */
  const localIdRef = useRef(0);

  async function send(content: string, sessionId: number | null) {
    const msg = content.trim();
    if (!msg || sending) return;
    setSending(true);
    setMessages((ms) => [
      ...ms,
      { id: --localIdRef.current, session_id: sessionId ?? 0, role: 'user', content: msg },
    ]);
    try {
      const res = await fetch('/api/notes/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, ...(sessionId ? { session_id: sessionId } : {}) }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        reply?: string;
        session_id?: number;
      };
      if (!res.ok || !d.reply || !d.session_id) throw new Error(d.error || '发送失败');
      setActiveSession(d.session_id);
      setMessages((ms) => [
        ...ms,
        { id: --localIdRef.current, session_id: d.session_id as number, role: 'assistant', content: d.reply as string },
      ]);
      loadSessions(); // 新会话拿到标题后刷新列表
    } catch (e) {
      onToast(e instanceof Error ? `发送失败：${e.message}` : '发送失败，请重试');
      // 失败回滚乐观气泡：有会话则重取，无会话（新建失败）则清空
      if (sessionId) loadMessages(sessionId);
      else setMessages([]);
    } finally {
      setSending(false);
    }
  }

  function sendCurrent() {
    const content = chatInput;
    setChatInput('');
    send(content, activeSession);
  }

  /** ✦ AI 复盘上月：切到对话视图，自动新建会话发问 */
  function aiReview() {
    setView('chat');
    setActiveSession(null);
    setMessages([]);
    send(reviewPrompt(), null);
  }

  function newChat() {
    setActiveSession(null);
    setMessages([]);
    setChatInput('');
    chatInputRef.current?.focus();
  }

  function selectSession(sid: number) {
    if (sid === activeSession) return;
    setActiveSession(sid);
    setMessages([]);
    loadMessages(sid);
  }

  async function removeSession(sid: number) {
    const prev = sessions;
    setSessions((ss) => ss.filter((s) => s.id !== sid));
    const res = await fetch(`/api/notes/chat/sessions/${sid}`, { method: 'DELETE' });
    if (!res.ok) {
      setSessions(prev);
      onToast('删除会话失败，请重试');
      return;
    }
    if (activeSession === sid) {
      setActiveSession(null);
      setMessages([]);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" onClick={onClose}>
      {/* 浮窗：移动端贴底、桌面居中 */}
      <div className="absolute inset-0 flex items-end md:items-center justify-center p-3 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-[#FAF9F6] border border-line rounded-t-3xl md:rounded-3xl shadow-pop pop-enter flex flex-col max-h-[86dvh] md:max-h-[80vh] overflow-hidden md:max-w-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 移动端抓手 */}
          <div className="md:hidden w-10 h-1 rounded-full bg-line mx-auto mt-2.5 mb-1" />

          {/* 标题行 */}
          <div className="flex items-center gap-2 px-4 md:px-5 pt-3 md:pt-4 pb-3">
            <h2 className="text-base font-bold tracking-tight">随手记</h2>
            <span className="text-[10px] font-mono text-ink-faint tracking-wider">
              {view === 'chat' ? 'WORK REVIEW' : 'WORK NOTES'}
            </span>
            {view === 'list' && (
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setMonth((m) => shiftMonth(m, -1))}
                  className="w-6 h-6 rounded-md text-ink-faint hover:text-kimi-600 hover:bg-kimi-50 text-sm leading-none"
                  title="上个月"
                >
                  ‹
                </button>
                <span className="text-xs font-mono text-ink-soft w-[4.5em] text-center">{month}</span>
                <button
                  onClick={() => setMonth((m) => shiftMonth(m, 1))}
                  className="w-6 h-6 rounded-md text-ink-faint hover:text-kimi-600 hover:bg-kimi-50 text-sm leading-none"
                  title="下个月"
                >
                  ›
                </button>
              </div>
            )}
            {view === 'chat' && (
              <button
                onClick={() => setView('list')}
                className="ml-auto text-xs text-ink-soft hover:text-kimi-600 border border-line rounded-full px-3 py-1 transition-colors"
              >
                ← 返回列表
              </button>
            )}
            <button onClick={onClose} className="text-ink-faint hover:text-ink text-lg leading-none px-1" title="关闭">
              ×
            </button>
          </div>

          {view === 'chat' ? (
            <div className="flex-1 flex flex-col md:flex-row min-h-[40vh] overflow-hidden">
              {/* 会话列表：移动端顶部横向 chips，桌面左侧栏 */}
              <div className="shrink-0 border-b md:border-b-0 md:border-r border-line bg-white/60">
                <div className="flex items-center gap-1 px-3 pt-2 md:pt-3">
                  <button
                    onClick={newChat}
                    className="shrink-0 text-xs text-kimi-600 border border-kimi-200 hover:bg-kimi-50 rounded-full px-2.5 py-1 transition-colors"
                  >
                    ＋ 新对话
                  </button>
                </div>
                <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-hidden md:overflow-y-auto px-3 py-2 max-w-full md:w-44 md:max-h-[52vh]">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => selectSession(s.id)}
                      className={`group flex items-center gap-1 shrink-0 md:shrink rounded-lg px-2.5 py-1.5 cursor-pointer text-xs border transition-colors ${
                        s.id === activeSession
                          ? 'bg-kimi-50 border-kimi-200 text-kimi-700'
                          : 'bg-white border-line text-ink-soft hover:border-kimi-300'
                      }`}
                    >
                      <span className="truncate max-w-[10em] md:max-w-none">{s.title || '（未命名）'}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSession(s.id);
                        }}
                        title="删除会话"
                        className="shrink-0 w-4 h-4 rounded text-ink-faint hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {sessions.length === 0 && (
                    <p className="text-[10px] text-ink-faint font-mono tracking-widest px-1 py-1">NO SESSIONS</p>
                  )}
                </div>
              </div>

              {/* 消息区 + 输入 */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 overflow-y-auto px-4 md:px-5 py-3 flex flex-col gap-2.5">
                  {msgsLoading ? (
                    <p className="text-xs text-ink-faint text-center py-10 font-mono tracking-widest">LOADING…</p>
                  ) : messages.length === 0 && !sending ? (
                    <div className="m-auto text-center max-w-[26em]">
                      <p className="text-[13px] text-ink-soft leading-relaxed">
                        向 AI 复盘你的工作。它会读到真实的项目、任务、日志和随手记数据，可以归纳主题、发现反复出现的模式、给可执行建议。
                      </p>
                      <p className="text-[11px] text-ink-faint mt-2 font-mono">
                        例：本月我完成了哪些事？哪些问题反复出现？
                      </p>
                    </div>
                  ) : (
                    messages.map((m) =>
                      m.role === 'user' ? (
                        <div key={m.id} className="flex justify-end">
                          <div className="max-w-[85%] bg-kimi-500 text-white rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words shadow-btn">
                            {m.content}
                          </div>
                        </div>
                      ) : (
                        <div key={m.id} className="flex justify-start">
                          <div className="max-w-[92%] bg-white border border-line rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] leading-relaxed text-ink break-words">
                            <div className="report-md">
                              <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      ),
                    )
                  )}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-line rounded-2xl rounded-bl-md px-3.5 py-2.5">
                        <PixelLoader />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* 输入区 */}
                <div className="border-t border-line bg-white/70 px-4 md:px-5 py-3 flex items-end gap-2">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendCurrent();
                      }
                      if (e.key === 'Escape') onClose();
                    }}
                    placeholder="问问你的工作：Enter 发送，Shift+Enter 换行"
                    maxLength={2000}
                    rows={2}
                    className="input-dark flex-1 text-[13px] px-3 py-2 min-w-0 resize-none leading-relaxed"
                  />
                  <button
                    onClick={sendCurrent}
                    disabled={!chatInput.trim() || sending}
                    className="shrink-0 text-[13px] bg-kimi-500 hover:bg-kimi-600 text-white rounded-lg px-4 py-2 font-medium transition-colors disabled:opacity-40 shadow-btn"
                  >
                    {sending ? '…' : '发送'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* 列表区 */}
              <div className="flex-1 overflow-y-auto px-4 md:px-5 pb-3 min-h-[30vh]">
                {listLoading ? (
                  <p className="text-xs text-ink-faint text-center py-10 font-mono tracking-widest">LOADING…</p>
                ) : notes.length === 0 ? (
                  <p className="text-xs text-ink-faint text-center py-10 font-mono tracking-widest">
                    EMPTY · 这个月还什么都没记
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className="group flex items-center gap-2.5 bg-white border border-line rounded-xl px-3 py-2.5 hover:border-kimi-300 transition-colors"
                      >
                        <span className="shrink-0 text-[10px] font-mono text-kimi-600 bg-kimi-50 border border-kimi-100 rounded-md px-1.5 py-0.5">
                          {n.note_date.slice(5)} {weekdayCn(n.note_date)}
                        </span>
                        <span className="text-[13px] leading-snug text-ink min-w-0">{n.content}</span>
                        <button
                          onClick={() => remove(n.id)}
                          title="删除"
                          className="ml-auto shrink-0 w-5 h-5 rounded text-ink-faint hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity text-sm leading-none"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 底部操作区：输入 + AI 复盘 */}
              <div className="border-t border-line bg-white/70 px-4 md:px-5 py-3 flex flex-col gap-2.5">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={date}
                    max="9999-12-31"
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    className="input-dark text-xs px-2 py-2 font-mono w-[8.5em] shrink-0"
                    title="记录日期"
                  />
                  <input
                    ref={inputRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') add();
                      if (e.key === 'Escape') onClose();
                    }}
                    placeholder="今天遇到什么问题了？一句话记下"
                    maxLength={500}
                    className="input-dark flex-1 text-[13px] px-3 py-2 min-w-0"
                  />
                  <button
                    onClick={add}
                    disabled={!text.trim() || adding}
                    className="shrink-0 text-[13px] bg-kimi-500 hover:bg-kimi-600 text-white rounded-lg px-4 font-medium transition-colors disabled:opacity-40 shadow-btn"
                  >
                    {adding ? '…' : '记下'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setView('chat')}
                    className="flex-1 text-xs border border-line text-ink-soft hover:text-kimi-600 hover:border-kimi-200 hover:bg-kimi-50 rounded-lg py-2 transition-colors"
                  >
                    💬 复盘对话
                  </button>
                  <button
                    onClick={aiReview}
                    disabled={sending}
                    className="flex-1 text-xs border border-kimi-200 text-kimi-600 hover:bg-kimi-50 rounded-lg py-2 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {sending && <PixelLoader />}
                    {sending ? 'AI 复盘中，通常几秒钟…' : '✦ AI 复盘上月'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
