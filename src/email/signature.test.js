import test from "node:test";
import assert from "node:assert/strict";
import { defaultSignature, signatureText, signatureHtml, logoAttachment, signMessage, signedReply, SIGNATURE_COLOUR } from "./signature.js";
import { graphMessage } from "./emailRules.js";

const LOGO = "data:image/png;base64,iVBORw0KGgo=";

test("a made signature reads like the staff's Outlook ones", () => {
  assert.equal(
    defaultSignature({ name: "Mark Bezuidenhout", phone: "", mailbox: "sales@ersupplies.co.za" }),
    "Kind Regards,\nMark Bezuidenhout\n\nTel:  +27 10 880 5268\nEmail :  sales@ersupplies.co.za\n\nEastrand Engineering and Transmission Supplies"
  );
});

test("a made signature with no mailbox leaves the Email line out", () => {
  assert.doesNotMatch(defaultSignature({ name: "Test" }), /Email/);
});

test("a saved signature wins; an empty one falls back to the made one", () => {
  assert.equal(signatureText("  Kind Regards,\r\nGawie  ", { name: "x" }), "Kind Regards,\nGawie");
  assert.match(signatureText("   ", { name: "Andries de Klerk" }), /^Kind Regards,\nAndries de Klerk\n/);
});

test("the signature is dark blue bold, its typed text kept as text", () => {
  const html = signatureHtml("Kind Regards,\n<b>Mark</b> & co");
  assert.match(html, new RegExp(`color:${SIGNATURE_COLOUR}`));
  assert.match(html, /font-weight:bold/);
  assert.match(html, /Kind Regards,<br>&lt;b&gt;Mark&lt;\/b&gt; &amp; co/);
  assert.doesNotMatch(html, /<img/);
  assert.match(signatureHtml("x", { withLogo: true }), /<img src="cid:ers-logo"/);
});

test("the logo goes inside the email as a picture, not a link", () => {
  const a = logoAttachment(LOGO);
  assert.equal(a.isInline, true);
  assert.equal(a.contentId, "ers-logo");
  assert.equal(a.contentType, "image/png");
  assert.equal(a.contentBytes, "iVBORw0KGgo=");
  assert.equal(logoAttachment("data:image/jpg;base64,AAAA").contentType, "image/jpeg");
  assert.equal(logoAttachment(""), null);
  assert.equal(logoAttachment("https://example.com/logo.png"), null);
});

test("signing a document email turns it to HTML and adds the logo beside the PDF", () => {
  const plain = graphMessage({
    to: ["a@b.co.za"],
    subject: "PO-0001",
    body: "Good day,\n\nPlease find attached.",
    attachment: { fileName: "PO-0001.pdf", base64: "JVBERi0=" },
  });
  const signed = signMessage(plain, { text: "Kind Regards,\nHeinrich", logo: LOGO });
  assert.equal(signed.message.body.contentType, "HTML");
  assert.match(signed.message.body.content, /Good day,<br><br>Please find attached\./);
  assert.match(signed.message.body.content, /Kind Regards,<br>Heinrich/);
  assert.deepEqual(signed.message.attachments.map((a) => a.name), ["PO-0001.pdf", "ers-logo.png"]);
  assert.equal(signed.saveToSentItems, true);
  assert.equal(plain.message.body.contentType, "Text", "the original is left alone");
});

test("no signature text sends the email exactly as it was", () => {
  const plain = graphMessage({ to: ["a@b.co.za"], subject: "s", body: "b" });
  assert.equal(signMessage(plain, { text: "", logo: LOGO }), plain);
});

test("no logo on file still signs, without a picture", () => {
  const signed = signMessage(graphMessage({ to: ["a@b.co.za"], subject: "s", body: "b" }), { text: "Heinrich", logo: "" });
  assert.doesNotMatch(signed.message.body.content, /<img/);
  assert.equal(signed.message.attachments, undefined);
});

test("a reply in a thread carries the signature in its comment and the logo on its message", () => {
  const r = signedReply("Hi Shovan,\n\nPlease send a pro forma.", { text: "Kind Regards,\nHeinrich", logo: LOGO });
  assert.match(r.comment, /Hi Shovan,<br><br>Please send a pro forma\./);
  assert.match(r.comment, /cid:ers-logo/);
  assert.equal(r.message.attachments[0].isInline, true);
  assert.equal(signedReply("x", { text: "", logo: LOGO }).message, undefined);
});
