import { useMemo, useState } from "react"

export default function StaffInvitationSuccess({ staffMember, businessCode, onClose }) {
  const [copied, setCopied] = useState(false)

  const expiresText = useMemo(() => {
    try {
      const d = businessCode?.expires_at ? new Date(businessCode.expires_at) : null
      return d ? d.toLocaleString() : ''
    } catch { return '' }
  }, [businessCode?.expires_at])

  const instructions = useMemo(() => (
`1. Hello ${staffMember?.name || 'there'}, please visit: www.inch.qa/AuthPage
2. Create a new account with your email: ${staffMember?.email || '—'}
3. Verify your email (check inbox and spam folder)
4. Sign into your newly created INCH staff account
5. Choose "I'm joining a team"
6. Enter this business code: ${businessCode?.code || '—'}
7. You'll get instant access to the system

The code expires in 12 hours, so please complete registration soon.`.trim()
  ), [staffMember?.name, staffMember?.email, businessCode?.code])

  const copyInstructions = async () => {
    try {
      await navigator.clipboard.writeText(instructions)
      setCopied(true)
      setTimeout(()=>setCopied(false), 1500)
    } catch {}
  }

  return (
    <div className="p-6 text-center">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center">
        <span className="text-3xl">✅</span>
      </div>
      <h2 className="text-xl font-semibold">Staff Account Created!</h2>
      <p className="text-slate-300 mt-2 mb-6">
        Staff account for <span className="font-medium">{staffMember?.name}</span> with email <span className="font-mono">{staffMember?.email}</span> has been created.
      </p>

      <div className="mb-6">
        <div className="text-xs text-slate-400">Business Code</div>
        <div className="mt-2 w-full max-w-sm mx-auto p-4 rounded-lg bg-slate-900/80 border border-white/10">
          <div className="text-2xl font-mono tracking-widest font-bold">
            {businessCode?.code}
          </div>
          {expiresText && (
            <div className="text-xs text-slate-400 mt-1">Expires: {expiresText}</div>
          )}
        </div>
      </div>

      <div className="w-full max-w-lg mx-auto bg-white/5 p-4 rounded-lg border border-white/10 text-left">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold">Instructions for {staffMember?.name}:</h3>
          <button type="button" onClick={copyInstructions} className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="text-sm whitespace-pre-wrap font-sans text-slate-200">
          {instructions}
        </pre>
      </div>

      <div className="mt-8">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-md pill-active glow">
          Done
        </button>
      </div>
    </div>
  )
}
