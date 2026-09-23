import sgMail from "@sendgrid/mail";

// Email: SendGrid. Without it, messages (and their links) are printed to the server log.
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

// SMS: Twilio. Without it, codes are printed to the server log (auth.ts only allows this outside production).
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

export function isEmailConfigured(): boolean {
  return Boolean(SENDGRID_API_KEY && EMAIL_FROM);
}

export function isSmsConfigured(): boolean {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!isEmailConfigured()) {
    console.log(`\n📧 [email not configured] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await sgMail.send({ to, from: EMAIL_FROM!, subject, text });
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (!isSmsConfigured()) {
    console.log(`\n📱 [SMS not configured] To: ${to}\n${body}\n`);
    return;
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER!, Body: body }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Twilio error ${response.status}: ${details.slice(0, 300)}`);
  }
}
