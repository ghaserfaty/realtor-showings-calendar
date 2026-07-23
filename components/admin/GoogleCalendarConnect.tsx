"use client";

import { useState, type FormEvent } from "react";

type Props = {
  callbackUrl: string;
  initialStatus?: "success" | "error";
};

type ApiError = { error?: { message?: string } };

export function GoogleCalendarConnect({ callbackUrl, initialStatus }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [calendarId, setCalendarId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/google-oauth/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-realtor-api-key": apiKey,
        },
        body: JSON.stringify({ clientId, clientSecret, calendarId }),
      });
      const body = (await response.json().catch(() => ({}))) as ApiError & {
        authorizationUrl?: string;
      };
      if (!response.ok || !body.authorizationUrl) {
        throw new Error(
          body.error?.message ?? "The Google connection could not be started.",
        );
      }
      const authorizationUrl = new URL(body.authorizationUrl);
      if (authorizationUrl.origin !== "https://accounts.google.com") {
        throw new Error("The authorization destination is invalid.");
      }
      window.location.assign(authorizationUrl.toString());
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The Google connection could not be started.",
      );
      setBusy(false);
    }
  }

  return (
    <main className="oauth-shell">
      <section className="oauth-intro">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            M
          </div>
          <span>Realtor workspace</span>
        </div>
        <p className="eyebrow">Calendar connection</p>
        <h1>Connect your showing calendar.</h1>
        <p className="oauth-lead">
          Authorize offline access so the application can read available
          showings and synchronize registrations while you are away.
        </p>

        <ol className="oauth-steps">
          <li>
            Create a Google OAuth client of type{" "}
            <strong>Web application</strong>.
          </li>
          <li>
            Add the callback below to <strong>Authorized redirect URIs</strong>.
          </li>
          <li>
            Enter the credentials and choose the Google account to connect.
          </li>
        </ol>

        <div className="callback-box">
          <span>Authorized redirect URI</span>
          <code>{callbackUrl}</code>
        </div>
      </section>

      <section className="oauth-card">
        <div>
          <p className="section-index">Secure setup</p>
          <h2>Google OAuth details</h2>
          <p>
            Values are sent only to the backend. The refresh token returned by
            Google is encrypted before it reaches PostgreSQL.
          </p>
        </div>

        {initialStatus === "success" && (
          <div className="notice success-notice" role="status">
            Google Calendar is connected. You can close this page.
          </div>
        )}
        {initialStatus === "error" && (
          <div className="notice error-notice" role="alert">
            Google authorization did not complete. Check the client, callback
            URI, account permissions, and try again.
          </div>
        )}
        {error && (
          <div className="notice error-notice" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={submit} autoComplete="off">
          <label htmlFor="realtor-api-key">Realtor API key</label>
          <input
            id="realtor-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="rlt_..."
            minLength={36}
            required
          />

          <label htmlFor="google-client-id">OAuth Client ID</label>
          <input
            id="google-client-id"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            placeholder="...apps.googleusercontent.com"
            required
          />

          <label htmlFor="google-client-secret">OAuth Client Secret</label>
          <input
            id="google-client-secret"
            type="password"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            required
          />

          <label htmlFor="calendar-id">Dedicated Calendar ID</label>
          <input
            id="calendar-id"
            value={calendarId}
            onChange={(event) => setCalendarId(event.target.value)}
            placeholder="calendar-id@group.calendar.google.com"
            required
          />
          <p className="field-help">
            Find it in Google Calendar → Settings → Integrate calendar. Use{" "}
            <code>primary</code> only if the primary calendar is dedicated to
            showings.
          </p>

          <button className="primary-button full-button" disabled={busy}>
            {busy ? "Redirecting to Google…" : "Continue with Google"}
          </button>
        </form>

        <p className="oauth-footnote">
          The authorization attempt expires after ten minutes and can be used
          only once.
        </p>
      </section>
    </main>
  );
}
