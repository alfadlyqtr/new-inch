import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabaseClient.js"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import CustomerCard from "../components/customers/CustomerCard.jsx"
import CustomerForm from "../components/customers/CustomerForm.jsx"

export default function Customers() {
  const canView = useCan('customers','view')
  const canCreate = useCan('customers','create')
  const canEdit = useCan('customers','edit')

  const [ids, setIds] = useState({ business_id: null, user_id: null })
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  useEffect(() => {
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const user = sess?.session?.user
      if (!user) { setLoading(false); return }
      const { data: ua } = await supabase
        .from('users_app')
        .select('business_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (ua?.business_id) setIds({ business_id: ua.business_id, user_id: user.id })
    })()
  }, [])

  useEffect(() => { if (ids.business_id && canView) load() }, [ids.business_id, canView])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('business_id', ids.business_id)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setCustomers(data || [])
    } catch (e) {
      console.error('load customers failed', e)
      setCustomers([])
    } finally { setLoading(false) }
  }

  const filtered = useMemo(() => {
    if (!search) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    )
  }, [customers, search])

  function openCreate(){ setEditing(null); setFormOpen(true) }
  function openEdit(c){ if (!canEdit) return; setEditing(c); setFormOpen(true) }

  async function handleSave(formData){
    try {
      const payload = { ...formData, business_id: ids.business_id }
      if (editing?.id) {
        const { error } = await supabase
          .from('customers').update(payload).eq('id', editing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('customers').insert(payload)
        if (error) throw error
      }
      setFormOpen(false)
      setEditing(null)
      await load()
    } catch (e) {
      alert('Failed to save: ' + (e?.message || e))
    }
  }

  if (!canView) return <Forbidden module="customers" />

  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Customers</h1>
            <p className="text-sm text-slate-400 mt-1">Manage your customers.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Search name or phone…"
              value={search}
              onChange={(e)=> setSearch(e.target.value)}
              className="rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
            {canCreate && (
              <button onClick={openCreate} className="px-3 py-2 rounded-md text-sm pill-active glow">+ Add Customer</button>
            )}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-6">
        {loading ? (
          <div className="text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-400">No customers found</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => (
              <CustomerCard key={c.id} c={c} onEdit={openEdit} />
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto" onClick={()=>{ setFormOpen(false); setEditing(null) }}>
          <div className="w-full max-w-2xl mx-auto my-8 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur px-0 pb-3">
              <div className="text-white/90 font-medium">{editing ? 'Edit Customer' : 'Add Customer'}</div>
              <button onClick={()=>{ setFormOpen(false); setEditing(null) }} className="px-2 py-1 rounded bg-white/10 border border-white/10">✕</button>
            </div>
            <div className="mt-2 space-y-4">
              <CustomerForm initial={editing} onCancel={()=>{ setFormOpen(false); setEditing(null) }} onSave={handleSave} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
