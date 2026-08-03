import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  findRealtorBySessionToken,
  REALTOR_SESSION_COOKIE,
} from "@/lib/security/realtor-session";
import { hasCalendarConnection } from "@/services/realtor.service";

const authMessages: Record<string, string> = {
  required: "Sign in with Google to open your realtor workspace.",
  denied: "Google authorization was cancelled. No account was connected.",
  error: "Google sign-in could not be completed. Please try again.",
  unavailable:
    "Google sign-in is not configured yet. Add the platform OAuth credentials.",
  calendar_required: "Connect Google Calendar to open your realtor workspace.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string }>;
}) {
  const cookieStore = await cookies();
  const realtor = await findRealtorBySessionToken(
    cookieStore.get(REALTOR_SESSION_COOKIE)?.value ?? "",
  );
  if (realtor && (await hasCalendarConnection(realtor.id))) {
    redirect("/realtor/dashboard");
  }
  const { auth } = await searchParams;

  return (
    <main className="landing-shell">
      <nav className="landing-nav">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            M
          </div>
          <span>Showing workspace</span>
        </div>
        <span className="nav-note">Built for independent realtors</span>
      </nav>

      <div className="landing-grid">
        <section className="landing-copy">
          <p className="eyebrow">Private showing coordination</p>
          <h1>Turn your calendar into booked showings.</h1>
          <p className="landing-lead">
            Share one private link. Let each lead choose a showing. Keep every
            registration organized in the Google Calendar you already use.
          </p>
          {auth && authMessages[auth] && (
            <div className="notice error-notice" role="alert">
              {authMessages[auth]}
            </div>
          )}
          <a className="google-login-button" href="/api/auth/google/start">
            <span aria-hidden="true">G</span>
            Continue with Google
          </a>
          <p className="login-footnote">
            You’ll approve access to your identity and Calendar events. Your
            Google password is never shared with this application.
          </p>
        </section>

        <aside className="landing-preview">
          <div className="preview-topline">
            <span>Today’s pipeline</span>
            <span className="live-chip">Live</span>
          </div>
          <div className="preview-metric">
            <span>Upcoming showings</span>
            <strong>06</strong>
          </div>
          <div className="preview-list">
            <article>
              <span className="preview-date">28</span>
              <div>
                <strong>Palermo · 2 bedrooms</strong>
                <small>4 leads registered</small>
              </div>
            </article>
            <article>
              <span className="preview-date amber">30</span>
              <div>
                <strong>Belgrano · Riverside</strong>
                <small>2 spots remaining</small>
              </div>
            </article>
            <article>
              <span className="preview-date sage">02</span>
              <div>
                <strong>Recoleta · Classic apartment</strong>
                <small>New showing</small>
              </div>
            </article>
          </div>
          <div className="preview-footer">
            <span>Google Calendar connected</span>
            <span className="connected-dot" aria-hidden="true" />
          </div>
        </aside>
      </div>

      <footer className="landing-footer">
        <span>Private links · Tenant-isolated data · Encrypted access</span>
        <span>Calendar changes are rechecked before every registration</span>
      </footer>
    </main>
  );
}
