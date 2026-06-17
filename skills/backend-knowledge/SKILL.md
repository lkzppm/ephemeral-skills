---
name: backend-knowledge
description: Procedural primer on backend engineering — REST design, DB schema/indexing, auth, caching, error handling, idempotency, and pagination.
ephemeral: true
evict-after: used
evict-keep-tokens: 30
---

# Backend Engineering Primer

A step-by-step reference for building production-grade HTTP APIs. Work through each section in order when designing a new service, or jump to the relevant section when debugging an existing one.

---

## 1. REST API Design

### Resource modelling

1. Name resources as **nouns, plural**: `/users`, `/orders`, `/invoices/{id}/line-items`.
2. Use sub-resources for strict ownership relationships: `GET /users/{id}/addresses`. Avoid nesting deeper than two levels — flatten with query params instead (`GET /addresses?userId=…`).
3. Keep resource identifiers opaque and stable. Prefer UUIDs over sequential integers for public-facing IDs (prevents enumeration, survives shard migrations).

### HTTP verbs

| Verb | Semantics | Safe | Idempotent |
|------|-----------|------|------------|
| GET | Read | yes | yes |
| HEAD | Read (no body) | yes | yes |
| POST | Create / trigger | no | no |
| PUT | Replace (full) | no | yes |
| PATCH | Partial update | no | no* |
| DELETE | Remove | no | yes |

*PATCH can be made idempotent by operating on explicit field paths rather than deltas.

### Status codes to use consistently

- `200 OK` — successful GET/PUT/PATCH with a body.
- `201 Created` — POST that created a resource; include `Location: /resource/{id}`.
- `204 No Content` — successful DELETE or PATCH with no body.
- `400 Bad Request` — validation failure; include a machine-readable error body (`{ "errors": [{ "field": "email", "code": "INVALID_FORMAT" }] }`).
- `401 Unauthorized` — missing or invalid credentials.
- `403 Forbidden` — authenticated but not authorised.
- `404 Not Found` — resource doesn't exist (use for unknown IDs, not for empty collections).
- `409 Conflict` — optimistic-lock collision, duplicate key.
- `422 Unprocessable Entity` — well-formed request that violates business rules.
- `429 Too Many Requests` — rate limit; include `Retry-After`.
- `500 Internal Server Error` — unexpected; log and alert; never surface stack traces.

### Versioning

Prefer **URL versioning** (`/v1/`, `/v2/`) for major breaking changes. Use header-based (`Accept: application/vnd.api+json;version=2`) only when URLs must stay stable. Never version individual endpoints — bump the whole API version.

---

## 2. Database Schema and Indexing

### Schema design steps

1. Start with a domain model (entities + relationships), not tables.
2. Apply normalization to at least 3NF before denormalizing for performance.
3. Choose primary key type: **UUID v7** (sortable, globally unique, safe for sharding) is the modern default; serial integers are fine for private/internal tables.
4. Capture audit columns on every table: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
5. Use `NOT NULL` by default; allow NULL only when absence is a meaningful business state.
6. Use enum types or check constraints to enumerate valid states rather than free-form strings.

### Foreign keys

Always declare FK constraints — they catch data integrity bugs cheaply. On cascades: use `ON DELETE RESTRICT` (the default) unless the child rows are meaningless without the parent (then `CASCADE`). Never use `ON DELETE SET NULL` unless the column is nullable for a real reason.

### Index design checklist

1. Every FK column that you query by should have an index.
2. Check the query plan (`EXPLAIN ANALYZE`) before adding speculative indexes — unused indexes slow writes.
3. Composite indexes: **column order matters**. Put the most selective equality predicate first, range predicates last: `(user_id, created_at)` for `WHERE user_id = ? AND created_at > ?`.
4. Partial indexes for common filtered queries: `CREATE INDEX … WHERE status = 'active'`.
5. For full-text search use `tsvector` + GIN in Postgres or a dedicated search service. Never `LIKE '%term%'` on large tables.
6. Index on `updated_at` if you poll for changes.

### Migrations

- Migrations are forward-only in production. Never roll back by reverting a migration; write a new forward migration.
- Non-blocking schema changes: add a nullable column (never `NOT NULL` without a default in one step), backfill in batches, add the constraint, remove the default in a later migration.
- Lock-safe: adding an index concurrently (`CREATE INDEX CONCURRENTLY`) avoids the full table lock.

---

## 3. Authentication and Session Management

### Token strategy

1. **Short-lived access tokens** (JWT or opaque, 15 min): stateless validation, no DB round-trip per request.
2. **Refresh tokens** (opaque, stored in DB, 7–30 days): rotated on each use (refresh-token rotation), revokable, stored `HttpOnly` in a cookie.
3. Invalidation: store a `token_family` + `version` in the DB; bump version on logout/password-change to invalidate all outstanding tokens for that user without a blocklist.

### JWT pitfalls to avoid

- Always validate `iss`, `aud`, and `exp`.
- Never trust `alg: none`.
- Store only a minimal claim set (user ID + roles) — don't put PII in the payload.
- Sign with RS256 (asymmetric) for multi-service architectures; HS256 only when the signing and validating code is co-located.

### Password storage

- Argon2id is the current best practice (winner of the Password Hashing Competition). Bcrypt is acceptable. Never SHA-256 or MD5.
- Parameters: Argon2id memory=64MB, iterations=3, parallelism=4 (adjust so hashing takes 200–500 ms on your hardware).

### Session hygiene

- Rotate session/token IDs on privilege escalation (login, password change, role grant).
- Bind sessions to user-agent fingerprint + IP range (soft) — flag anomalies, don't hard-reject.
- Implement CSRF protection for cookie-based sessions: `SameSite=Strict` or double-submit cookie.

---

## 4. Caching Layers

### Cache placement

| Layer | Tool | Use for |
|-------|------|---------|
| In-process | LRU map / `node-cache` | Hot config, per-instance dedup |
| Shared | Redis / Memcached | Cross-instance objects, session data |
| CDN/edge | CloudFront, Fastly | Public, slow-changing GET responses |
| DB query | Materialized views, query result cache | Expensive aggregations |

### Cache invalidation strategy

1. **TTL-based**: set TTL to the maximum acceptable staleness. Simple, no invalidation logic. Works for reference data (countries, categories).
2. **Event-driven / write-through**: on write, update or delete the cache key. Atomic with the DB write using a transaction outbox or a post-commit hook. Works for entity caches.
3. **Cache-aside**: application checks cache first, falls back to DB, populates cache. Common pattern; prone to stampede on cold start — use probabilistic early expiration (PER) or a mutex per key.

### Cache key design

- Include version/tenant in the key: `v1:user:{id}:profile`.
- Namespace by service to avoid cross-service collisions in a shared Redis.
- Never use mutable business data (email address) as a key — use the stable ID.

### What not to cache

- Personalised write-path responses.
- Anything that must be strongly consistent (balance, inventory).
- Large binary blobs that fit in object storage better.

---

## 5. Error Handling

### Structured error responses

Always return a consistent error envelope:

```json
{
  "error": {
    "code": "PAYMENT_DECLINED",
    "message": "The card was declined by the issuer.",
    "details": [{ "field": "card_number", "issue": "insufficient_funds" }],
    "requestId": "req_01j…"
  }
}
```

- `code` is machine-readable and stable across versions.
- `message` is human-readable English, suitable for display.
- `requestId` links to your observability system.

### Error taxonomy

- **Validation errors** (400/422): enumerate all fields, don't short-circuit on the first failure.
- **Auth errors** (401/403): never leak whether a resource exists to unauthorised callers — return 403 not 404 when the resource exists but is forbidden.
- **Business logic errors** (409/422): use specific domain codes so clients can branch.
- **Unexpected errors** (500): log with full context (request ID, user ID, stack trace); return only the `requestId` to the client.

### Retries and transient failures

- Classify errors as retryable or not. HTTP 429 and 5xx (except 501) are retryable. 4xx (except 429) are not.
- Implement exponential backoff with jitter: `delay = base * 2^attempt + rand(0, base)`.
- Set a maximum retry budget (time-bounded, not just count-bounded).

---

## 6. Idempotency

### Why idempotency keys matter

Networks are unreliable. A client that retries a `POST /payments` without an idempotency key risks double-charging. An idempotency key lets the server deduplicate: if it sees the same key twice, it returns the stored response from the first request.

### Implementation steps

1. Accept an `Idempotency-Key` header on all mutating endpoints.
2. On first request: begin a DB transaction, execute the operation, store `(key, userId, statusCode, responseBody, expiresAt)`, commit.
3. On repeat request with same key (within expiry): return the stored response immediately, **do not re-execute**.
4. On key collision with different payload (same key, different body): return `422` with code `IDEMPOTENCY_KEY_REUSE`.
5. Expire keys after 24 hours (or per your SLA).

### Idempotent by design

PUT and DELETE are idempotent by definition — no extra machinery needed. PATCH can be made idempotent by using field-path operations rather than arithmetic deltas (`{ "op": "set", "path": "/status", "value": "active" }` vs `{ "op": "increment", "path": "/count", "by": 1 }`).

---

## 7. Pagination

### Offset vs cursor

| | Offset (`LIMIT`/`OFFSET`) | Cursor (keyset) |
|---|---|---|
| Performance | Degrades at high offsets | Constant |
| Stable pages | No (rows shift on insert) | Yes |
| Random access | Yes | No |
| Complexity | Low | Medium |

Use **cursor-based** pagination for any collection that changes frequently or that could have >10k rows. Use offset only for admin tools with small, stable datasets.

### Cursor design

1. Encode the sort key(s) + primary key as the cursor: `cursor = base64(JSON.stringify({ createdAt, id }))`.
2. Query: `WHERE (created_at, id) < (cursor.createdAt, cursor.id) ORDER BY created_at DESC, id DESC LIMIT n`.
3. Return `{ data, nextCursor, hasMore }`.
4. Never expose raw DB row IDs or offsets in the cursor — treat it as opaque to clients.

### Response envelope

```json
{
  "data": [ … ],
  "pagination": {
    "nextCursor": "eyJjcmVhdGVkQXQiOiIy…",
    "hasMore": true,
    "pageSize": 25
  }
}
```

Include `hasMore` explicitly; do not force clients to infer it from `data.length < pageSize` (the last page could coincidentally be full).

---

## Quick checklist before shipping an API endpoint

- [ ] Input validated (schema + business rules), all errors surfaced.
- [ ] Auth checked (authn + authz) before any data access.
- [ ] Query uses an index (verified with EXPLAIN ANALYZE).
- [ ] Mutating endpoint accepts idempotency key.
- [ ] Response includes a `requestId` / correlation ID.
- [ ] Errors never leak stack traces or internal paths.
- [ ] Rate limiting and timeout configured.
- [ ] Metrics and structured logs emitted.
