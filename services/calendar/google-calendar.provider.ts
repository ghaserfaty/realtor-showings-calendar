import { google, type calendar_v3 } from "googleapis";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import type {
  CalendarEvent,
  CalendarProvider,
} from "@/services/calendar/calendar.types";

export type GoogleCalendarCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
};

export function missingGoogleCredentialFields(
  credentials: GoogleCalendarCredentials,
): string[] {
  return (
    [
      ["clientId", credentials.clientId],
      ["clientSecret", credentials.clientSecret],
      ["refreshToken", credentials.refreshToken],
      ["calendarId", credentials.calendarId],
    ] as const
  )
    .filter(([, value]) => !value.trim())
    .map(([name]) => name);
}

function toCalendarEvent(
  event: calendar_v3.Schema$Event,
): CalendarEvent | null {
  if (!event.id) return null;
  return {
    id: event.id,
    status: event.status,
    summary: event.summary,
    location: event.location,
    description: event.description,
    start: event.start
      ? { dateTime: event.start.dateTime, timeZone: event.start.timeZone }
      : undefined,
    end: event.end
      ? { dateTime: event.end.dateTime, timeZone: event.end.timeZone }
      : undefined,
    extendedProperties: { private: event.extendedProperties?.private ?? {} },
    etag: event.etag,
  };
}

export class GoogleCalendarProvider implements CalendarProvider {
  private readonly calendar: calendar_v3.Calendar;

  constructor(private readonly credentials: GoogleCalendarCredentials) {
    const missingFields = missingGoogleCredentialFields(credentials);
    if (missingFields.length > 0) {
      throw new AppError(
        "GOOGLE_CALENDAR_NOT_CONFIGURED",
        `Google Calendar is not configured. Missing: ${missingFields.join(", ")}.`,
        503,
      );
    }
    const auth = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
    );
    auth.setCredentials({ refresh_token: credentials.refreshToken });
    this.calendar = google.calendar({ version: "v3", auth });
  }

  async listUpcomingEvents(timeMin: Date): Promise<CalendarEvent[]> {
    const config = getConfig();
    const response = await this.calendar.events.list({
      calendarId: this.credentials.calendarId,
      timeMin: timeMin.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      ...(config.SHOWING_FILTER_MODE === "extended_property"
        ? {
            privateExtendedProperty: [
              `eventType=${config.SHOWING_EVENT_TYPE}`,
              "registrationEnabled=true",
            ],
          }
        : {}),
      fields:
        "items(id,status,summary,location,description,start(dateTime,timeZone),end(dateTime,timeZone),extendedProperties(private),etag)",
    });
    return (response.data.items ?? []).flatMap((event) => {
      const mapped = toCalendarEvent(event);
      return mapped ? [mapped] : [];
    });
  }

  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    try {
      const response = await this.calendar.events.get({
        calendarId: this.credentials.calendarId,
        eventId,
        fields:
          "id,status,summary,location,description,start(dateTime,timeZone),end(dateTime,timeZone),extendedProperties(private),etag",
      });
      return toCalendarEvent(response.data);
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      if (status === 404 || status === 410) return null;
      throw error;
    }
  }

  async updateManagedFields(
    eventId: string,
    input: {
      description: string;
      privateExtendedProperties: Record<string, string>;
      expectedEtag?: string;
    },
  ): Promise<void> {
    await this.calendar.events.patch(
      {
        calendarId: this.credentials.calendarId,
        eventId,
        sendUpdates: "none",
        requestBody: {
          description: input.description,
          extendedProperties: { private: input.privateExtendedProperties },
        },
      },
      input.expectedEtag
        ? { headers: { "If-Match": input.expectedEtag } }
        : undefined,
    );
  }
}
