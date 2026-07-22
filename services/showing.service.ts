import { z } from "zod";
import type { PublicShowingDto } from "@/lib/dto";
import { AppError } from "@/lib/errors";
import { getConfig, type AppConfig } from "@/lib/config";
import { sha256 } from "@/lib/security/crypto";
import { registrationRepository } from "@/repositories/registration.repository";
import { getCalendarProvider } from "@/services/calendar/calendar.service";
import type {
  CalendarEvent,
  CalendarProvider,
} from "@/services/calendar/calendar.types";

export type EligibleShowing = {
  event: CalendarEvent;
  propertyTitle: string;
  propertyAddress: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  listingUrl?: string;
  publicShowingNotes?: string;
  capacity?: number;
};

const httpsUrl = z
  .string()
  .url()
  .refine((url) => new URL(url).protocol === "https:");

type ShowingConfig = Pick<
  AppConfig,
  | "SHOWING_FILTER_MODE"
  | "SHOWING_EVENT_TYPE"
  | "SHOWING_TITLE_PREFIX"
  | "SHOWING_OPEN_TITLE_PREFIX"
  | "SHOWING_PUBLIC_BLOCK_START"
  | "SHOWING_PUBLIC_BLOCK_END"
>;

type PublicBlock = {
  listingUrl?: string;
  publicShowingNotes?: string;
  capacity?: number;
};

function decodeCalendarHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi,
    (match, decimal: string, hexadecimal: string, named: string) => {
      const codePoint = decimal
        ? Number.parseInt(decimal, 10)
        : hexadecimal
          ? Number.parseInt(hexadecimal, 16)
          : undefined;
      if (
        codePoint !== undefined &&
        Number.isFinite(codePoint) &&
        codePoint >= 0 &&
        codePoint <= 0x10ffff &&
        !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return String.fromCodePoint(codePoint);
      }
      return namedEntities[named?.toLowerCase()] ?? match;
    },
  );
}

function calendarDescriptionLines(description: string): string[] {
  const text = description
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(?:div|p|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  return decodeCalendarHtmlEntities(text)
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .split(/\r?\n/);
}

export function parsePublicShowingBlock(
  description: string | null | undefined,
  startMarker: string,
  endMarker: string,
): PublicBlock {
  const lines = calendarDescriptionLines(description ?? "");
  const start = lines.findIndex((line) => line.trim() === startMarker);
  const end = lines.findIndex(
    (line, index) => index > start && line.trim() === endMarker,
  );
  if (start < 0 || end < 0) return {};

  const values = new Map<string, string>();
  for (const line of lines.slice(start + 1, end)) {
    const match = line.match(/^\s*(Listing|Notes|Capacity)\s*:\s*(.*?)\s*$/i);
    if (!match?.[1] || !match[2] || values.has(match[1].toLowerCase()))
      continue;
    values.set(match[1].toLowerCase(), match[2]);
  }

  const listingUrl = httpsUrl.safeParse(values.get("listing"));
  const capacityText = values.get("capacity");
  const capacity =
    capacityText && /^\d{1,4}$/.test(capacityText)
      ? Number(capacityText)
      : undefined;
  return {
    listingUrl: listingUrl.success ? listingUrl.data : undefined,
    publicShowingNotes: values.get("notes")?.slice(0, 500),
    capacity: capacity && capacity > 0 ? capacity : undefined,
  };
}

export function showingSelectionVersion(showing: EligibleShowing): string {
  return sha256(
    JSON.stringify([
      showing.event.id,
      showing.propertyTitle,
      showing.propertyAddress,
      showing.startDateTime,
      showing.endDateTime,
      showing.timezone,
      showing.listingUrl ?? null,
      showing.publicShowingNotes ?? null,
      showing.capacity ?? null,
    ]),
  );
}

export function sanitizeShowing(
  event: CalendarEvent,
  config: ShowingConfig,
  now: Date,
): EligibleShowing | null {
  const privateProperties = event.extendedProperties?.private ?? {};
  const titlePrefix =
    config.SHOWING_FILTER_MODE === "dedicated_calendar"
      ? config.SHOWING_OPEN_TITLE_PREFIX
      : config.SHOWING_TITLE_PREFIX;
  const usesCalendarUiFields =
    config.SHOWING_FILTER_MODE !== "extended_property";
  const matchesFilter = usesCalendarUiFields
    ? Boolean(event.summary?.startsWith(titlePrefix))
    : privateProperties.eventType === config.SHOWING_EVENT_TYPE &&
      privateProperties.registrationEnabled === "true";
  if (!matchesFilter) return null;
  if (
    event.status === "cancelled" ||
    !event.start?.dateTime ||
    !event.end?.dateTime
  )
    return null;

  const start = new Date(event.start.dateTime);
  const end = new Date(event.end.dateTime);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start <= now ||
    end <= start
  ) {
    return null;
  }

  const rawTitle = event.summary?.trim() || "Property showing";
  const propertyTitle = usesCalendarUiFields
    ? rawTitle.slice(titlePrefix.length).trim() || "Property showing"
    : rawTitle;
  const publicBlock = usesCalendarUiFields
    ? parsePublicShowingBlock(
        event.description,
        config.SHOWING_PUBLIC_BLOCK_START,
        config.SHOWING_PUBLIC_BLOCK_END,
      )
    : {};
  const rawCapacity = usesCalendarUiFields
    ? publicBlock.capacity?.toString()
    : privateProperties.capacity;
  const parsedCapacity = rawCapacity
    ? Number.parseInt(rawCapacity, 10)
    : undefined;
  const listingUrl = usesCalendarUiFields
    ? { success: Boolean(publicBlock.listingUrl), data: publicBlock.listingUrl }
    : httpsUrl.safeParse(privateProperties.listingUrl);

  return {
    event,
    propertyTitle: propertyTitle.slice(0, 160),
    propertyAddress: (
      (usesCalendarUiFields
        ? event.location
        : privateProperties.propertyAddress) ||
      "Address shared after registration"
    ).slice(0, 240),
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
    timezone: event.start.timeZone || "UTC",
    listingUrl: listingUrl.success ? listingUrl.data : undefined,
    publicShowingNotes: usesCalendarUiFields
      ? publicBlock.publicShowingNotes
      : privateProperties.publicShowingNotes?.slice(0, 500),
    capacity:
      parsedCapacity && Number.isFinite(parsedCapacity) && parsedCapacity > 0
        ? parsedCapacity
        : undefined,
  };
}

type CountsRepository = {
  countActiveForEvent(eventId: string): Promise<number>;
  listForInvitation(
    invitationId: string,
  ): Promise<Array<{ calendarEventId: string; status: string }>>;
};

export class ShowingService {
  constructor(
    private readonly calendar: CalendarProvider,
    private readonly counts: CountsRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly config: ShowingConfig = getConfig(),
  ) {}

  async listForInvitation(invitationId: string): Promise<PublicShowingDto[]> {
    const now = this.now();
    const [events, registrations] = await Promise.all([
      this.calendar.listUpcomingEvents(now),
      this.counts.listForInvitation(invitationId),
    ]);
    const registered = new Set(
      registrations
        .filter((registration) => registration.status === "CONFIRMED")
        .map((registration) => registration.calendarEventId),
    );

    const candidates = events.flatMap((event) => {
      const showing = sanitizeShowing(event, this.config, now);
      return showing ? [showing] : [];
    });
    const publicShowings = await Promise.all(
      candidates.map(async (showing): Promise<PublicShowingDto | null> => {
        const count = showing.capacity
          ? await this.counts.countActiveForEvent(showing.event.id)
          : undefined;
        if (
          showing.capacity &&
          count !== undefined &&
          count >= showing.capacity
        )
          return null;
        return {
          eventId: showing.event.id,
          propertyTitle: showing.propertyTitle,
          propertyAddress: showing.propertyAddress,
          startDateTime: showing.startDateTime,
          endDateTime: showing.endDateTime,
          timezone: showing.timezone,
          listingUrl: showing.listingUrl,
          publicShowingNotes: showing.publicShowingNotes,
          selectionVersion: showingSelectionVersion(showing),
          alreadyRegistered: registered.has(showing.event.id),
          remainingCapacity:
            showing.capacity && count !== undefined
              ? Math.max(0, showing.capacity - count)
              : undefined,
        };
      }),
    );
    return publicShowings
      .filter((showing): showing is PublicShowingDto => showing !== null)
      .sort((left, right) =>
        left.startDateTime.localeCompare(right.startDateTime),
      );
  }

  async assertSelectable(
    eventId: string,
    expectedVersion?: string,
  ): Promise<EligibleShowing> {
    const event = await this.calendar.getEvent(eventId);
    const showing = event
      ? sanitizeShowing(event, this.config, this.now())
      : null;
    if (!showing) {
      throw new AppError(
        "SHOWING_UNAVAILABLE",
        "One of the selected showings is no longer available.",
        409,
      );
    }
    if (
      expectedVersion &&
      showingSelectionVersion(showing) !== expectedVersion
    ) {
      throw new AppError(
        "SHOWING_CHANGED",
        "This showing changed while you were deciding. Review the updated details and select it again.",
        409,
      );
    }
    if (showing.capacity) {
      const count = await this.counts.countActiveForEvent(eventId);
      if (count >= showing.capacity) {
        throw new AppError(
          "SHOWING_FULL",
          "One of the selected showings has reached capacity.",
          409,
        );
      }
    }
    return showing;
  }
}

export function getShowingService(): ShowingService {
  return new ShowingService(getCalendarProvider(), registrationRepository);
}
