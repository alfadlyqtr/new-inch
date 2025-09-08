import { useEffect, useRef, useState } from "react"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import { listMyConversations, listMessages, sendMessage, subscribeToConversation, listBusinessStaff, createOrGetDirectConversationByUserId, getUnreadCounts, markConversationRead, findDirectConversationId, uploadMessageAttachment, getMyUsersApp } from "../lib/messages.js"

export default function Messages() {
  const canView = useCan('messages','view')
  const canCreate = useCan('messages','create')

  const [loadingConvos, setLoadingConvos] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [conversations, setConversations] = useState([])
  const [staff, setStaff] = useState([])
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [selectedMsg, setSelectedMsg] = useState(null)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState("")
  const [subject, setSubject] = useState("")
  const [priority, setPriority] = useState("normal") // low | normal | high | urgent
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [unreadMap, setUnreadMap] = useState(new Map())
  const [convIdByUser, setConvIdByUser] = useState(new Map())
  const [attachmentsDraft, setAttachmentsDraft] = useState([]) // array of {name,size,type,url}
  const subRef = useRef(null)
  const [myUserId, setMyUserId] = useState(null)

  function recomputeUnreadTotal(mapLike) {
    let total = 0
    mapLike.forEach(v => { total += Number(v) || 0 })
    setUnreadTotal(total)
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        setError("")
        setLoadingConvos(true)
        // fetch my users_app id for convo alignment
        try { const me = await getMyUsersApp(); if (mounted) setMyUserId(me?.id || null) } catch {}
        const convs = await listMyConversations().catch(() => [])
        const ppl = await listBusinessStaff(false).catch(()=>[])
        if (!mounted) return
        setConversations(convs)
        setStaff(ppl)
        if (!selectedId && convs?.length) setSelectedId(convs[0].id)
        // Preload conversation IDs for staff (without creating)
        try {
          const map = new Map()
          await Promise.all((ppl || []).map(async (s) => {
            const cid = await findDirectConversationId(s.id).catch(()=>null)
            if (cid) map.set(s.id, cid)
          }))
          if (!mounted) return
          setConvIdByUser(map)
        } catch {}
      } catch (e) {
        setError("Unable to load conversations yet.")
      } finally {
        if (mounted) setLoadingConvos(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let alive = true
    if (!selectedId) {
      try { subRef.current?.unsubscribe?.() } catch {}
      setMessages([])
      return
    }
    ;(async () => {
      try {
        setLoadingMsgs(true)
        const rows = await listMessages(selectedId).catch(() => [])
        if (!alive) return
        setMessages(rows)
        await markConversationRead(selectedId).catch(()=>{})
        if (!alive) return
        // Optimistically zero unread for this conversation
        setUnreadMap(prev => { const m = new Map(prev); m.set(selectedId, 0); recomputeUnreadTotal(m); return m })
      } finally {
        if (alive) setLoadingMsgs(false)
      }
    })()
    // subscribe to new inserts for this conversation
    try { subRef.current?.unsubscribe?.() } catch {}
    subRef.current = subscribeToConversation(selectedId, (payload) => {
      if (!alive) return
      setMessages(prev => {
        if (payload?.id && prev.some(p => p.id === payload.id)) return prev
        return [...prev, payload]
      })
    })
    return () => {
      alive = false
      try { subRef.current?.unsubscribe?.() } catch {}
    }
  }, [selectedId])

  // Poll unread counts every 5s
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const map = await getUnreadCounts()
        if (!cancelled) {
          setUnreadMap(map)
          // recompute total
          let total = 0
          map.forEach(v => { total += Number(v) || 0 })
          setUnreadTotal(total)
        }
      } catch {}
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  async function onSend() {
    if (!canCreate || !draft.trim() || !selectedId) return
    const txt = draft.trim()
    setDraft("")
    const subj = subject.trim()
    try {
      const opts = { subject: subj || null, priority }
      if (attachmentsDraft.length) opts.attachments = attachmentsDraft
      await sendMessage(selectedId, txt, opts)
      if (subj) setSubject("")
      setPriority("normal")
      setAttachmentsDraft([])
    } catch (e) {
      setError(e.message || "Failed to send")
      // rollback draft on failure
      setDraft(txt)
    }
  }

  async function onPickAttachment(e) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !selectedId) return
    try {
      const meta = await uploadMessageAttachment(selectedId, file)
      setAttachmentsDraft(prev => [...prev, meta])
    } catch (err) {
      setError(err.message || 'Failed to upload attachment')
      setTimeout(()=>setError(""), 3000)
    }
  }

  if (!canView) {
    return <Forbidden module="messages" />
  }

  return (
    <div className="h-[72vh] grid grid-cols-12 gap-4">
      {/* Left: conversations */}
      <aside className="col-span-4 xl:col-span-3 glass rounded-2xl border border-white/10 p-3 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-white/90">Staff</div>
          <div className="text-[10px] px-2 py-0.5 rounded-md border border-white/10 text-slate-300" title="Total unread across conversations">{unreadTotal} unread</div>
        </div>
        <div className="relative">
          <input placeholder="Search" value={query} onChange={(e)=>setQuery(e.target.value)} className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-sm" />
        </div>
        <div className="mt-3 overflow-y-auto divide-y divide-white/5 rounded-lg border border-white/10">
          {loadingConvos && (
            <div className="p-3 text-xs text-slate-400">Loading…</div>
          )}
          {!loadingConvos && staff.length === 0 && (
            <div className="p-3 text-xs text-slate-400">No staff</div>
          )}
          {staff
            .filter(s => (s.name || '').toLowerCase().includes(query.toLowerCase()))
            .map((s) => (
            <button key={s.id} className={`w-full text-left px-3 py-2 text-sm text-white/80 rounded-md transition ${convIdByUser.get(s.id) === selectedId ? 'bg-white/10 border border-white/20' : 'hover:bg-white/5'} mb-2`} onClick={async () => {
              try {
                const conv = await createOrGetDirectConversationByUserId(s.id)
                const convs = await listMyConversations().catch(()=>[])
                setConversations(convs)
                if (conv?.id) {
                  setSelectedId(conv.id)
                  setConvIdByUser(prev => { const m = new Map(prev); m.set(s.id, conv.id); return m })
                  // zero unread for that conversation immediately on open
                  setUnreadMap(prev => { const m = new Map(prev); m.set(conv.id, 0); recomputeUnreadTotal(m); return m })
                }
              } catch (e) {
                setError(e.message || 'Failed to open conversation')
              }
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Avatar with initials */}
                  <div className="relative h-6 w-6 shrink-0 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px] text-white/80">
                    {(s.name || s.email || '?').slice(0,2).toUpperCase()}
                    {/* online badge */}
                    {(() => { try { const now = Date.now(); const online = s.online_until && new Date(s.online_until).getTime() > now; return online ? (<span className="absolute -bottom-0 -right-0 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-slate-900" />) : null } catch { return null } })()}
                  </div>
                  <span className="truncate">{s.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.isOwner && <span className="text-[10px] text-amber-300">Owner</span>}
                  {/* per-contact unread using mapped conversation id */}
                  {(() => {
                    const cid = convIdByUser.get(s.id)
                    const count = cid ? (unreadMap.get(cid) || 0) : 0
                    return count > 0 ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200 border border-rose-500/30">{count}</span>
                    ) : null
                  })()}
                </div>
              </div>
              <div className="text-[10px] text-slate-400 truncate">{s.email}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Right: thread + details */}
      <section className="col-span-8 xl:col-span-9 glass rounded-2xl border border-white/10 p-0 flex flex-col">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="text-sm text-white/90 font-semibold">
            {(() => {
              if (!selectedId) return 'Select a staff member to start a conversation'
              const selStaff = staff.find(st => convIdByUser.get(st.id) === selectedId)
              const name = selStaff?.name || selStaff?.email || ''
              return name ? `Direct Chat — ${name}` : 'Direct Chat'
            })()}
          </div>
        </div>
        <div className="flex-1 flex min-h-0">
          {/* thread list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 border-r border-white/10">
            {loadingMsgs && <div className="text-xs text-slate-400">Loading…</div>}
            {!loadingMsgs && messages.length === 0 && <div className="text-xs text-slate-400">No messages yet</div>}
            {messages.map(m => (
              <div key={m.id} className={`w-full flex ${m.sender_id === myUserId ? 'justify-end' : 'justify-start'}`}>
                <button onClick={()=>setSelectedMsg(m)} className={`text-left max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.sender_id === myUserId ? 'bg-brand-primary/20 border border-brand-primary/30 text-white/90' : 'bg-white/10 border border-white/10 text-white/90'} hover:bg-white/15`}>
                  {m.subject && <div className="text-xs font-semibold text-white/90 mb-0.5">{m.subject}</div>}
                  <div className="flex items-start gap-2">
                    {m.priority && m.priority !== 'normal' && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${m.priority==='urgent' ? 'bg-rose-500/20 text-rose-200 border-rose-500/30' : m.priority==='high' ? 'bg-orange-500/20 text-orange-200 border-orange-500/30' : 'bg-slate-500/10 text-slate-200 border-white/10'}`}>{m.priority}</span>
                    )}
                    {/* body + attachment icon if any */}
                    <div className="whitespace-pre-wrap flex items-center gap-2">
                      <span>{m.body}</span>
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <span title="Has attachment" className="inline-flex items-center justify-center h-5 w-5 rounded bg-white/10 border border-white/10 text-[10px]">📎</span>
                      )}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{new Date(m.created_at).toLocaleTimeString()}</div>
                </button>
              </div>
            ))}
          </div>
          {/* details panel */}
          <aside className="w-72 p-4 hidden lg:block">
            <div className="text-sm font-semibold text-white/90 mb-2">Details</div>
            {!selectedMsg && <div className="text-xs text-slate-400">Select a message to view details.</div>}
            {selectedMsg && (
              <div className="space-y-2 text-xs">
                <div>
                  <div className="text-slate-400">Subject</div>
                  <div className="text-white/90">{selectedMsg.subject || '(no subject)'}</div>
                </div>
                <div>
                  <div className="text-slate-400">Priority</div>
                  <div className="text-white/90 capitalize">{selectedMsg.priority || 'normal'}</div>
                </div>
                <div>
                  <div className="text-slate-400">Sent</div>
                  <div className="text-white/90">{new Date(selectedMsg.created_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-slate-400">Attachments</div>
                  {Array.isArray(selectedMsg.attachments) && selectedMsg.attachments.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {selectedMsg.attachments.map((a, idx) => (
                        <li key={idx} className="truncate">
                          <a className="text-brand-primary hover:underline" href={a.url} target="_blank" rel="noreferrer">{a.name || a.url}</a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-slate-400">None</div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <input
              className="w-1/2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
              placeholder="Subject (optional)"
              value={subject}
              onChange={(e)=>setSubject(e.target.value)}
              disabled={!canCreate || !selectedId}
            />
            <select
              className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/90"
              value={priority}
              onChange={(e)=>setPriority(e.target.value)}
              disabled={!canCreate || !selectedId}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
              placeholder={canCreate ? "Write a message…" : "You don't have permission to send"}
              value={draft}
              onChange={(e)=>setDraft(e.target.value)}
              onKeyDown={(e)=>{ if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
              disabled={!canCreate || !selectedId}
            />
            <label className="px-3 py-2 rounded-md text-sm bg-white/10 hover:bg-white/15 cursor-pointer border border-white/10">
              <input type="file" className="hidden" onChange={onPickAttachment} disabled={!canCreate || !selectedId} />
              Attach
            </label>
            <button onClick={onSend} disabled={!canCreate || !draft.trim() || !selectedId} className="px-3 py-2 rounded-md text-sm pill-active glow disabled:opacity-50">Send</button>
          </div>
          {attachmentsDraft.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachmentsDraft.map((a, idx) => (
                <span key={idx} className="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-300 bg-white/5">
                  {a.name}
                  <button className="ml-2 text-rose-300 hover:text-rose-200" onClick={()=>setAttachmentsDraft(prev => prev.filter((_,i)=>i!==idx))}>×</button>
                </span>
              ))}
            </div>
          )}
          {error && <div className="mt-2 text-xs text-rose-300">{error}</div>}
        </div>
      </section>
    </div>
  )
}
