# AI logs

Transcripts of the Claude Code session used to build this project: one lead
session that planned the work, delegated it to subagents running in
parallel, reviewed every result and made every commit.

- [`main-session.md`](main-session.md): the lead session, readable
  (my prompts, the assistant's replies, tool calls and truncated results).
- [`subagents/`](subagents/): one readable transcript per subagent.
- [`raw/`](raw/): the untouched `.jsonl` transcripts (main session and every
  subagent), as Claude Code stored them.

Subagents, in the order they ran:

| Wave | Subagent |
| ---- | -------- |
| 1 — foundations | [Schema, RLS, storage migration](subagents/schema--rls--storage-migration.md) · [Billing, dates, money pure libs](subagents/billing--dates--money-pure-libs.md) · [Gateway signature and HTTP helpers](subagents/gateway-signature-and-http-helpers.md) · [Write Part B REVIEW.md](subagents/write-part-b-review-md.md) · [UI shell](subagents/ui-shell--shadcn--login--layout.md) |
| 2 — server | [Server core: auth, payments, leases API](subagents/server-core--auth--payments--leases-api.md) · [Gateway bills and webhook](subagents/gateway-bills-and-webhook.md) |
| 3 — app | [Seed script via app services](subagents/seed-script-via-app-services.md) · [Staff/manager UI pages](subagents/staff-manager-ui-pages.md) · [Tenant portal UI pages](subagents/tenant-portal-ui-pages.md) · [Access-control test matrix](subagents/access-control-test-matrix.md) |
| 4 — independent verification | [Audit: brief contract compliance](subagents/audit--brief-contract-compliance.md) · [Audit: security and access control](subagents/audit--security-and-access-control.md) · [Audit: money, dates, concurrency](subagents/audit--money--dates--concurrency.md) · [Black-box grader simulation](subagents/black-box-grader-simulation.md) |
| 5 — UI and final checks | [UI design polish pass](subagents/ui-design-polish-pass.md) · [UI smoke test all roles](subagents/ui-smoke-test-all-roles.md) |

Where the AI got things wrong and how it was caught (DECISIONS.md, Part C
question 6): search `main-session.md` for "ERESOLVE",
"conditions=react-server" and "😀😀😀".
