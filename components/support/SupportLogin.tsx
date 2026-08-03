"use client";

import { useState, type FormEvent } from "react";

export function SupportLogin() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const apiKey = new FormData(form).get("apiKey")?.toString() ?? "";
    try {
      const response = await fetch("/api/platform/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Sign-in failed.");
      }
      window.location.reload();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <main className="support-login-shell">
      <section className="support-login-card">
        <p className="eyebrow">Platform operations</p>
        <h1>Admin portal</h1>
        <p>
          Use the platform admin key to open a temporary, secure admin session.
        </p>
        {error && (
          <div className="notice error-notice" role="alert">
            {error}
          </div>
        )}
        <form onSubmit={login}>
          <label>
            Platform admin key
            <input
              name="apiKey"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </label>
          <button className="primary-button" disabled={busy}>
            {busy ? "Opening portal…" : "Open admin portal"}
          </button>
        </form>
      </section>
    </main>
  );
}
