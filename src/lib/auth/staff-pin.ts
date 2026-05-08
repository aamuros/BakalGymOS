import "server-only";

import { randomBytes, scrypt, timingSafeEqual, createHmac } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";

import type { AppProfile } from "@/lib/auth/permissions";
import { createServiceClient } from "@/lib/supabase/server";

const scryptAsync = promisify(scrypt);
const staffPinCookieName = "gymledger_staff_pin_session";
const sessionMaxAgeSeconds = 12 * 60 * 60;

type StaffPinCookiePayload = {
  exp: number;
  profileId: string;
  staffProfileId: string;
};

export type StaffPinSession = {
  profile: AppProfile;
  staffProfileId: string;
};

function getSessionSecret() {
  const secret = process.env.STAFF_PIN_SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Missing STAFF_PIN_SESSION_SECRET.");
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!fallback) {
    throw new Error("Missing STAFF_PIN_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return fallback;
}

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function parseSessionCookie(value: string | undefined): StaffPinCookiePayload | null {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = signPayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeBase64Url(payload)) as StaffPinCookiePayload;

    if (
      !parsed.profileId ||
      !parsed.staffProfileId ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function hashStaffPin(pin: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = (await scryptAsync(pin, salt, 32)) as Buffer;

  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

export async function verifyStaffPin(pin: string, storedHash: string | null) {
  if (!storedHash) {
    return false;
  }

  const [algorithm, salt, hashValue] = storedHash.split("$");

  if (algorithm !== "scrypt" || !salt || !hashValue) {
    return false;
  }

  const hash = Buffer.from(hashValue, "base64url");
  const candidate = (await scryptAsync(pin, salt, hash.length)) as Buffer;

  return hash.length === candidate.length && timingSafeEqual(hash, candidate);
}

export async function setStaffPinSession(staffProfileId: string, profileId: string) {
  const cookieStore = await cookies();
  const payload = encodeBase64Url(
    JSON.stringify({
      exp: Date.now() + sessionMaxAgeSeconds * 1000,
      profileId,
      staffProfileId,
    } satisfies StaffPinCookiePayload),
  );
  const signature = signPayload(payload);

  cookieStore.set(staffPinCookieName, `${payload}.${signature}`, {
    httpOnly: true,
    maxAge: sessionMaxAgeSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearStaffPinSession() {
  const cookieStore = await cookies();

  cookieStore.delete(staffPinCookieName);
}

export async function getStaffPinSession(): Promise<StaffPinSession | null> {
  const cookieStore = await cookies();
  const payload = parseSessionCookie(cookieStore.get(staffPinCookieName)?.value);

  if (!payload) {
    return null;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id, profile_id, status, profiles!staff_profiles_profile_id_fkey(id, full_name, email, role, status)")
    .eq("id", payload.staffProfileId)
    .eq("profile_id", payload.profileId)
    .maybeSingle();

  if (error || !data || data.status !== "active") {
    return null;
  }

  const relatedProfile = Array.isArray(data.profiles) ? data.profiles[0] : data.profiles;

  if (!relatedProfile || relatedProfile.status !== "active") {
    return null;
  }

  return {
    profile: {
      accessMode: "staff_pin",
      email: relatedProfile.email,
      full_name: relatedProfile.full_name,
      id: relatedProfile.id,
      role: "front_desk",
      staffProfileId: data.id,
      status: "active",
    },
    staffProfileId: data.id,
  };
}
