export type PublicInvitationDto = {
  invitedName?: string;
  invitedEmail?: string;
  invitedPhone?: string;
  expiresAt: string;
};

export type PublicShowingDto = {
  eventId: string;
  propertyTitle: string;
  propertyAddress: string;
  startDateTime: string;
  endDateTime: string;
  timezone: string;
  listingUrl?: string;
  publicShowingNotes?: string;
  selectionVersion: string;
  alreadyRegistered: boolean;
  remainingCapacity?: number;
};

export type RealtorShowingDto = Omit<PublicShowingDto, "alreadyRegistered"> & {
  availability: "open" | "closed";
  visibleToLeads: boolean;
  registrationCount: number;
  capacity?: number;
};

export type PublicRegistrationDto = {
  id: string;
  eventId: string;
  status: "CONFIRMED" | "CANCELLED";
  calendarSyncStatus: "PENDING" | "SYNCED" | "ERROR";
  registeredAt: string;
};
