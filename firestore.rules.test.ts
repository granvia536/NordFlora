/**
 * Security Rules Specification Tests (Dirty Dozen Adversarial Payloads)
 * Intended for validation against @firebase/rules-unit-testing in CI/emulator environments.
 */
export const DIRTY_DOZEN_CASES = [
  { name: '1. Unauthenticated read', path: 'users/alice/plants/p1', expect: 'PERMISSION_DENIED' },
  { name: '2. Unverified email write', path: 'users/alice/plants/p1', emailVerified: false, expect: 'PERMISSION_DENIED' },
  { name: '3. Cross-tenant write', authUid: 'bob', path: 'users/alice/plants/p1', expect: 'PERMISSION_DENIED' },
  { name: '4. OwnerId spoofing', authUid: 'alice', path: 'users/alice/plants/p1', payload: { ownerId: 'bob' }, expect: 'PERMISSION_DENIED' },
  { name: '5. Shadow ghost field', authUid: 'alice', path: 'users/alice/plants/p1', payload: { isAdmin: true }, expect: 'PERMISSION_DENIED' },
  { name: '6. Invalid path ID characters', authUid: 'alice', path: 'users/alice/plants/bad$id', expect: 'PERMISSION_DENIED' },
  { name: '7. Group/individual quantity mismatch', authUid: 'alice', path: 'users/alice/plants/p1', payload: { entryType: 'individual', quantity: 4 }, expect: 'PERMISSION_DENIED' },
  { name: '8. Lux out of bounds', authUid: 'alice', path: 'users/alice/plants/p1', payload: { latestLux: 500000 }, expect: 'PERMISSION_DENIED' },
  { name: '9. Forged createdAt timestamp', authUid: 'alice', path: 'users/alice/plants/p1', payload: { createdAt: '2020-01-01T00:00:00Z' }, expect: 'PERMISSION_DENIED' },
  { name: '10. Mutating immutable id/createdAt', authUid: 'alice', path: 'users/alice/plants/p1', expect: 'PERMISSION_DENIED' },
  { name: '11. Orphaned log without parent plant', authUid: 'alice', path: 'users/alice/plants/missing/logs/l1', expect: 'PERMISSION_DENIED' },
  { name: '12. Inverted minTempC > avgTempC', authUid: 'alice', path: 'users/alice/monthlyTemps/2026-11', payload: { minTempC: 26, avgTempC: 20, maxTempC: 24 }, expect: 'PERMISSION_DENIED' },
] as const;
