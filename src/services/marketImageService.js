const logger = require("../logger");

const SUPABASE_URL = () => (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
const SUPABASE_BUCKET = () => process.env.SUPABASE_BUCKET || "Tienda";

function ensureStorageEnv() {
  const url = SUPABASE_URL();
  const key = SUPABASE_SERVICE_ROLE_KEY();

  if (!url || !key) {
    throw new Error("Supabase storage env vars are not configured");
  }

  return { url, key, bucket: SUPABASE_BUCKET() };
}

function sanitizePathSegment(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "general";
}

async function uploadMarketImage({ categoryName, buffer, contentType = "image/webp" }) {
  const { url, key, bucket } = ensureStorageEnv();
  const safeCategory = sanitizePathSegment(categoryName);
  const fileName = `${Date.now()}.webp`;
  const objectPath = `${safeCategory}/${fileName}`;
  const uploadUrl = `${url}/storage/v1/object/${bucket}/${objectPath}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: buffer,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    logger.error({ status: response.status, errorText, objectPath }, "Supabase upload failed");
    throw new Error(`Supabase upload failed (${response.status})`);
  }

  const publicUrl = `${url}/storage/v1/object/public/${bucket}/${objectPath}`;
  return { url: publicUrl, path: objectPath };
}

module.exports = {
  uploadMarketImage,
};
