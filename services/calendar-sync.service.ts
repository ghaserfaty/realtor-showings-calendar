import type { RegistrationRecord } from "@/repositories/registration.repository";
import { registrationRepository } from "@/repositories/registration.repository";
import { getCalendarProvider } from "@/services/calendar/calendar.service";
import type { CalendarProvider } from "@/services/calendar/calendar.types";

export const REGISTRATION_START = "<!-- SHOWING_REGISTRATIONS_START -->";
export const REGISTRATION_END = "<!-- SHOWING_REGISTRATIONS_END -->";

function safeLine(value: string): string {
  return value
    .replaceAll(REGISTRATION_START, "")
    .replaceAll(REGISTRATION_END, "")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function managedBlock(registrations: RegistrationRecord[]): string {
  if (registrations.length === 0) return "";
  const entries = registrations.map((registration) => {
    const notes = registration.notes
      ? `\n  Notes: ${safeLine(registration.notes)}`
      : "";
    return `* ${safeLine(registration.fullName)}
  Email: ${safeLine(registration.email)}
  Phone: ${safeLine(registration.phone)}${notes}
  Registered at: ${registration.registeredAt.toISOString()}
  Registration ID: ${registration.id}`;
  });
  return `${REGISTRATION_START}

WEBSITE SHOWING REGISTRATIONS

${entries.join("\n\n")}

${REGISTRATION_END}`;
}

export function rebuildManagedDescription(
  currentDescription: string | null | undefined,
  registrations: RegistrationRecord[],
): string {
  const source = currentDescription ?? "";
  const start = source.indexOf(REGISTRATION_START);
  const end = source.indexOf(REGISTRATION_END);
  let realtorText = source;
  if (start >= 0 && end >= start) {
    realtorText = `${source.slice(0, start)}${source.slice(end + REGISTRATION_END.length)}`;
  }
  realtorText = realtorText.trim();
  const block = managedBlock(registrations);
  return [realtorText, block].filter(Boolean).join("\n\n");
}

export class CalendarSyncService {
  constructor(
    private readonly realtorId: string,
    private readonly calendar: CalendarProvider,
  ) {}

  async syncEvent(eventId: string): Promise<void> {
    const registrations = await registrationRepository.listActiveForEvent(
      this.realtorId,
      eventId,
    );
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const event = await this.calendar.getEvent(eventId);
        if (!event || event.status === "cancelled")
          throw new Error("Calendar event is unavailable");
        const privateProperties = event.extendedProperties?.private ?? {};
        await this.calendar.updateManagedFields(eventId, {
          description: rebuildManagedDescription(
            event.description,
            registrations,
          ),
          privateExtendedProperties: {
            ...privateProperties,
            registrationCount: String(registrations.length),
          },
          expectedEtag: event.etag ?? undefined,
        });
        await registrationRepository.markSync(
          this.realtorId,
          eventId,
          "SYNCED",
        );
        return;
      } catch (error: unknown) {
        lastError = error;
        const status = (error as { response?: { status?: number } }).response
          ?.status;
        if (status !== 412) break;
      }
    }
    const safeError =
      lastError instanceof Error
        ? lastError.message.slice(0, 500)
        : "Unknown calendar error";
    await registrationRepository.markSync(
      this.realtorId,
      eventId,
      "ERROR",
      safeError,
    );
    throw lastError;
  }
}

export async function getCalendarSyncService(
  realtorId: string,
): Promise<CalendarSyncService> {
  return new CalendarSyncService(
    realtorId,
    await getCalendarProvider(realtorId),
  );
}
