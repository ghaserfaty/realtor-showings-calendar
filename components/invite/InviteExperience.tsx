"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { PublicInvitationDto, PublicShowingDto } from "@/lib/dto";

type ApiError = { error?: { code?: string; message?: string } };

class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new ApiRequestError(
      body.error?.message || "The request could not be completed.",
      body.error?.code,
    );
  }
  return response.json() as Promise<T>;
}

function formatShowingDate(
  startDateTime: string,
  endDateTime: string,
  timezone: string,
) {
  const start = new Date(startDateTime);
  const end = new Date(endDateTime);
  return {
    day: new Intl.DateTimeFormat("en", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: timezone,
    }).format(start),
    time: `${new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }).format(start)}–${new Intl.DateTimeFormat("en", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
      timeZoneName: "short",
    }).format(end)}`,
  };
}

export function InviteExperience({ token }: { token: string }) {
  const basePath = `/api/invitations/${token}`;
  const [invitation, setInvitation] = useState<PublicInvitationDto | null>(
    null,
  );
  const [showings, setShowings] = useState<PublicShowingDto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const showingVersions = useRef(new Map<string, string>());

  const loadShowings = useCallback(async () => {
    const data = await api<{ showings: PublicShowingDto[] }>(
      `${basePath}/showings`,
    );
    const nextVersions = new Map(
      data.showings.map((showing) => [
        showing.eventId,
        showing.selectionVersion,
      ]),
    );
    const previousVersions = showingVersions.current;
    setSelected((current) => {
      if (!previousVersions.size || !current.size) return current;
      return new Set(
        [...current].filter(
          (eventId) =>
            previousVersions.get(eventId) === nextVersions.get(eventId),
        ),
      );
    });
    showingVersions.current = nextVersions;
    setShowings(data.showings);
  }, [basePath]);

  const loadInvitation = useCallback(async () => {
    const data = await api<PublicInvitationDto>(basePath);
    setInvitation(data);
    setFullName((current) => current || data.invitedName || "");
    setEmail((current) => current || data.invitedEmail || "");
    setPhone((current) => current || data.invitedPhone || "");
    if (data.verified) await loadShowings();
  }, [basePath, loadShowings]);

  useEffect(() => {
    // This effect intentionally hydrates client state from the private server API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInvitation()
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "This invitation is not available.",
        ),
      )
      .finally(() => setLoading(false));
  }, [loadInvitation]);

  useEffect(() => {
    if (!invitation?.verified) return;
    const refresh = () => void loadShowings().catch(() => undefined);
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [invitation?.verified, loadShowings]);

  const selectedShowings = useMemo(
    () => showings.filter((showing) => selected.has(showing.eventId)),
    [selected, showings],
  );

  function toggle(eventId: string): void {
    setSuccess("");
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  async function requestCode(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      await api(`${basePath}/request-code`, { method: "POST", body: "{}" });
      setCodeSent(true);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : "We could not send a code.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`${basePath}/verify-code`, {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      await loadInvitation();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The code could not be verified.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!selected.size) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(`${basePath}/registrations`, {
        method: "POST",
        body: JSON.stringify({
          eventIds: [...selected],
          eventVersions: Object.fromEntries(
            selectedShowings.map((showing) => [
              showing.eventId,
              showing.selectionVersion,
            ]),
          ),
          fullName,
          email,
          phone,
          notes: notes || undefined,
        }),
      });
      const count = selected.size;
      setSelected(new Set());
      await loadShowings();
      setSuccess(
        count === 1
          ? "You’re registered. The showing is now saved to this invitation."
          : `You’re registered for ${count} showings. Your selections are saved to this invitation.`,
      );
    } catch (reason: unknown) {
      if (
        reason instanceof ApiRequestError &&
        ["SHOWING_CHANGED", "SHOWING_UNAVAILABLE", "SHOWING_FULL"].includes(
          reason.code ?? "",
        )
      ) {
        setSelected(new Set());
        await loadShowings().catch(() => undefined);
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "Registration could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel(eventId: string): Promise<void> {
    if (!window.confirm("Cancel your registration for this showing?")) return;
    setBusy(true);
    setError("");
    try {
      await api(`${basePath}/registrations/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
      });
      await loadShowings();
      setSuccess("Your registration was cancelled.");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Cancellation could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="invite-shell loading-shell" aria-busy="true">
        <div className="loading-line short" />
        <div className="loading-line title" />
        <div className="loading-grid">
          <div className="loading-card" />
          <div className="loading-card" />
        </div>
      </main>
    );
  }

  if (!invitation) {
    return (
      <main className="centered-page">
        <section className="private-card error-card">
          <div className="brand-mark" aria-hidden="true">
            M
          </div>
          <p className="eyebrow">Invitation unavailable</p>
          <h1>This private link can’t be opened.</h1>
          <p>
            {error ||
              "It may have expired or been revoked. Ask your realtor for a new link."}
          </p>
        </section>
      </main>
    );
  }

  if (!invitation.verified) {
    return (
      <main className="centered-page verification-page">
        <section className="verification-card">
          <div className="brand-row">
            <div className="brand-mark" aria-hidden="true">
              M
            </div>
            <span>Private showing invitation</span>
          </div>
          <p className="eyebrow">Confirm it’s you</p>
          <h1>Let’s verify your email.</h1>
          <p>
            We’ll send a six-digit code to{" "}
            <strong>{invitation.maskedEmail}</strong>. The code expires in 10
            minutes.
          </p>
          {error && <div className="notice error-notice">{error}</div>}
          {!codeSent ? (
            <button
              className="primary-button full-button"
              onClick={requestCode}
              disabled={busy}
            >
              {busy ? "Sending…" : "Send verification code"}
            </button>
          ) : (
            <form onSubmit={verify} className="code-form">
              <label htmlFor="verification-code">Six-digit code</label>
              <input
                id="verification-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
                placeholder="000000"
                required
              />
              <button
                className="primary-button full-button"
                disabled={busy || code.length !== 6}
              >
                {busy ? "Checking…" : "Verify and view showings"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={requestCode}
                disabled={busy}
              >
                Send a new code
              </button>
            </form>
          )}
          <p className="security-note">
            For your privacy, showing details stay hidden until verification.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="invite-shell">
      <header className="invite-header">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            M
          </div>
          <span>Private showing invitation</span>
        </div>
        <div className="step-chip">1 · Choose &nbsp; 2 · Confirm</div>
      </header>

      <section className="intro-section">
        <p className="eyebrow">Your private selection</p>
        <h1>
          {invitation.invitedName
            ? `Welcome, ${invitation.invitedName.split(" ")[0]}.`
            : "Welcome."}
        </h1>
        <p>
          Choose any group showings that fit your schedule. Other interested
          visitors may attend the same time. Times refresh automatically while
          this page is open.
        </p>
      </section>

      {error && <div className="notice error-notice">{error}</div>}
      {success && <div className="notice success-notice">{success}</div>}

      <div className="experience-grid">
        <section className="showing-section" aria-labelledby="showing-heading">
          <div className="section-heading">
            <div>
              <p className="section-index">01</p>
              <h2 id="showing-heading">Upcoming showings</h2>
            </div>
            <span>{showings.length} available</span>
          </div>
          <div className="showing-list">
            {showings.map((showing) => {
              const date = formatShowingDate(
                showing.startDateTime,
                showing.endDateTime,
                showing.timezone,
              );
              const isSelected = selected.has(showing.eventId);
              return (
                <article
                  className={`showing-card ${isSelected ? "selected" : ""} ${showing.alreadyRegistered ? "registered" : ""}`}
                  key={showing.eventId}
                >
                  <div
                    className="date-tile"
                    aria-label={`${date.day}, ${date.time}`}
                  >
                    <strong>{date.day}</strong>
                    <span>{date.time}</span>
                  </div>
                  <div className="showing-details">
                    <div className="showing-title-row">
                      <h3>{showing.propertyTitle}</h3>
                      {showing.alreadyRegistered && (
                        <span className="status-pill">Selected</span>
                      )}
                    </div>
                    <p className="address">{showing.propertyAddress}</p>
                    {showing.publicShowingNotes && (
                      <p className="showing-note">
                        {showing.publicShowingNotes}
                      </p>
                    )}
                    <div className="card-actions">
                      {showing.alreadyRegistered ? (
                        <button
                          type="button"
                          className="text-button danger-text"
                          onClick={() => cancel(showing.eventId)}
                          disabled={busy}
                        >
                          Cancel registration
                        </button>
                      ) : (
                        <label className="selection-control">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggle(showing.eventId)}
                          />
                          <span>
                            {isSelected
                              ? "Added to selection"
                              : "Add this showing"}
                          </span>
                        </label>
                      )}
                      {showing.listingUrl && (
                        <a
                          href={showing.listingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View listing <span aria-hidden="true">↗</span>
                        </a>
                      )}
                      {showing.remainingCapacity !== undefined &&
                        showing.remainingCapacity <= 5 && (
                          <span className="capacity-note">
                            {showing.remainingCapacity} places left
                          </span>
                        )}
                    </div>
                  </div>
                </article>
              );
            })}
            {!showings.length && (
              <div className="empty-state">
                <h3>No upcoming showings right now</h3>
                <p>Your realtor can add new group times to this invitation.</p>
              </div>
            )}
          </div>
        </section>

        <aside
          className="confirmation-panel"
          aria-labelledby="confirmation-heading"
        >
          <div className="section-heading compact-heading">
            <div>
              <p className="section-index">02</p>
              <h2 id="confirmation-heading">Confirm your details</h2>
            </div>
          </div>
          <form onSubmit={submit}>
            <div className="selection-summary">
              <span>Your selection</span>
              <strong>
                {selectedShowings.length
                  ? `${selectedShowings.length} showing${selectedShowings.length === 1 ? "" : "s"}`
                  : "None yet"}
              </strong>
              {selectedShowings.map((showing) => (
                <p key={showing.eventId}>{showing.propertyTitle}</p>
              ))}
            </div>
            <label htmlFor="full-name">Full name</label>
            <input
              id="full-name"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              readOnly={invitation.verificationRequired}
              required
            />
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              minLength={7}
              maxLength={40}
              required
            />
            <label htmlFor="notes">
              Notes <span>Optional</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Anything your realtor should know?"
            />
            <button
              className="primary-button full-button"
              disabled={busy || selected.size === 0}
              type="submit"
            >
              {busy
                ? "Saving…"
                : selected.size
                  ? "Confirm selected showings"
                  : "Choose a showing first"}
            </button>
            <p className="form-footnote">
              Your details are shared only with the realtor managing these
              showings.
            </p>
          </form>
        </aside>
      </div>

      <footer>
        <span>Private invitation · Do not forward</span>
        <span>Group showings remain open to other invited visitors.</span>
      </footer>
    </main>
  );
}
