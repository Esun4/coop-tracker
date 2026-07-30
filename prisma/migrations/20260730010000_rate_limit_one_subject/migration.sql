-- Enforce the "exactly one subject" rule at the database level.
--
-- A RateLimitEvent belongs to a signed-in user OR a network address, never
-- both and never neither. The Subject union in src/lib/rate-limit.ts makes
-- this unrepresentable through consume(), but nothing stopped a seed script,
-- a future migration, or a hand-written insert from producing a malformed
-- row — which would then be counted against both budgets, or neither.
--
-- num_nonnulls() is the clearest way to say "exactly one of these".
ALTER TABLE "RateLimitEvent"
  ADD CONSTRAINT "RateLimitEvent_subject_check"
  CHECK (num_nonnulls("userId", "ipHash") = 1);
