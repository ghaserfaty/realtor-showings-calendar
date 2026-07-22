import "server-only";
import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const config = getConfig();
    if (config.NODE_ENV === "production") {
      throw new AppError(
        "EMAIL_UNAVAILABLE",
        "Email delivery is not configured.",
        503,
      );
    }
    console.info(
      `[development email] to=${message.to} subject=${message.subject}\n${message.text}`,
    );
  }
}

class WebhookEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    const config = getConfig();
    const response = await fetch(config.EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(config.EMAIL_WEBHOOK_API_KEY
          ? { authorization: `Bearer ${config.EMAIL_WEBHOOK_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new AppError(
        "EMAIL_UNAVAILABLE",
        "Email delivery failed.",
        503,
        false,
      );
  }
}

export function getEmailProvider(): EmailProvider {
  return getConfig().EMAIL_PROVIDER === "webhook"
    ? new WebhookEmailProvider()
    : new ConsoleEmailProvider();
}

export async function sendVerificationEmail(
  email: string,
  code: string,
): Promise<void> {
  await getEmailProvider().send({
    to: email,
    subject: "Your property showing verification code",
    text: `Your verification code is ${code}. It expires in 10 minutes and can be used once.`,
  });
}

export async function sendInvitationEmail(
  email: string,
  invitationUrl: string,
): Promise<void> {
  await getEmailProvider().send({
    to: email,
    subject: "Choose your property showing times",
    text: `Use this private link to choose one or more group showings: ${invitationUrl}\n\nDo not forward this link.`,
  });
}
