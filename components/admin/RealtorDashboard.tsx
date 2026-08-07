"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { buildInvitationMessage } from "@/lib/invitation-message";

type InvitationSummary = {
  id: string;
  invitedEmail?: string | null;
  invitedName?: string | null;
  invitedPhone?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  maxSubmissions?: number | null;
  createdAt: string;
  lastAccessedAt?: string | null;
  registrationCount: number;
  status: "active" | "expired" | "revoked";
};

type CalendarStatus = {
  provider: "MOCK" | "GOOGLE";
  configured: boolean;
  updatedAt?: string;
  calendarId?: string;
};

type CalendarOption = {
  id: string;
  name: string;
  primary: boolean;
  accessRole: string;
  color?: string;
};

type VisibleShowing = {
  eventId: string;
  propertyTitle: string;
  propertyAddress: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  listingUrl?: string;
  publicShowingNotes?: string;
  remainingCapacity?: number;
  availability: "open" | "closed";
  visibleToLeads: boolean;
  registrationCount: number;
  capacity?: number;
};

type Props = {
  realtor: {
    email: string;
    displayName?: string | null;
  };
  initialInvitations: InvitationSummary[];
  initialCalendarStatus: CalendarStatus;
  defaultExpiresAt: string;
};

type ApiError = { error?: { message?: string } };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatShowingDate(showing: VisibleShowing): string {
  const start = new Date(showing.startDateTime);
  const end = new Date(showing.endDateTime);
  const day = new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: showing.timezone,
  }).format(start);
  const startTime = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: showing.timezone,
  }).format(start);
  const endTime = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: showing.timezone,
    timeZoneName: "short",
  }).format(end);
  return `${day} · ${startTime}–${endTime}`;
}

function showingDateKey(showing: VisibleShowing): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: showing.timezone,
  }).formatToParts(new Date(showing.startDateTime));
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function RealtorDashboard({
  realtor,
  initialInvitations,
  initialCalendarStatus,
  defaultExpiresAt,
}: Props) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [calendarStatus, setCalendarStatus] = useState(initialCalendarStatus);
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(
    initialCalendarStatus.provider === "GOOGLE" &&
      initialCalendarStatus.configured,
  );
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newInvitationUrl, setNewInvitationUrl] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [showings, setShowings] = useState<VisibleShowing[]>([]);
  const [showingsLoading, setShowingsLoading] = useState(
    initialCalendarStatus.configured,
  );
  const [showingActionId, setShowingActionId] = useState("");
  const [showingDateFilter, setShowingDateFilter] = useState("");
  const [showingPropertyFilter, setShowingPropertyFilter] = useState("");

  const activeInvitations = invitations.filter(
    (invitation) => invitation.status === "active",
  ).length;
  const registrationCount = invitations.reduce(
    (total, invitation) => total + invitation.registrationCount,
    0,
  );
  const showingProperties = useMemo(
    () =>
      [...new Set(showings.map((showing) => showing.propertyTitle))].sort(
        (left, right) => left.localeCompare(right),
      ),
    [showings],
  );
  const filteredShowings = useMemo(
    () =>
      showings.filter(
        (showing) =>
          (!showingDateFilter ||
            showingDateKey(showing) === showingDateFilter) &&
          (!showingPropertyFilter ||
            showing.propertyTitle === showingPropertyFilter),
      ),
    [showingDateFilter, showingPropertyFilter, showings],
  );

  useEffect(() => {
    if (
      initialCalendarStatus.provider !== "GOOGLE" ||
      !initialCalendarStatus.configured
    ) {
      return;
    }
    let active = true;
    void fetch("/api/admin/calendars", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as ApiError & {
          calendars?: CalendarOption[];
        };
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? "Calendars could not be loaded.",
          );
        }
        if (active) setCalendars(body.calendars ?? []);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Calendars could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setCalendarLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialCalendarStatus]);

  useEffect(() => {
    if (!initialCalendarStatus.configured) return;
    let active = true;
    void fetch("/api/admin/showings", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as ApiError & {
          showings?: VisibleShowing[];
        };
        if (!response.ok) {
          throw new Error(
            body.error?.message ?? "Showings could not be loaded.",
          );
        }
        if (active) setShowings(body.showings ?? []);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Showings could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setShowingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialCalendarStatus.configured]);

  async function reloadInvitations(): Promise<void> {
    const response = await fetch("/api/admin/invitations", {
      cache: "no-store",
    });
    const body = (await response.json()) as ApiError & {
      invitations?: InvitationSummary[];
    };
    if (!response.ok) {
      throw new Error(
        body.error?.message ?? "Invitations could not be refreshed.",
      );
    }
    setInvitations(body.invitations ?? []);
  }

  async function createInvitation(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setNewInvitationUrl("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const maxSubmissions = values.get("maxSubmissions")?.toString().trim();
    const invitedName = values.get("invitedName")?.toString().trim();
    const invitedEmail = values.get("invitedEmail")?.toString().trim();
    const invitedPhone = values.get("invitedPhone")?.toString().trim();
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invitedEmail: invitedEmail || undefined,
          invitedName: invitedName || undefined,
          invitedPhone: invitedPhone || undefined,
          expiresAt: new Date(values.get("expiresAt")?.toString() ?? ""),
          maxSubmissions: maxSubmissions
            ? Number.parseInt(maxSubmissions, 10)
            : undefined,
        }),
      });
      const body = (await response.json()) as ApiError & {
        invitationUrl?: string;
      };
      if (!response.ok || !body.invitationUrl) {
        throw new Error(
          body.error?.message ?? "The invitation could not be created.",
        );
      }
      setNewInvitationUrl(body.invitationUrl);
      setNotice(
        "Invitation created. Copy the link or ready-to-send message now.",
      );
      form.reset();
      await reloadInvitations();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The invitation could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logout(): Promise<void> {
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(
          body.error?.message ?? "Logout could not be completed.",
        );
      }
      window.location.replace("/");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Logout could not be completed.",
      );
      setLoggingOut(false);
    }
  }

  async function copyText(
    value: string,
    successMessage: string,
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(successMessage);
    } catch {
      setError("Copy failed. Select and copy the text manually.");
    }
  }

  async function reloadShowings(): Promise<void> {
    setShowingsLoading(true);
    try {
      const response = await fetch("/api/admin/showings", {
        cache: "no-store",
      });
      const body = (await response.json()) as ApiError & {
        showings?: VisibleShowing[];
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Showings could not be loaded.");
      }
      setShowings(body.showings ?? []);
    } finally {
      setShowingsLoading(false);
    }
  }

  async function revokeInvitation(id: string): Promise<void> {
    setActionId(id);
    setError("");
    try {
      const response = await fetch(`/api/admin/invitations/${id}/revoke`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "The invitation could not be revoked.",
        );
      }
      await reloadInvitations();
      setNotice("Invitation revoked.");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The invitation could not be revoked.",
      );
    } finally {
      setActionId("");
    }
  }

  async function changeCalendar(calendarId: string): Promise<void> {
    setCalendarLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/calendar-connection", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      const body = (await response.json()) as ApiError & CalendarStatus;
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "The calendar could not be selected.",
        );
      }
      setCalendarStatus((current) => ({ ...current, calendarId }));
      await reloadShowings();
      setNotice("Showing calendar updated.");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The calendar could not be selected.",
      );
    } finally {
      setCalendarLoading(false);
    }
  }

  async function changeShowingAvailability(
    showing: VisibleShowing,
  ): Promise<void> {
    const open = showing.availability === "closed";
    setShowingActionId(showing.eventId);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/admin/showings/${encodeURIComponent(showing.eventId)}/availability`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ open }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "The showing could not be updated.",
        );
      }
      await reloadShowings();
      setNotice(
        open
          ? "Showing opened and is now available to leads."
          : "Showing closed and removed from lead invitation pages.",
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The showing could not be updated.",
      );
    } finally {
      setShowingActionId("");
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <a className="brand-row dashboard-brand" href="/realtor/dashboard">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span>Showing workspace</span>
        </a>
        <div className="account-menu">
          <span>
            <strong>{realtor.displayName || realtor.email}</strong>
            <small>{realtor.email}</small>
          </span>
          <button
            className="secondary-button compact-button"
            type="button"
            disabled={loggingOut}
            onClick={() => void logout()}
          >
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </header>

      <section className="admin-heading">
        <div>
          <p className="eyebrow">Realtor admin</p>
          <h1>Invite leads. Fill showings.</h1>
          <p>
            Create private links for your leads and keep every registration
            synchronized with Google Calendar.
          </p>
        </div>
      </section>

      {(error || notice) && (
        <div
          className={`notice ${error ? "error-notice" : "success-notice"} dashboard-notice`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      )}

      <section className="metric-row" aria-label="Workspace overview">
        <article>
          <span>Active invitations</span>
          <strong>{activeInvitations}</strong>
        </article>
        <article>
          <span>Total registrations</span>
          <strong>{registrationCount}</strong>
        </article>
        <article>
          <span>Calendar</span>
          <strong>
            {calendarStatus.configured ? "Connected" : "Action needed"}
          </strong>
        </article>
      </section>

      <div className="admin-grid">
        <section className="admin-panel invitation-builder">
          <div className="panel-heading">
            <div>
              <p className="section-index">New invitation</p>
              <h2>Create a private lead link</h2>
            </div>
          </div>
          <form onSubmit={createInvitation}>
            <div className="invite-form-grid">
              <label>
                Lead name <span>Optional</span>
                <input name="invitedName" autoComplete="name" maxLength={120} />
              </label>
              <label>
                Lead email <span>Optional</span>
                <input name="invitedEmail" type="email" autoComplete="email" />
              </label>
              <label>
                Phone <span>Optional</span>
                <input name="invitedPhone" autoComplete="tel" maxLength={40} />
              </label>
              <label>
                Expires
                <input
                  name="expiresAt"
                  type="datetime-local"
                  defaultValue={defaultExpiresAt}
                  required
                />
              </label>
              <label>
                Maximum selections <span>Optional</span>
                <input
                  name="maxSubmissions"
                  type="number"
                  min={1}
                  max={100}
                  inputMode="numeric"
                />
              </label>
            </div>
            <button className="primary-button" disabled={busy}>
              {busy ? "Creating invitation…" : "Generate invitation link"}
            </button>
          </form>

          {newInvitationUrl && (
            <div className="generated-link" role="status">
              <span>Private link — shown only now</span>
              <div className="copy-row">
                <input
                  value={newInvitationUrl}
                  readOnly
                  aria-label="New invitation URL"
                />
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    void copyText(
                      newInvitationUrl,
                      "Private invitation link copied.",
                    )
                  }
                >
                  Copy link
                </button>
              </div>
              <span className="message-label">Ready-to-send message</span>
              <textarea
                value={buildInvitationMessage(newInvitationUrl)}
                readOnly
                rows={3}
                aria-label="Ready-to-send invitation message"
              />
              <button
                className="secondary-button copy-message-button"
                type="button"
                onClick={() =>
                  void copyText(
                    buildInvitationMessage(newInvitationUrl),
                    "Ready-to-send invitation message copied.",
                  )
                }
              >
                Copy message
              </button>
            </div>
          )}
        </section>

        <aside className="admin-panel calendar-panel">
          <div className="panel-heading">
            <div>
              <p className="section-index">Google Calendar</p>
              <h2>Showing source</h2>
            </div>
            <span className="connected-dot" aria-hidden="true" />
          </div>
          <p>
            Events from this calendar become the showing choices your leads see.
          </p>
          {calendarStatus.provider === "GOOGLE" ? (
            <label>
              Active calendar
              <select
                value={calendarStatus.calendarId ?? ""}
                disabled={calendarLoading}
                onChange={(event) => void changeCalendar(event.target.value)}
              >
                {calendarLoading && <option>Loading calendars…</option>}
                {!calendarLoading && calendars.length === 0 && (
                  <option value={calendarStatus.calendarId ?? ""}>
                    {calendarStatus.calendarId ?? "No writable calendars"}
                  </option>
                )}
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                    {calendar.primary ? " (Primary)" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mock-note">
              This development tenant is using the mock calendar.
            </p>
          )}
          <p className="field-help">
            Use a dedicated calendar and create future events with the prefix{" "}
            <code>[ABIERTA]</code>. Changes are checked again when a lead
            submits.
          </p>
        </aside>
      </div>

      <section className="admin-panel showing-preview">
        <div className="panel-heading">
          <div>
            <p className="section-index">Calendar controls</p>
            <h2>Open and close showings</h2>
          </div>
          <span>
            {showings.filter((showing) => showing.visibleToLeads).length}{" "}
            visible · {filteredShowings.length} shown
          </span>
        </div>
        <p className="showing-preview-help">
          Opening or closing a showing updates the event in Google Calendar.
          Visibility and capacity use the same rules as every invitation link.
        </p>
        <form
          className="showing-filters"
          aria-label="Filter showings"
          onSubmit={(event) => event.preventDefault()}
        >
          <label>
            Date
            <input
              type="date"
              value={showingDateFilter}
              onChange={(event) => setShowingDateFilter(event.target.value)}
            />
          </label>
          <label>
            Property
            <select
              value={showingPropertyFilter}
              onChange={(event) => setShowingPropertyFilter(event.target.value)}
            >
              <option value="">All properties</option>
              {showingProperties.map((property) => (
                <option key={property} value={property}>
                  {property}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button compact-button"
            type="button"
            disabled={!showingDateFilter && !showingPropertyFilter}
            onClick={() => {
              setShowingDateFilter("");
              setShowingPropertyFilter("");
            }}
          >
            Clear filters
          </button>
        </form>
        {showingsLoading ? (
          <div className="empty-state">
            <p>Loading the selected calendar…</p>
          </div>
        ) : showings.length === 0 ? (
          <div className="empty-state">
            <h3>No manageable showings</h3>
            <p>
              Add a future <code>[ABIERTA]</code> event to the active calendar.
            </p>
          </div>
        ) : filteredShowings.length === 0 ? (
          <div className="empty-state">
            <h3>No showings match these filters</h3>
            <p>Change the date or property to see other calendar events.</p>
          </div>
        ) : (
          <div className="showing-preview-grid">
            {filteredShowings.map((showing) => (
              <article key={showing.eventId}>
                <time dateTime={showing.startDateTime}>
                  {formatShowingDate(showing)}
                </time>
                <span
                  className={`status-label ${showing.visibleToLeads ? "active" : showing.availability === "closed" ? "revoked" : "expired"}`}
                >
                  {showing.visibleToLeads
                    ? "Visible to leads"
                    : showing.availability === "closed"
                      ? "Closed"
                      : "Full"}
                </span>
                <h3>{showing.propertyTitle}</h3>
                <p>{showing.propertyAddress}</p>
                {showing.publicShowingNotes && (
                  <small>{showing.publicShowingNotes}</small>
                )}
                {showing.listingUrl && (
                  <a
                    className="showing-listing-link"
                    href={showing.listingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View listing
                  </a>
                )}
                <footer>
                  <span>
                    {showing.capacity !== undefined
                      ? `${showing.registrationCount}/${showing.capacity} registered`
                      : `${showing.registrationCount} registered`}
                  </span>
                  <button
                    className={`text-button ${showing.availability === "open" ? "danger-text" : ""}`}
                    type="button"
                    disabled={showingActionId === showing.eventId}
                    onClick={() => void changeShowingAvailability(showing)}
                  >
                    {showingActionId === showing.eventId
                      ? "Updating…"
                      : showing.availability === "open"
                        ? "Close showing"
                        : "Open showing"}
                  </button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="admin-panel invitation-history">
        <div className="panel-heading">
          <div>
            <p className="section-index">Lead access</p>
            <h2>Recent invitations</h2>
          </div>
          <span>{invitations.length} total</span>
        </div>
        {invitations.length === 0 ? (
          <div className="empty-state">
            <h3>No invitations yet</h3>
            <p>Your first private lead link will appear here.</p>
          </div>
        ) : (
          <div className="invitation-list">
            {invitations.map((invitation) => (
              <article className="invitation-row" key={invitation.id}>
                <div className="lead-identity">
                  <span aria-hidden="true">
                    {(invitation.invitedName || invitation.invitedEmail || "?")
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {invitation.invitedName ||
                        invitation.invitedEmail ||
                        "Unnamed lead"}
                    </strong>
                    {invitation.invitedEmail && (
                      <small>{invitation.invitedEmail}</small>
                    )}
                  </div>
                </div>
                <div className="invitation-meta">
                  <span>Expires {formatDate(invitation.expiresAt)}</span>
                  <span>
                    {invitation.registrationCount} registration
                    {invitation.registrationCount === 1 ? "" : "s"}
                  </span>
                </div>
                <span className={`status-label ${invitation.status}`}>
                  {invitation.status}
                </span>
                {invitation.status === "active" ? (
                  <button
                    className="text-button danger-text"
                    disabled={actionId === invitation.id}
                    onClick={() => void revokeInvitation(invitation.id)}
                  >
                    {actionId === invitation.id ? "Revoking…" : "Revoke"}
                  </button>
                ) : (
                  <span />
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
