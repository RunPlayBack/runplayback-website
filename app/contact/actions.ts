"use server";

import { redirect } from "next/navigation";

const contactEmail = "rik@runplayback.com";

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function getRedirectPath(formData: FormData) {
  const redirectPath = getString(formData, "redirect_path");

  return redirectPath === "/partner" ? "/partner" : "/contact";
}

function redirectWithError(path: string, error: unknown): never {
  const message =
    error instanceof Error
      ? error.message
      : "Unable to send message. Please try again.";

  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function getContactFromEmail() {
  return (
    process.env.CONTACT_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    "RunPlayBack Website <onboarding@resend.dev>"
  );
}

export async function sendContactMessage(formData: FormData) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const redirectPath = getRedirectPath(formData);
  const formContext = getString(formData, "form_context") || "contact";
  const firstName = getString(formData, "first_name");
  const lastName = getString(formData, "last_name");
  const email = getString(formData, "email");
  const subject = getString(formData, "subject");
  const message = getString(formData, "message");
  const website = getString(formData, "website");

  if (website) {
    redirect(`${redirectPath}?sent=1`);
  }

  if (!firstName || !lastName || !email || !subject || !message) {
    redirectWithError(
      redirectPath,
      new Error("Please fill out every field before sending."),
    );
  }

  if (!resendApiKey) {
    redirectWithError(
      redirectPath,
      new Error(
        "Contact email is not configured yet. Add RESEND_API_KEY to .env.local.",
      ),
    );
  }

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: getContactFromEmail(),
      to: contactEmail,
      reply_to: email,
      subject: `RunPlayBack ${formContext}: ${subject}`,
      text: [
        `Form: ${formContext}`,
        `Name: ${firstName} ${lastName}`,
        `Email: ${email}`,
        `Subject: ${subject}`,
        "",
        message,
      ].join("\n"),
    }),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;

    redirectWithError(
      redirectPath,
      new Error(data?.message || "Unable to send message. Please try again."),
    );
  }

  redirect(`${redirectPath}?sent=1`);
}
