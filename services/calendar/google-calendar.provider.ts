import { google, type calendar_v3 } from "googleapis";
import { getConfig, type AppConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";
import type {
  CalendarEvent,
  CalendarProvider,
} from "@/services/calendar/calendar.types";

type GoogleOAuthConfig = Pick<
  AppConfig,
  "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REFRESH_TOKEN"
>;

export function missingGoogleOAuthVariables(
  config: GoogleOAuthConfig,
): string[] {
  return (
    [
      ["GOOGLE_CLIENT_ID", config.GOOGLE_CLIENT_ID],
      ["GOOGLE_CLIENT_SECRET", config.GOOGLE_CLIENT_SECRET],
      ["GOOGLE_REFRESH_TOKEN", config.GOOGLE_REFRESH_TOKEN],
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

  constructor() {
    const config = getConfig();
    const missingVariables = missingGoogleOAuthVariables(config);
    if (missingVariables.length > 0) {
      throw new AppError(
        "GOOGLE_CALENDAR_NOT_CONFIGURED",
        `Google Calendar is not configured. Missing: ${missingVariables.join(
          ", ",
        )}.`,
        503,
      );
    }
    const auth = new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
    );
    auth.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });
    this.calendar = google.calendar({ version: "v3", auth });
  }

  async listUpcomingEvents(timeMin: Date): Promise<CalendarEvent[]> {
    const config = getConfig();
    const response = await this.calendar.events.list({
      calendarId: config.GOOGLE_CALENDAR_ID,
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
        calendarId: getConfig().GOOGLE_CALENDAR_ID,
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
        calendarId: getConfig().GOOGLE_CALENDAR_ID,
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
