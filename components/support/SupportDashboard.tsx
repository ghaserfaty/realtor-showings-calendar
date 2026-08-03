"use client";

import { useState } from "react";

type SupportRealtor = {
  id: string;
  email: string;
  displayName?: string | null;
  calendarProvider: "MOCK" | "GOOGLE";
  createdAt: string;
  calendarConnected: boolean;
  connectionUpdatedAt?: string;
  activeSessionCount: number;
  invitationCount: number;
  registrationCount: number;
};

type SupportInvitation = {
  id: string;
  invitedEmail?: string | null;
  invitedName?: string | null;
  invitedPhone?: string | null;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
  registrationCount: number;
  status: "active" | "expired" | "revoked";
};

type Props = { initialRealtors: SupportRealtor[] };
type ApiError = { error?: { message?: string } };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SupportDashboard({ initialRealtors }: Props) {
  const [realtors, setRealtors] = useState(initialRealtors);
  const [selectedId, setSelectedId] = useState(initialRealtors[0]?.id ?? "");
  const [invitations, setInvitations] = useState<SupportInvitation[]>([]);
  const [loadedTenantId, setLoadedTenantId] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = realtors.find((realtor) => realtor.id === selectedId);

  async function loadInvitations(realtorId = selectedId): Promise<void> {
    if (!realtorId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/platform/realtors/${encodeURIComponent(realtorId)}/invitations`,
        { cache: "no-store" },
      );
      const body = (await response.json()) as ApiError & {
        invitations?: SupportInvitation[];
      };
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "Invitations could not be loaded.",
        );
      }
      setInvitations(body.invitations ?? []);
      setLoadedTenantId(realtorId);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Invitations could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  function selectTenant(realtorId: string): void {
    setSelectedId(realtorId);
    setInvitations([]);
    setLoadedTenantId("");
    setNotice("");
    void loadInvitations(realtorId);
  }

  async function deleteInvitation(
    invitation: SupportInvitation,
  ): Promise<void> {
    if (!selected) return;
    const label =
      invitation.invitedName || invitation.invitedEmail || invitation.id;
    const confirmed = window.confirm(
      `Permanently delete the invitation for ${label} and its ${invitation.registrationCount} registration(s)? This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeletingId(invitation.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/platform/realtors/${encodeURIComponent(selected.id)}/invitations/${encodeURIComponent(invitation.id)}`,
        { method: "DELETE" },
      );
      const body = (await response.json().catch(() => ({}))) as ApiError;
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "Invitation could not be deleted.",
        );
      }
      setInvitations((current) =>
        current.filter((item) => item.id !== invitation.id),
      );
      setRealtors((current) =>
        current.map((realtor) =>
          realtor.id === selected.id
            ? {
                ...realtor,
                invitationCount: Math.max(0, realtor.invitationCount - 1),
                registrationCount: Math.max(
                  0,
                  realtor.registrationCount - invitation.registrationCount,
                ),
              }
            : realtor,
        ),
      );
      setNotice("Invitation and its registrations were permanently deleted.");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Invitation could not be deleted.",
      );
    } finally {
      setDeletingId("");
    }
  }

  async function logout(): Promise<void> {
    await fetch("/api/platform/session", { method: "DELETE" });
    window.location.reload();
  }

  return (
    <main className="support-shell">
      <header className="admin-topbar">
        <a className="brand-row dashboard-brand" href="/admin">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span>Admin portal</span>
        </a>
        <button
          className="secondary-button compact-button"
          type="button"
          onClick={() => void logout()}
        >
          Lock portal
        </button>
      </header>

      <section className="support-heading">
        <p className="eyebrow">Multi-tenant operations</p>
        <h1>Tenant administration</h1>
        <p>Inspect tenant health and permanently remove invitation records.</p>
      </section>

      {(error || notice) && (
        <div
          className={`notice ${error ? "error-notice" : "success-notice"}`}
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      )}

      <div className="support-layout">
        <aside className="admin-panel tenant-list-panel">
          <div className="panel-heading">
            <div>
              <p className="section-index">Tenants</p>
              <h2>Realtors</h2>
            </div>
            <span>{realtors.length}</span>
          </div>
          {realtors.length === 0 ? (
            <div className="empty-state">
              <p>No tenants found.</p>
            </div>
          ) : (
            <div className="tenant-list">
              {realtors.map((realtor) => (
                <button
                  key={realtor.id}
                  type="button"
                  className={realtor.id === selectedId ? "selected" : ""}
                  onClick={() => selectTenant(realtor.id)}
                >
                  <strong>{realtor.displayName || realtor.email}</strong>
                  <small>{realtor.email}</small>
                  <span>
                    {realtor.invitationCount} invitations ·{" "}
                    {realtor.registrationCount} registrations
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className="admin-panel tenant-detail-panel">
          {!selected ? (
            <div className="empty-state">
              <p>Select a tenant.</p>
            </div>
          ) : (
            <>
              <div className="tenant-summary">
                <div>
                  <p className="section-index">Selected tenant</p>
                  <h2>{selected.displayName || selected.email}</h2>
                  <p>{selected.email}</p>
                </div>
                <span
                  className={`status-label ${selected.calendarConnected ? "active" : "revoked"}`}
                >
                  {selected.calendarConnected
                    ? "Calendar connected"
                    : "Calendar missing"}
                </span>
              </div>
              <dl className="tenant-metrics">
                <div>
                  <dt>Provider</dt>
                  <dd>{selected.calendarProvider}</dd>
                </div>
                <div>
                  <dt>Active sessions</dt>
                  <dd>{selected.activeSessionCount}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                </div>
              </dl>

              {loadedTenantId !== selected.id && !loading && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void loadInvitations()}
                >
                  Load invitations
                </button>
              )}
              {loading && (
                <div className="empty-state">
                  <p>Loading invitations…</p>
                </div>
              )}
              {!loading &&
                loadedTenantId === selected.id &&
                invitations.length === 0 && (
                  <div className="empty-state">
                    <p>No invitations for this tenant.</p>
                  </div>
                )}
              {!loading && invitations.length > 0 && (
                <div className="support-invitation-list">
                  {invitations.map((invitation) => (
                    <article key={invitation.id}>
                      <div>
                        <strong>
                          {invitation.invitedName ||
                            invitation.invitedEmail ||
                            "Unnamed lead"}
                        </strong>
                        <small>
                          Created {formatDate(invitation.createdAt)} ·{" "}
                          {invitation.registrationCount} registration(s)
                        </small>
                      </div>
                      <span className={`status-label ${invitation.status}`}>
                        {invitation.status}
                      </span>
                      <button
                        className="text-button danger-text"
                        type="button"
                        disabled={deletingId === invitation.id}
                        onClick={() => void deleteInvitation(invitation)}
                      >
                        {deletingId === invitation.id
                          ? "Deleting…"
                          : "Delete permanently"}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
