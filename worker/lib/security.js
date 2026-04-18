const encoder = new TextEncoder();
const decoder = new TextDecoder();
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - (normalised.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function hashPassword(password, salt = randomToken(16)) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(password)),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlToBytes(salt),
      // Cloudflare Workers currently rejects PBKDF2 counts above 100000.
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return {
    salt,
    hash: bytesToBase64Url(new Uint8Array(derivedBits)),
  };
}

export async function verifyPassword(password, salt, expectedHash) {
  const derived = await hashPassword(password, salt);
  return derived.hash === expectedHash;
}

export function cookieOptions(maxAgeSeconds = 60 * 60 * 24 * 30, secure = true) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure,
    maxAge: maxAgeSeconds,
  };
}

export function safeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function utf8(value) {
  return decoder.decode(typeof value === "string" ? encoder.encode(value) : value);
}
