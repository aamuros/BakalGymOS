import "server-only";

import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { cookies } from "next/headers";

const scryptAsync = promisify(scrypt);
const staffPinCookieName = "gymledger_staff_pin_session";

export async function hashStaffPin(pin: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = (await scryptAsync(pin, salt, 32)) as Buffer;

  return `scrypt$${salt}$${hash.toString("base64url")}`;
}

export async function clearStaffPinSession() {
  const cookieStore = await cookies();

  cookieStore.delete(staffPinCookieName);
}
