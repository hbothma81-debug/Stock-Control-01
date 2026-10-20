// The signature under every email the app sends (Heinrich, 20 Oct 2026:
// "should be on all depending on who is signed in, each person can add
// there own signiture if that helps, but the font, colour and company logo
// should be automatic").
//
// The words are each person's own (email_signatures, one row per login,
// setup-email-signatures.sql); the look is the app's: ERS's Outlook
// signature, dark blue bold Calibri, the logo from Company Details under
// it, sent inside the email (not a link Outlook would block). A login with
// no saved words signs with one made from its name, the company phone and
// the mailbox the email goes from (defaultSignature).
//
// No browser and no database in here, so it can all be tested
// (signature.test.js); the reading and saving are in useSignature.jsx.

export const SIGNATURE_COLOUR = "#1F3864";
export const LOGO_CONTENT_ID = "ers-logo";
const COMPANY_LINE = "Eastrand Engineering and Transmission Supplies";
const OFFICE_PHONE = "+27 10 880 5268";

const escapeHtml = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// The signature a person gets before they have saved their own, laid out
// as the staff's Outlook ones are. No cell: the app does not know it.
export function defaultSignature({ name, phone, mailbox } = {}) {
  const lines = ["Kind Regards,", String(name || "").trim(), ""];
  lines.push(`Tel:  ${String(phone || "").trim() || OFFICE_PHONE}`);
  if (String(mailbox || "").trim()) lines.push(`Email :  ${String(mailbox).trim()}`);
  lines.push("", COMPANY_LINE);
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n").trim();
}

// The words to sign with: their own when saved, otherwise the made one.
export function signatureText(saved, fallback) {
  const own = String(saved || "").replace(/\r\n/g, "\n").trim();
  return own || defaultSignature(fallback);
}

// The signature as the email shows it. With a logo it sits under the words.
export function signatureHtml(text, { withLogo = false } = {}) {
  const words = escapeHtml(String(text || "").trim()).replace(/\n/g, "<br>");
  const logo = withLogo ? `<br><br><img src="cid:${LOGO_CONTENT_ID}" alt="East Rand Supplies" width="230" style="width:230px;height:auto">` : "";
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;font-weight:bold;color:${SIGNATURE_COLOUR}">${words}${logo}</div>`;
}

// The message's own words, in the same font, not bold, in black.
export function messageHtml(text) {
  const words = escapeHtml(String(text || "").trimEnd()).replace(/\n/g, "<br>");
  return `<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#000000">${words}</div>`;
}

// Company Details keeps the logo as "data:image/png;base64,....". The
// email carries it as a picture attached inside the message, which mail
// programs show without asking. Nothing usable gives null.
export function logoAttachment(dataUrl) {
  const m = /^data:(image\/(?:png|jpe?g|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || "").trim());
  if (!m) return null;
  const type = m[1].toLowerCase().replace("image/jpg", "image/jpeg");
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: `ers-logo.${type.split("/")[1].replace("jpeg", "jpg")}`,
    contentType: type,
    contentBytes: m[2].replace(/\s/g, ""),
    isInline: true,
    contentId: LOGO_CONTENT_ID,
  };
}

// The whole email body as HTML: the message, a blank line, the signature.
export function bodyWithSignature(text, signature, { withLogo = false } = {}) {
  const sig = String(signature || "").trim();
  return sig ? `${messageHtml(text)}<br>${signatureHtml(sig, { withLogo })}` : messageHtml(text);
}

// Puts the signature on a message made by graphMessage (emailRules.js):
// the body turns to HTML and the logo joins the attachments. sig is
// { text, logo } from useSignature; with no text the message goes as it was.
export function signMessage(payload, sig) {
  const text = String(sig?.text || "").trim();
  if (!text || !payload?.message) return payload;
  const logo = logoAttachment(sig.logo);
  const message = {
    ...payload.message,
    body: { contentType: "HTML", content: bodyWithSignature(payload.message.body?.content || "", text, { withLogo: !!logo }) },
  };
  if (logo) message.attachments = [...(payload.message.attachments || []), logo];
  return { ...payload, message };
}

// What a reply in a thread (Graph's /reply and /replyAll) is given: the
// words as HTML in `comment`, so the earlier mails stay quoted under it,
// and the logo as an attachment on `message`.
export function signedReply(text, sig) {
  const signature = String(sig?.text || "").trim();
  const logo = signature ? logoAttachment(sig.logo) : null;
  const out = { comment: bodyWithSignature(text, signature, { withLogo: !!logo }) };
  if (logo) out.message = { attachments: [logo] };
  return out;
}
