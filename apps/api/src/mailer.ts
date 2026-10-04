import type { Locale } from '@mvp/schemas';
import nodemailer from 'nodemailer';

export interface LoginCodeMail {
  email: string;
  code: string;
  locale: Locale;
}

export interface Mailer {
  sendLoginCode(mail: LoginCodeMail): Promise<void>;
}

const TEXTS: Record<Locale, { subject: (code: string) => string; body: (code: string) => string }> =
  {
    ru: {
      subject: (code) => `${code} – код для входа`,
      body: (code) =>
        `Код для входа: ${code}\n\nКод действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте это письмо.`,
    },
    en: {
      subject: (code) => `${code} is your sign-in code`,
      body: (code) =>
        `Your sign-in code: ${code}\n\nThe code is valid for 10 minutes. If you did not request it, just ignore this email.`,
    },
  };

/** Development: the code is printed to the server console instead of being sent. */
export function consoleMailer(): Mailer {
  return {
    async sendLoginCode({ email, code }) {
      console.log(`[mail] sign-in code for ${email}: ${code}`);
    },
  };
}

export function smtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async sendLoginCode({ email, code, locale }) {
      const text = TEXTS[locale];
      await transport.sendMail({
        from,
        to: email,
        subject: text.subject(code),
        text: text.body(code),
      });
    },
  };
}
