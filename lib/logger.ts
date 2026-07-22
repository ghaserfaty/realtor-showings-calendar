import "server-only";
import { getConfig } from "@/lib/config";

type LogLevel = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SECRET_KEY = /token|secret|authorization|cookie|code|password|refresh/i;
const ranks: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function redact(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey),
      ]),
    );
  }
  return value;
}

function write(level: LogLevel, message: string, fields: Fields = {}): void {
  if (ranks[level] < ranks[getConfig().LOG_LEVEL]) return;
  const safeFields = redact(fields);
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(safeFields && typeof safeFields === "object" ? safeFields : {}),
  });
  if (level === "error") console.error(record);
  else if (level === "warn") console.warn(record);
  else console.info(record);
}

export const logger = {
  debug: (message: string, fields?: Fields) => write("debug", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};
