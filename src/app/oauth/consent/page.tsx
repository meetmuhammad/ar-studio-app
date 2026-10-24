'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Consent screen for Supabase's OAuth 2.1 server (the "Authorization Path").
 * Reached with ?authorization_id=... after a connector such as Claude starts the
 * authorization-code + PKCE flow. The signed-in user sees which client wants
 * access and approves or denies; Supabase then redirects back to the client.
 *
 * The browser session lives in localStorage, so this is the client-side variant
 * of Supabase's documented consent page (no server cookies involved).
 * Needs @supabase/supabase-js >= 2.78.0, the first release with auth.oauth.
 */
type Details = OAuthAuthorizationDetails

function Consent() {
  const id = useSearchParams().get('authorization_id')
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id || !/^[\w-]+$/.test(id)) { setError('This authorization request is missing or malformed.'); return }
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      if (!s.session) {
        window.location.replace(`/sign-in?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`)
        return
      }
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id)
      if (error || !data) { setError(error?.message ?? 'Could not load this authorization request.'); return }
      // An already-consented request comes back as { redirect_url } with no authorization_id.
      const done = (data as { redirect_url?: string }).redirect_url
      if (!data.authorization_id && done) { window.location.href = done; return }
      setDetails(data)
    })()
  }, [id])

  async function decide(approve: boolean) {
    if (!id) return
    setBusy(true)
    const { data, error } = approve ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true }) : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    if (error || !data?.redirect_url) { setError(error?.message ?? 'The decision could not be completed.'); setBusy(false); return }
    window.location.href = data.redirect_url
  }

  return (
    <div className="mx-auto mt-24 max-w-md px-4">
      <Card>
        <CardHeader>
          <CardTitle>Connect an assistant to the ledger</CardTitle>
          <CardDescription>
            {details ? `${details.client?.client_name ?? 'An application'} is asking to act on your behalf.` : 'Loading request…'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {details && (
            <>
              <p className="text-sm">
                If you approve, it can read the general ledger and prepare entries for you to confirm. Nothing is saved
                without your separate confirmation in the assistant. Only admins can approve.
              </p>
              <p className="break-all text-xs text-muted-foreground">Returns to: {details.redirect_uri}</p>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => decide(true)}>Approve</Button>
                <Button disabled={busy} variant="outline" onClick={() => decide(false)}>Deny</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function ConsentPage() {
  return <Suspense><Consent /></Suspense>
}
