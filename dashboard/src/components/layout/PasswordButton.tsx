import { FormEvent, useState } from 'react'

export function PasswordButton() {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/me/password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      if (!res.ok) {
        setError((await res.text()).trim() || 'Could not change the password.')
        return
      }
      setCurrent('')
      setNext('')
      setMessage('Password updated.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="password-menu">
      <button type="button" className="btn header-action" onClick={() => setOpen((value) => !value)}>
        Password
      </button>
      {open && (
        <form className="password-panel" onSubmit={(event) => void onSubmit(event)}>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Current password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="New password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
            minLength={8}
          />
          <button className="btn primary" type="submit" disabled={busy}>Save</button>
          {error && <p className="login-error">{error}</p>}
          {message && <p className="password-ok">{message}</p>}
        </form>
      )}
    </div>
  )
}
