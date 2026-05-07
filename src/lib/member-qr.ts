export const memberQrPrefix = "gymledger:member:";

export function createMemberQrPayload(qrToken: string) {
  return `${memberQrPrefix}${qrToken}`;
}

export function parseMemberQrPayload(value: string) {
  const trimmed = value.trim();
  const token = trimmed.startsWith(memberQrPrefix)
    ? trimmed.slice(memberQrPrefix.length)
    : trimmed;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
    ? token.toLowerCase()
    : null;
}
