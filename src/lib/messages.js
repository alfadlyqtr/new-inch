import { supabase } from "./supabaseClient.js"

export async function getMyUsersApp() {
  const { data: sess } = await supabase.auth.getSession()
  const uid = sess?.session?.user?.id
  if (!uid) return null
  const { data, error } = await supabase
    .from('users_app')
    .select('id, business_id')
    .eq('auth_user_id', uid)
    .maybeSingle()
  if (error) throw error
  return data
}

// Find a direct 1:1 conversation ID with a user (do NOT create if missing)
export async function findDirectConversationId(otherUserId) {
  const me = await getMyUsersApp()
  if (!me) return null
  if (!otherUserId || otherUserId === me.id) return null
  try {
    const { data } = await supabase.rpc('api_conversation_find_direct', { p_user_a: me.id, p_user_b: otherUserId })
    if (Array.isArray(data) && data.length > 0) return data[0]?.id || null
  } catch (_) {}
  return null
}

// Unread counts per conversation (for current user) via RPC
export async function getUnreadCounts() {
  const { data, error } = await supabase.rpc('api_messages_unread_counts')
  if (error) throw error
  // returns [{ conversation_id, unread_count }]
  const map = new Map()
  ;(data || []).forEach(row => map.set(row.conversation_id, Number(row.unread_count) || 0))
  return map
}

// Mark a conversation as read up to now
export async function markConversationRead(conversationId) {
  if (!conversationId) return
  const { error } = await supabase.rpc('api_messages_mark_read', { p_conversation_id: conversationId })
  if (error) throw error
}

export async function archiveMessage(messageId, archived = true) {
  if (!messageId) return
  const { error } = await supabase.rpc('api_message_archive', { p_message_id: messageId, p_archived: archived })
  if (error) throw error
}

export async function deleteMessage(messageId) {
  if (!messageId) return
  const { error } = await supabase.rpc('api_message_delete', { p_message_id: messageId })
  if (error) throw error
}

// Upload a single attachment to Supabase Storage and return metadata JSON
export async function uploadMessageAttachment(conversationId, file) {
  if (!conversationId || !file) throw new Error('Missing conversation or file')
  const me = await getMyUsersApp()
  if (!me) throw new Error('Not signed in')
  const MAX_MB = 10
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`File too large. Max ${MAX_MB}MB`)
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')
  const path = `${conversationId}/${Date.now()}-${safeName}`
  const { error: upErr } = await supabase.storage
    .from('message-attachments')
    .upload(path, file, { upsert: false, cacheControl: '3600', contentType: file.type || `application/${ext}` })
  if (upErr) throw upErr
  const { data: pub } = supabase.storage.from('message-attachments').getPublicUrl(path)
  const url = pub?.publicUrl
  if (!url) throw new Error('Failed to get public URL')
  return {
    name: file.name,
    size: file.size,
    type: file.type || `application/${ext}`,
    url,
    uploaded_at: new Date().toISOString(),
  }
}

// List all staff/users in my business (excluding me by default)
export async function listBusinessStaff(includeSelf = false) {
  const me = await getMyUsersApp()
  if (!me) return []
  const { data, error } = await supabase
    .from('users_app')
    .select('id, email, owner_name, full_name, staff_name, is_business_owner, online_until, last_seen_at')
    .eq('business_id', me.business_id)
  if (error) throw error
  const rows = (data || []).filter(u => includeSelf ? true : u.id !== me.id)
  return rows.map(u => ({
    id: u.id,
    email: u.email,
    isOwner: !!u.is_business_owner,
    name: u.owner_name || u.staff_name || u.full_name || u.email,
    online_until: u.online_until,
    last_seen_at: u.last_seen_at,
  }))
}

// Create or locate a direct 1:1 conversation by users_app.id
export async function createOrGetDirectConversationByUserId(otherUserId) {
  const me = await getMyUsersApp()
  if (!me) throw new Error('Not signed in')
  if (!otherUserId) throw new Error('Missing user')
  if (otherUserId === me.id) throw new Error("Can't chat with yourself")
  try {
    const { data: existing } = await supabase
      .rpc('api_conversation_find_direct', { p_user_a: me.id, p_user_b: otherUserId })
    if (Array.isArray(existing) && existing.length > 0) return existing[0]
  } catch (_) {
    // RPC missing; proceed to create
  }
  // Use secure RPC to create/join a direct conversation
  const { data, error } = await supabase.rpc('api_conversation_create_direct', { p_other_user_id: otherUserId })
  if (error) throw error
  const conv = Array.isArray(data) && data.length > 0 ? data[0] : data
  return conv
}

export async function findUserByEmailSameBusiness(email) {
  if (!email) return null
  const me = await getMyUsersApp()
  if (!me) return null
  const { data, error } = await supabase
    .from('users_app')
    .select('id, email')
    .eq('business_id', me.business_id)
    .ilike('email', email)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createConversationWithMembers(title, memberUserIds = []) {
  const me = await getMyUsersApp()
  if (!me) throw new Error('Not signed in')
  const all = Array.from(new Set([me.id, ...memberUserIds.filter(Boolean)]))
  if (all.length < 2) throw new Error('Conversation needs at least 2 members')
  const { data: conv, error: cErr } = await supabase
    .from('conversations')
    .insert({ business_id: me.business_id, title: title || null, created_by: me.id })
    .select('id')
    .single()
  if (cErr) throw cErr
  const rows = all.map(uid => ({ conversation_id: conv.id, user_id: uid }))
  const { error: mErr } = await supabase.from('conversation_members').insert(rows)
  if (mErr) throw mErr
  return conv
}

export async function createOrGetDirectConversationByEmail(email) {
  const other = await findUserByEmailSameBusiness(email)
  if (!other) throw new Error('User not found in your business')
  const me = await getMyUsersApp()
  // Try to find an existing 1:1 conversation between me and other
  try {
    const { data: existing } = await supabase
      .rpc('api_conversation_find_direct', { p_user_a: me.id, p_user_b: other.id })
    if (Array.isArray(existing) && existing.length > 0) return existing[0]
  } catch (_) {
    // RPC not available; fall through to create
  }
  // else create
  const conv = await createConversationWithMembers(null, [other.id])
  return conv
}
export async function listMyConversations() {
  const me = await getMyUsersApp()
  if (!me) return []
  const { data, error } = await supabase
    .from('conversation_members')
    .select('conversation_id, conversations:conversation_id(id, title, created_at)')
    .eq('user_id', me.id)
    .order('created_at', { referencedTable: 'conversations', ascending: false })
  if (error) throw error
  const rows = data || []
  return rows.map(r => r.conversations).filter(Boolean)
}

export async function listMessages(conversationId, limit = 50) {
  if (!conversationId) return []
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, sender_id, created_at, subject, priority, attachments, is_archived, thread_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)
  if (error) throw error
  return data || []
}

// Return messages with an is_read boolean for the current user
export async function listMessagesDetailed(conversationId, limit = 100) {
  const msgs = await listMessages(conversationId, limit)
  const ids = msgs.map(m => m.id)
  if (ids.length === 0) return msgs.map(m => ({ ...m, is_read: true }))
  const { data: sess } = await supabase.auth.getSession()
  if (!sess?.session?.user) return msgs.map(m => ({ ...m, is_read: false }))
  const { data: me } = await supabase
    .from('users_app')
    .select('id')
    .eq('auth_user_id', sess.session.user.id)
    .maybeSingle()
  const myId = me?.id
  if (!myId) return msgs.map(m => ({ ...m, is_read: false }))
  const { data: receipts, error } = await supabase
    .from('message_read_receipts')
    .select('message_id')
    .in('message_id', ids)
    .eq('user_id', myId)
  if (error) return msgs.map(m => ({ ...m, is_read: false }))
  const readSet = new Set((receipts || []).map(r => r.message_id))
  return msgs.map(m => ({ ...m, is_read: readSet.has(m.id) }))
}

export async function sendMessage(conversationId, body, opts = {}) {
  if (!conversationId || !body?.trim()) return null
  const me = await getMyUsersApp()
  if (!me) throw new Error('Not signed in')
  const payload = {
    conversation_id: conversationId,
    sender_id: me.id,
    body: body.trim(),
  }
  if (opts.subject) payload.subject = String(opts.subject)
  if (opts.priority) payload.priority = opts.priority // 'low' | 'normal' | 'high' | 'urgent'
  if (opts.threadId) payload.thread_id = String(opts.threadId)
  if (opts.attachments) payload.attachments = opts.attachments // json array
  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select('id')
    .single()
  if (error) throw error
  return data
}

export function subscribeToConversation(conversationId, onInsert) {
  if (!conversationId) return { unsubscribe: () => {} }
  const channel = supabase
    .channel(`conv:${conversationId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, (payload) => {
      onInsert?.(payload.new)
    })
    .subscribe()
  return {
    unsubscribe: () => { try { supabase.removeChannel(channel) } catch {} }
  }
}
