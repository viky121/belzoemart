# Delivery Module: Requirement to Unit Map

User Stories were skipped, so the map uses the requirement ids `DL-x` from `delivery-module-requirements.md`.
Every Phase 1 requirement belongs to one primary unit; UI or wiring in another unit is shown in the second column.

| Requirement | Primary unit | Also touches |
|---|---|---|
| DL-1.1 Admin manages partners | U8.1 (API) | U8.3 (screens) |
| DL-1.2 Partner login | U8.1 | U8.4 (screen) |
| DL-1.3 Separate partner sessions | U8.1 | none |
| DL-1.4 Online flag, heartbeat, GPS | U8.1 | U8.4 |
| DL-1.5 Zones and suggestions | U8.1 | U8.3 |
| DL-2.1 Admin assigns | U8.1 | U8.3 |
| DL-2.2 Job, token and OTP created | U8.1 | none |
| DL-2.3 Partner sees only own jobs | U8.1 | U8.4 |
| DL-2.4 Accept, reject, timeout | U8.1 | U8.4 |
| DL-2.5 Reassign | U8.1 | U8.3 |
| DL-3.1 to DL-3.4 State machine, events | U8.1 | none |
| DL-4.1, DL-4.2 Delivery OTP | U8.1 | U8.4 |
| DL-4.3 Delivered needs payment | U8.2 (gate) | U8.1 (extension point) |
| DL-4.4 Proof | U8.2 | U8.4 |
| DL-5.1, DL-5.2 COD and cash | U8.2 | U8.4 |
| DL-5.3, DL-5.4, DL-5.5 UPI QR | U8.2 | U8.4 |
| DL-5.6 QR expiry, late payment | U8.2 | U8.3 (attention list) |
| DL-5.7 Ledger, settlement, earnings | U8.2 | U8.3 |
| DL-6.1 Timeline and order sync | U8.1 (sync) | U8.5 (label check, partner details) |
| DL-6.2 Public tracking page | U8.5 | none |
| DL-6.3 Rating | U8.5 | none |
| DL-6.4 E-mails | U8.5 | none |
| DL-6.5 In-app notification | U8.5 | none |
| DL-7.1 Admin screens | U8.3 | none |
| DL-7.4 Permissions | U8.1 (guards) | U8.3 |
| DL-8.1 Repeatable jobs | U8.1 (three), U8.2 (`qr-expiry`) | U8.5 (`notify`) |
| DL-8.2 Worker heartbeat | U8.1 | none |
| NFR-D1 Security | all units; designed in NFR Design for U8.1, U8.2, U8.4 | |
| NFR-D2 Resiliency | U8.1, U8.2 | |
| NFR-D3 Money | U8.1 (helpers), U8.2 | |
| NFR-D4 Performance | U8.1 (indexes), U8.4 | |
| NFR-D5 Accessibility, mobile UX | U8.4 | U8.3 |
| NFR-D6 Testing | each unit | |
| NFR-D7 Deploy only on request | all | |

Check: every Phase 1 requirement (DL-1 to DL-6, DL-7.1, DL-7.4, DL-8) has a primary unit. DL-7.2 and DL-7.3 are Phase 2 and 3 and have no unit yet.
