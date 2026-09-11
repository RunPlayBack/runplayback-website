"use server";

import { redirect } from "next/navigation";

const contactEmail = "rik@runplayback.com";
const minimumSubmitTimeMs = 5000;
const maximumSubmitTimeMs = 1000 * 60 * 60 * 6;

const inquiryLabels: Record<string, string> = {
  brand_partnership: "Brand partnership",
  media_inquiry: "Media inquiry",
  other: "Other",
  product_review: "Product review request",
  viewer_question: "Viewer question",
};

const blockedPhrases = [
  "backlink",
  "casino",
  "crypto",
  "da 50",
  "domain authority",
  "guest post",
  "increase your traffic",
  "link building",
  "link insertion",
  "loan",
  "rank higher",
  "search engine optimization",
  "seo audit",
  "seo services",
  "telegram",
  "whatsapp",
];

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

function getInquiryLabel(value: string) {
  return inquiryLabels[value] || "Other";
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length || 0;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLikelySpam({
  email,
  firstName,
  lastName,
  message,
  startedAt,
  subject,
}: {
  email: string;
  firstName: string;
  lastName: string;
  message: string;
  startedAt: string;
  subject: string;
}) {
  let score = 0;
  const combined = `${firstName} ${lastName} ${email} ${subject} ${message}`.toLowerCase();
  const submittedAt = Number(startedAt);
  const elapsedMs = Number.isFinite(submittedAt) ? Date.now() - submittedAt : 0;

  if (!isValidEmail(email)) {
    score += 4;
  }

  if (elapsedMs < minimumSubmitTimeMs || elapsedMs > maximumSubmitTimeMs) {
    score += 4;
  }

  if (message.length < 25 || subject.length < 3) {
    score += 2;
  }

  if (countMatches(combined, /https?:\/\//g) > 1) {
    score += 3;
  }

  if (countMatches(combined, /\b(www\.|\.ru|\.cn|\.xyz|bit\.ly|tinyurl)\b/g) > 0) {
    score += 2;
  }

  score += blockedPhrases.filter((phrase) => combined.includes(phrase)).length * 2;

  return score >= 4;
}

export async function sendContactMessage(formData: FormData) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const redirectPath = getRedirectPath(formData);
  const formContext = getString(formData, "form_context") || "contact";
  const firstName = getString(formData, "first_name");
  const lastName = getString(formData, "last_name");
  const email = getString(formData, "email");
  const inquiryType = getString(formData, "inquiry_type");
  const subject = getString(formData, "subject");
  const message = getString(formData, "message");
  const website = getString(formData, "website");
  const companyUrl = getString(formData, "company_url");
  const startedAt = getString(formData, "started_at");

  if (website || companyUrl) {
    redirect(`${redirectPath}?sent=1`);
  }

  if (!firstName || !lastName || !email || !inquiryType || !subject || !message) {
    redirectWithError(
      redirectPath,
      new Error("Please fill out every field before sending."),
    );
  }

  if (
    isLikelySpam({
      email,
      firstName,
      lastName,
      message,
      startedAt,
      subject,
    })
  ) {
    redirect(`${redirectPath}?sent=1`);
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
      subject: `RunPlayBack ${getInquiryLabel(inquiryType)}: ${subject}`,
      text: [
        `Form: ${formContext}`,
        `Inquiry: ${getInquiryLabel(inquiryType)}`,
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
