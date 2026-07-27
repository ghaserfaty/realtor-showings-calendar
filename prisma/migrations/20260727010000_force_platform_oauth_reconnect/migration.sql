-- Refresh tokens are bound to the OAuth client that issued them. Connections
-- created with realtor-owned clients cannot be reused by the platform client.
DELETE FROM "GoogleCalendarConnection";
