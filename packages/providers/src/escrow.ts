// EscrowConnector seam (instant-payout / assurance). State machine:
//   FEE_COLLECTED → FUNDS_HELD → BOL_SIGNED → RELEASED → PAID
// Digital-BOL e-sign fires the release. MVP: an in-memory/stub provider that
// just advances state; a real provider slots in via ESCROW_PROVIDER env.
// Fully exercised in Phase 2 · Module 9.
import { EscrowState } from "@navastar/db";

export interface EscrowOpenInput {
  shipmentId: string;
  feeCents: number;
  holdCents: number;
}

export interface EscrowConnector {
  name: string;
  open(input: EscrowOpenInput): Promise<{ externalRef: string; state: EscrowState }>;
  fund(externalRef: string): Promise<{ state: EscrowState }>;
  signBol(externalRef: string): Promise<{ state: EscrowState }>;
  release(externalRef: string): Promise<{ state: EscrowState }>;
  markPaid(externalRef: string): Promise<{ state: EscrowState }>;
}

const VALID_TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  [EscrowState.FEE_COLLECTED]: [EscrowState.FUNDS_HELD],
  [EscrowState.FUNDS_HELD]: [EscrowState.BOL_SIGNED],
  [EscrowState.BOL_SIGNED]: [EscrowState.RELEASED],
  [EscrowState.RELEASED]: [EscrowState.PAID],
  [EscrowState.PAID]: [],
};

export function canTransition(from: EscrowState, to: EscrowState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export class StubEscrowConnector implements EscrowConnector {
  name = "stub";
  private states = new Map<string, EscrowState>();

  async open(input: EscrowOpenInput) {
    const externalRef = `escrow_stub_${input.shipmentId}`;
    this.states.set(externalRef, EscrowState.FEE_COLLECTED);
    return { externalRef, state: EscrowState.FEE_COLLECTED };
  }
  private advance(externalRef: string, to: EscrowState): EscrowState {
    const from = this.states.get(externalRef) ?? EscrowState.FEE_COLLECTED;
    if (!canTransition(from, to)) {
      throw new Error(`Invalid escrow transition ${from} → ${to}`);
    }
    this.states.set(externalRef, to);
    return to;
  }
  async fund(ref: string) {
    return { state: this.advance(ref, EscrowState.FUNDS_HELD) };
  }
  async signBol(ref: string) {
    return { state: this.advance(ref, EscrowState.BOL_SIGNED) };
  }
  async release(ref: string) {
    return { state: this.advance(ref, EscrowState.RELEASED) };
  }
  async markPaid(ref: string) {
    return { state: this.advance(ref, EscrowState.PAID) };
  }
}

let cached: EscrowConnector | null = null;
export function getEscrowConnector(): EscrowConnector {
  if (!cached) cached = new StubEscrowConnector();
  return cached;
}
