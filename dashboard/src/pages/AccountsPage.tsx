import { FormEvent, useEffect, useState } from 'react'
import { useDashboardContext } from '../context/DashboardContext'

type AccountRow = {
  email: string
  role: string
  createdBy: string
}

type AuditRow = {
  id: number
  time: string
  email: string
  action: string
  target: string
  note: string
}

export function AccountsPage() {
  const { session } = useDashboardContext()
  const superadmin = session?.role === 'superadmin'
  const [rows, setRows] = useState<AccountRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('viewer')
  const [resetEmail, setResetEmail] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const res = await fetch('/api/accounts', { credentials: 'include' })
    if (!res.ok) {
      setError('Could not load accounts.')
      return
    }
    const list = (await res.json()) as AccountRow[]
    setRows(list)
    if (session?.role === 'superadmin') {
      const auditRes = await fetch('/api/audit', { credentials: 'include' })
      if (auditRes.ok) setAudit((await auditRes.json()) as AuditRow[])
    }
  }

  useEffect(() => {
    if (session?.role === 'admin' || session?.role === 'superadmin') void load()
  }, [session?.role])

  if (session?.role !== 'admin' && session?.role !== 'superadmin') {
    return <p>Only an admin can open accounts.</p>
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Could not add the account.')
        return
      }
      setEmail('')
      setPassword('')
      setRole('viewer')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (name: string) => {
    if (!confirm(`Remove ${name}?`)) return
    setError('')
    const res = await fetch(`/api/accounts/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (!res.ok) {
      setError((await res.text()).trim() || 'Could not remove the account.')
      return
    }
    await load()
  }

  const reset = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(resetEmail)}/password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Could not reset the password.')
        return
      }
      setResetPassword('')
      setNotice(`Password reset for ${resetEmail}.`)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const canRemove = (row: AccountRow) => {
    if (row.role === 'superadmin' || row.email === session.email) return false
    if (superadmin) return true
    return row.role === 'viewer' || row.role === 'operator'
  }

  return (
    <section className="accounts-page">
      <h2>Accounts</h2>
      <p>
        {superadmin
          ? 'A super admin adds every role, removes admins, and resets passwords. Remove keeps the account in the database and blocks sign-in. A super admin cannot remove a super admin.'
          : 'An admin adds and removes viewers and operators. Remove keeps the account in the database and blocks sign-in.'}
      </p>
      <form className="accounts-form" onSubmit={(event) => void onSubmit(event)}>
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="viewer">viewer</option>
          <option value="operator">operator</option>
          {superadmin && <option value="admin">admin</option>}
          {superadmin && <option value="superadmin">super admin</option>}
        </select>
        <button className="btn primary" type="submit" disabled={busy}>Add account</button>
      </form>
      {error && <p className="login-error">{error}</p>}
      {notice && <p className="password-ok">{notice}</p>}
      <table className="device-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Created by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.email}>
              <td>{row.email}</td>
              <td>{row.role === 'superadmin' ? 'super admin' : row.role}</td>
              <td>{row.createdBy || '—'}</td>
              <td>
                {canRemove(row) && (
                  <button type="button" className="btn ghost" onClick={() => void remove(row.email)}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {superadmin && (
        <>
          <h2>Reset a password</h2>
          <form className="accounts-form" onSubmit={(event) => void reset(event)}>
            <select value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required>
              <option value="">Choose an account</option>
              {rows.filter((row) => row.email !== session.email).map((row) => (
                <option key={row.email} value={row.email}>{row.email}</option>
              ))}
            </select>
            <input
              placeholder="New password"
              type="password"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              required
              minLength={8}
            />
            <button className="btn primary" type="submit" disabled={busy}>Reset password</button>
          </form>
          <h2>Audit</h2>
          <table className="device-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Who</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.time).toLocaleString()}</td>
                  <td>{row.email}</td>
                  <td>{row.action}</td>
                  <td>{row.target || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
