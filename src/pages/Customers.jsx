import React, { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabaseClient.js"
import { useCan, PermissionGate, Forbidden } from "../lib/permissions.jsx"
import CustomerCard from "../components/customers/CustomerCard.jsx"
import CustomerForm from "../components/customers/CustomerForm.jsx"
import { useTranslation } from 'react-i18next'

export default function Customers() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const canView = useCan('customers','view')
  const canCreate = useCan('customers','create')
  const canEdit = useCan('customers','edit')

  const [ids, setIds] = useState({ business_id: null, user_id: null })
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [justCreated, setJustCreated] = useState(null)
  const [justDeleted, setJustDeleted] = useState(false)

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

  // If navigated back from New Customer creation, show toast and ensure fresh data
  useEffect(() => {
    const created = location.state?.createdCustomer
    if (created) {
      ;(async () => {
        await load()
        setJustCreated(created)
        // Clear navigation state so toast doesn't reappear on refresh/back
        navigate(location.pathname, { replace: true })
        // Auto-hide toast
        setTimeout(() => setJustCreated(null), 2000)
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // After list loads and we have justCreated, try to scroll and flash the card
  useEffect(() => {
    if (!justCreated || customers.length === 0) return
    // find element by id or by data-phone/name fallback
    const elById = justCreated.id ? document.querySelector(`[data-customer-id="${justCreated.id}"]`) : null
    let target = elById
    if (!target && justCreated.phone) {
      target = document.querySelector(`[data-customer-phone="${justCreated.phone}"]`)
    }
    if (!target && justCreated.name) {
      target = Array.from(document.querySelectorAll('[data-customer-name]')).find(el => el.getAttribute('data-customer-name') === justCreated.name)
    }
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.classList.add('flash-highlight')
      window.setTimeout(() => target.classList.remove('flash-highlight'), 1200)
    }
  }, [justCreated, customers])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('business_id', ids.business_id)
        .is('preferences->>deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setCustomers(data || [])
    } catch (e) {
      console.error('load customers failed', e)
      setCustomers([])
    } finally { setLoading(false) }
  }

  function handleDeleted(id){
    setCustomers(prev => prev.filter(c => c.id !== id))
    setJustDeleted(true)
    setTimeout(() => setJustDeleted(false), 1800)
  }

  const filtered = useMemo(() => {
    if (!search) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    )
  }, [customers, search])

  function openCreate(){
    const isStaff = location.pathname.startsWith('/staff')
    const base = isStaff ? '/staff' : '/bo'
    navigate(`${base}/customers/new`)
  }
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
    <div className="space-y-6 relative">
      {justCreated && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <span className="text-xl">👍</span>
          <span>Customer created</span>
        </div>
      )}
      {justDeleted && (
        <div className="fixed top-4 right-4 z-50 bg-rose-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
          <span className="text-xl">🗑️</span>
          <span>Customer deleted</span>
        </div>
      )}
      <div className="glass rounded-2xl border border-white/10 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white/90">{t('customers.title')}</h1>
            <p className="text-sm text-slate-400 mt-1">{t('customers.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder={t('customers.searchPlaceholder')}
              value={search}
              onChange={(e)=> setSearch(e.target.value)}
              className="rounded bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
            {canCreate && (
              <button onClick={openCreate} className="px-3 py-2 rounded-md text-sm pill-active glow">{t('customers.addCustomer')}</button>
            )}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-white/10 p-6">
        {loading ? (
          <div className="text-slate-400">{t('customers.loading')}</div>
        ) : filtered.length === 0 ? (
          <div className="text-slate-400">{t('customers.empty')}</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => (
              <div key={c.id} data-customer-id={c.id} data-customer-phone={c.phone || ''} data-customer-name={c.name || ''}>
                <CustomerCard c={c} onEdit={openEdit} onDeleted={handleDeleted} />
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto" onClick={()=>{ setFormOpen(false); setEditing(null) }}>
          <div className="w-full max-w-2xl mx-auto my-8 rounded-2xl border border-white/10 bg-slate-900 p-4 shadow-xl" onClick={(e)=> e.stopPropagation()}>
            <div className="flex items-center justify-between sticky top-0 bg-slate-900/95 backdrop-blur px-0 pb-3">
              <div className="text-white/90 font-medium">{editing ? t('customers.modal.editTitle') : t('customers.modal.addTitle')}</div>
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
