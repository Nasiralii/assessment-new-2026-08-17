# Implementation Notes

## 1. What I changed

**Backend**

- Tightened `assertTransition` so it rejects any move that is not in `LEGAL_TRANSITIONS`, in addition to blocking exits from terminal states.
- Implemented `CrService.approve`: requires an approve policy (`cr_a_*`), legal `PENDING_APPROVAL → APPROVED`, records both an approval row and an audit entry. Already-approved CRs are returned unchanged (same idempotent pattern as `reject`).
- Implemented `CrService.apply`: requires an apply policy (`cr_x_*`), legal `APPROVED → APPLIED`, recomputes totals, refuses a positive delta the budget cannot cover (`INSUFFICIENT_BUDGET` with no mutation), otherwise books the delta against `booked`/`balance` and audits.

**Frontend**

- `canApprove` / `canReject` now require **both** `PENDING_APPROVAL` and an approve policy, matching the service.
- Approve/Reject go only through `CrApiClient`. Reject is blocked until a trimmed reason is present. Slow/failing calls keep the loaded CR, disable buttons via `submitting`, and surface `actionError`.

**Seam**

- `CrApiClient` still stands in for HTTP. Business errors are mapped to a plain `Error` with a UI-facing message so templates never see `BusinessError` codes.

## 2. Model of the flow (UI ↔ client ↔ service)

An approver opens a pending CR. The detail component loads it with `client.get(session.user, id)`. That call is delayed by `latencyMs`, then `CrService.get` reads the org-scoped repo. The template enables Approve only when status is `PENDING_APPROVAL` **and** the user has `cr_a_*`.

On Approve, the component sets `submitting`, calls `client.approve(user, id, now)`, and the client invokes `service.approve`. The service checks policy, `assertTransition(PENDING_APPROVAL → APPROVED)`, appends approval + audit, and saves. The client resolves with that CR; the component replaces `state.data` so the status badge and disabled buttons update. On `failNext` or a business error, the client rejects with a plain Error; the component sets `actionError` and leaves the previous CR in place.

Reject is the same path with a required reason forwarded as the service note.

## 3. Invariants I keep

| Invariant                                      | How / where                                                                                                                        |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Only legal transitions; terminals immutable    | `assertTransition` in the state machine; every mutating service method goes through `transition()`                                 |
| Approve/reject/apply require matching policies | Service `isApprover` / `isApplier`; UI `canApprovePolicy` / `canRejectPolicy` so the UI never offers what the service would forbid |
| Budget never overspent                         | `apply` checks `delta > 0 && balance < delta` **before** mutating budget or status                                                 |
| Every successful state change is audited       | `transition()` always appends an audit entry                                                                                       |
| UI cannot reach around the client              | Detail/list depend on `CrApiClient` only (no `CrService` / `CrRepo` imports)                                                       |
| Failed actions keep the view coherent          | Component does not clear `state.data` on action errors; repo is unchanged if the service throws                                    |

## 4. Testing strategy

- Original failing cases: illegal `DRAFT → APPROVED`; Approve disabled for the read-only viewer.
- Backend: happy-path approve + idempotency; forbidden approve; illegal status; apply consumes budget; insufficient budget leaves CR `APPROVED` and budget untouched; apply policy/status; terminal immutability.
- Seam: approve through `CrApiClient`; forbidden mapped to a permission message; `failNext` does not change the CR.
- UI/DOM: permission × status (viewer vs mona vs DRAFT); approve updates rendered status; failed approve shows an alert and keeps `PENDING_APPROVAL`; reject button stays disabled without a reason, then rejects with a note.

I did not add an apply UI (out of the detail-page brief) or HTTP/concurrency tests.

## 5. Assumptions

- Reject on the service stays optional-note (existing signature); the **UI** always requires a trimmed reason. Backend `reject` still uses the approve policy, so the UI reuses `canApprovePolicy` for reject.
- Apply books a non-zero delta onto `booked` and `balance` and leaves `spent` alone (commitment, not invoiced spend). A zero/negative delta does not require spare balance.
- Approve of an already-`APPROVED` CR is idempotent; apply of `APPLIED` is not (terminal throw), matching “terminals cannot change”.
- View models stay as `ChangeRequest` from the scaffold; I translated **errors** at the seam rather than introducing a parallel DTO.
- Org scoping remains the repo’s job; a user in another org gets `NOT_FOUND`, not `FORBIDDEN`.

## 6. Where I used AI

Used Cursor to read the scaffold, implement the missing service/UI paths, add tests, and draft these notes. I specified the invariants (guard, budget-before-mutate, permission × status, client-only UI) and reviewed the generated code against the brief.

## 7. What I'd improve with more time

- Optimistic locking on `version` if two approvers act at once.
- An Apply control in the UI, gated on `cr_x_*` + `APPROVED`, through the same client.
- A dedicated view-model type at the client so the UI does not import backend `ChangeRequest`.
- Return-to-draft in the reviewer UI (the service method already exists).
