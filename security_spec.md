# NordFlora Firestore Security Specification

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every plant/group (`/users/{userId}/plants/{plantId}`), log entry (`/users/{userId}/plants/{plantId}/logs/{logId}`), growth timeline photo (`/users/{userId}/plants/{plantId}/growthPhotos/{photoId}`), and monthly room temperature (`/users/{userId}/monthlyTemps/{monthId}`) can only be read, created, updated, or deleted by the authenticated, email-verified user whose `request.auth.uid == userId == resource.data.ownerId`.
2. **Master Gate Relational Integrity**: Subcollection records in `/users/{userId}/plants/{plantId}/logs/{logId}` and `/users/{userId}/plants/{plantId}/growthPhotos/{photoId}` cannot exist without an existing parent plant document owned by the same user (`exists()` + `get()` verification on create/get/delete).
3. **Strict Schema & Bounds**:
   - `quantity` is `1` when `entryType == 'individual'` and `2..200` when `entryType == 'group'`.
   - `latestLux` is bounded `[0, 150000]`, `baseWaterDays` `[1, 90]`, `dampSnoozeCount` `[0, 1000]`, `daylightHours` `[0.5, 18]`, `avgTempC` `[5, 42]`, `minTempC <= avgTempC <= maxTempC`, `humidityPct` `[15, 95]`.
   - `photoDataUrl` is strictly capped at `180000` characters (~130KB JPEG) to protect document size limits.
4. **Temporal & Identity Immutability**: `createdAt == request.time` on creation; `ownerId`, `id`, `monthKey`, and `createdAt` are immutable on update; `updatedAt == request.time` on update.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write**: `auth == null` reading `/users/alice/plants/p1` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: `auth.uid == 'alice'`, `email_verified == false` creating a plant -> `PERMISSION_DENIED`.
3. **Cross-Tenant Spoofing**: `auth.uid == 'bob'` writing `/users/alice/plants/p1` with `ownerId: 'bob'` -> `PERMISSION_DENIED`.
4. **OwnerId Hijack**: `auth.uid == 'alice'` writing `/users/alice/plants/p1` with `ownerId: 'bob'` -> `PERMISSION_DENIED`.
5. **Ghost Field / Shadow Update**: `auth.uid == 'alice'` adding `{ isAdmin: true }` on plant create or update -> `PERMISSION_DENIED`.
6. **ID Poisoning**: Creating `/users/alice/plants/bad$id..!` or 200-char ID -> `PERMISSION_DENIED`.
7. **Individual vs Group Quantity Mismatch**: `entryType: 'individual'` with `quantity: 5` or `entryType: 'group'` with `quantity: 1` -> `PERMISSION_DENIED`.
8. **Out-of-Range Lux / Denial of Wallet**: `latestLux: 9999999` or `photoDataUrl` > 180,000 chars -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: `createdAt` set to past timestamp instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: Updating `createdAt` or `id` on an existing plant -> `PERMISSION_DENIED`.
11. **Orphaned Subcollection Log**: Creating `/users/alice/plants/nonexistent/logs/l1` -> `PERMISSION_DENIED`.
12. **Inverted Temperature Range**: Creating monthly temp with `minTempC: 28, avgTempC: 20, maxTempC: 24` -> `PERMISSION_DENIED`.
