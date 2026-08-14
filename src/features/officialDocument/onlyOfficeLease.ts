const MIN_HEARTBEAT_DELAY_MS = 30_000;
const MAX_HEARTBEAT_DELAY_MS = 5 * 60_000;

export function computeOnlyOfficeHeartbeatDelay(leaseExpiresAt?: string, now = Date.now()) {
  const expiresAt = leaseExpiresAt ? Date.parse(leaseExpiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return MIN_HEARTBEAT_DELAY_MS;
  const oneThirdRemainingLease = Math.floor(Math.max(0, expiresAt - now) / 3);
  return Math.min(MAX_HEARTBEAT_DELAY_MS, Math.max(MIN_HEARTBEAT_DELAY_MS, oneThirdRemainingLease));
}
