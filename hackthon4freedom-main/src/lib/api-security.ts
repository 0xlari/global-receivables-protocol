import { DomainError } from "@/domain/errors";

const buckets = new Map<string, { count: number; resetsAt: number }>();

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  if (!origin || origin !== expected) {
    throw new DomainError("Origem da solicitação inválida.", "CSRF_REJECTED");
  }
}

export function assertJsonPayloadSize(request: Request, maxBytes = 8_192) {
  const raw = request.headers.get("content-length");
  if (raw && Number(raw) > maxBytes) {
    throw new DomainError("Solicitação muito grande.", "PAYLOAD_TOO_LARGE");
  }
}

export function enforceRateLimit(key: string, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return;
  }
  if (current.count >= limit) {
    throw new DomainError("Muitas tentativas. Aguarde um minuto.", "RATE_LIMITED");
  }
  current.count += 1;
}
