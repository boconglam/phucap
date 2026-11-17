# Security Specification & Payload-First TDD

## 1. Data Invariants
1. **Unauthenticated Denial**: No user can read, list, create, update, or delete any document without an authenticated, email-verified Firebase session.
2. **Owner & Role Isolation**:
   - `users/{userId}` can only be read or modified by the user whose `request.auth.uid == userId` or by an Admin. Non-admins cannot escalate `role` beyond `'teacher'`.
   - `personnel/{staffId}` can only be created, updated, or deleted by Admins. Teachers can only read their own matched record (`email == request.auth.token.email` or `linkedUid == request.auth.uid`).
   - `timesheets/{timesheetId}` must always bind `ownerUid` to the authenticated creator (unless Admin). Approved timesheets (`status == 'approved'`) are terminally locked against non-Admin modification or deletion.
   - `system_settings/{schoolId}` can only be modified by Admins; readable by verified signed-in users.
3. **Temporal & Schema Integrity**: Every document must conform to strict key allowlists (`hasAll` + `hasOnly`), string length bounds, bounded list sizes, and server-side `request.time` timestamps.

## 2. Dirty Dozen Attack Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Write**: Creating a `timesheets` doc with `request.auth == null`.
2. **Unverified Email Spoof**: Creating `system_settings` with `email == 'boconglam@gmail.com'` and `email_verified == false`.
3. **Self-Role Escalation on Registration**: Creating `users/{uid}` with `role: 'admin'`.
4. **Role Escalation on Update**: Teacher updating `users/{uid}` changing `role` from `'teacher'` to `'admin'`.
5. **Shadow / Ghost Field Injection**: Creating `timesheets/{id}` with an undeclared field `isBypassed: true`.
6. **ID Poisoning (Oversized Path ID)**: Creating `timesheets/{1500_char_id}` exceeding 128 chars or containing invalid symbols.
7. **Identity Spoofing on Create**: Teacher A creating `timesheets/{id}` with `ownerUid: 'teacher_B_uid'`.
8. **Immutable Field Tampering**: Teacher updating `timesheets/{id}` changing `ownerUid` or `createdAt`.
9. **Terminal State Bypass**: Teacher updating `timesheets/{id}` when existing `status == 'approved'`.
10. **Client Timestamp Forgery**: Creating `timesheets/{id}` with backdated `createdAt` != `request.time`.
11. **Unbounded Array / DoW Payload**: Creating `timesheets/{id}` with 500 entries in `classes` or `weeks`.
12. **PII Cross-User Scraping**: Teacher A listing or reading `users/{teacher_B_uid}` or `personnel` belonging to Teacher B.
