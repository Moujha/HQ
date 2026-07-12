import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/unsubscribe')({
  component: UnsubscribePage,
})

type Status =
  | 'loading'
  | 'valid'
  | 'already'
  | 'invalid'
  | 'submitting'
  | 'done'
  | 'error'

function UnsubscribePage() {
  const [status, setStatus] = useState<Status>('loading')
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    setToken(t)
    if (!t) {
      setStatus('invalid')
      return
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setStatus('valid')
        else if (d.reason === 'already_unsubscribed') setStatus('already')
        else setStatus('invalid')
      })
      .catch(() => setStatus('error'))
  }, [])

  const confirm = async () => {
    if (!token) return
    setStatus('submitting')
    try {
      const res = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await res.json()
      if (d.success) setStatus('done')
      else if (d.reason === 'already_unsubscribed') setStatus('already')
      else setStatus('error')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
          BLOU FEET
        </p>
        <h1 className="mt-3 font-display text-2xl font-bold text-foreground">
          Se désabonner
        </h1>

        {status === 'loading' && (
          <p className="mt-4 text-sm text-muted-foreground">Vérification…</p>
        )}

        {status === 'valid' && (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              Confirmez pour ne plus recevoir d'e-mails de notification.
            </p>
            <button
              onClick={confirm}
              className="mt-6 w-full rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
            >
              Confirmer le désabonnement
            </button>
          </>
        )}

        {status === 'submitting' && (
          <p className="mt-4 text-sm text-muted-foreground">Traitement…</p>
        )}

        {status === 'done' && (
          <p className="mt-4 text-sm text-foreground">
            Vous êtes désabonné(e). Vous ne recevrez plus ces e-mails.
          </p>
        )}

        {status === 'already' && (
          <p className="mt-4 text-sm text-foreground">
            Cette adresse est déjà désabonnée.
          </p>
        )}

        {status === 'invalid' && (
          <p className="mt-4 text-sm text-muted-foreground">
            Lien invalide ou expiré.
          </p>
        )}

        {status === 'error' && (
          <p className="mt-4 text-sm text-destructive">
            Une erreur est survenue. Réessayez plus tard.
          </p>
        )}
      </div>
    </div>
  )
}
