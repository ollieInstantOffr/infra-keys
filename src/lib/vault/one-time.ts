"use client";

/**
 * A recovery code is shown exactly once. Parking it in a module singleton
 * means it survives the client-side hop from setup to the recovery screen
 * and dies on reload — unlike sessionStorage, which would leave it on disk.
 */
type Pending = { code: string; touchId: boolean };

let pending: Pending | null = null;

export function stashRecoveryCode(code: string, touchId: boolean) {
  pending = { code, touchId };
}

export function takeRecoveryCode(): Pending | null {
  return pending;
}

export function clearRecoveryCode() {
  pending = null;
}
