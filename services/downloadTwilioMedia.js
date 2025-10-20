import fetch from "node-fetch";

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
  console.warn("⚠️ Twilio credentials missing; media downloads will fail.");
}

export async function downloadTwilioMedia(mediaUrl) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials missing");
  }
  const response = await fetch(mediaUrl, {
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64"),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio media download failed (${response.status}): ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return { buffer: Buffer.from(arrayBuffer), contentType };
}
