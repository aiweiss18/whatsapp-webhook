import crypto from "crypto";
import fetch from "node-fetch";

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.warn("⚠️ Cloudinary credentials missing; media uploads will fail.");
}

/**
 * Uploads a binary buffer to Cloudinary and returns the upload response.
 * @param {Buffer} buffer - Image data.
 * @param {Object} options
 * @param {string} options.filename - Base filename without extension.
 * @param {string} [options.folder] - Cloudinary folder name.
 * @param {string} [options.contentType] - MIME type (defaults to image/jpeg).
 */
export async function uploadBufferToCloudinary(
  buffer,
  { filename, folder = "whatsapp-screenshots", contentType = "image/jpeg" }
) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error("Cloudinary configuration is incomplete.");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${filename}-${timestamp}`;

  const paramsToSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}`;
  const signature = crypto.createHash("sha1").update(`${paramsToSign}${CLOUDINARY_API_SECRET}`).digest("hex");

  const body = new URLSearchParams({
    file: `data:${contentType};base64,${buffer.toString("base64")}`,
    api_key: CLOUDINARY_API_KEY,
    timestamp: String(timestamp),
    folder,
    public_id: publicId,
    signature,
  });

  const uploadUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  const response = await fetch(uploadUrl, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${text}`);
  }

  return response.json();
}
