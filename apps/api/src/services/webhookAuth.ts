import crypto from 'crypto';

// Shared-secret webhook authentication. The sender computes
//   X-Webhook-Signature: sha256=<hex HMAC-SHA256(rawBody, secret)>
// and we recompute over the exact raw request body and timing-safe compare.
// Fail-closed: a missing secret, missing signature, or mismatch all reject.
export function verifyWebhookSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  secret: string | undefined
): boolean {
  if (!secret || !rawBody || !signatureHeader) return false;
  const provided = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(provided, 'hex');
    b = Buffer.from(expected, 'hex');
  } catch {
    return false;
  }
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Public payment-link direct settlement (the instant operator-wallet mint) is
// ENABLED by default for the demo / Track-2 volume. It is gated by an EXPLICIT
// opt-out flag, deliberately NOT tied to NODE_ENV — a platform that injects
// NODE_ENV=production must not be able to silently disable the demo flow.
// To close vector 3 (once there is real money / real users), set
//   DISABLE_PUBLIC_DIRECT_SETTLEMENT=true
export const isPublicDirectSettlementDisabled = (): boolean =>
  process.env.DISABLE_PUBLIC_DIRECT_SETTLEMENT === 'true';

// Prisma throws P2002 on a unique-constraint violation. With the
// @@unique([merchantId, txHash, direction]) constraint, this means the exact
// transfer is already recorded for this merchant — treat as already-recorded,
// never a 500.
export const isUniqueViolation = (e: any): boolean => e?.code === 'P2002';
