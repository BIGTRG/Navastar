-- Migration: Track A — Escrow state transition actor audit fields
-- Adds lastActorId, lastActorType, and lastTransitionAt to EscrowTransaction
-- so every escrow state change records who triggered it and when.

ALTER TABLE "EscrowTransaction"
  ADD COLUMN IF NOT EXISTS "lastActorId"      TEXT,
  ADD COLUMN IF NOT EXISTS "lastActorType"    TEXT,
  ADD COLUMN IF NOT EXISTS "lastTransitionAt" TIMESTAMP(3);
