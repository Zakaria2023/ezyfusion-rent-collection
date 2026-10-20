# Subagent: Gateway signature and HTTP helpers


### 🧑 User

You are writing two small foundation modules for a timed technical assessment (rent collection, Next.js 16 App Router route handlers). Repo: C:\Users\Lenovo\Desktop\ezyfusion-rent-collection (Windows; Bash tool is Git Bash; use pnpm). Read CLAUDE.md (conventions: arrow functions, types at top of file, braces on every if, no `any`, no non-null `!`, named exports) and docs/TASK.md sections 5 (webhook), 6 and 7 (status codes, error shape `{ "error": "message" }`).

YOUR FILES ONLY: src/lib/gateway-signature.ts, src/lib/gateway-signature.test.ts, src/lib/server/http.ts. Others work in parallel. Do NOT git commit or push. Do not install packages.

1. src/lib/gateway-signature.ts (pure; only node:crypto):
   - parseCallbackBody(raw: string): { ok: true; fields: Record<string, string> } | { ok: false } — parse application/x-www-form-urlencoded with URLSearchParams; reject (ok:false) if any key appears twice (ambiguous for signing). Unknown extra fields are kept (the gateway may add fields; they are part of the signature).
   - signatureSource(fields): every field except x_signature, keys sorted ascending by character code (plain `<` comparison, not localeCompare), `${key}${value}` joined by '|'.
   - computeSignature(fields, key): HMAC-SHA256 lowercase hex.
   - verifySignature(fields, key): false if x_signature missing or not /^[0-9a-f]{64}$/; otherwise crypto.timingSafeEqual on the two 32-byte buffers (constant time). Throw if key is empty (misconfiguration must not accept anything).
   - parsePaidAt(s): Date | null for exactly 'YYYY-MM-DD HH:mm:ss ±HHMM' (validate real calendar date/time ranges; apply the offset; machine-timezone independent).
   - parseSenAmount(s): number | null for /^\d+$/ safe integers.
   - Tests: the brief's test vector (key test_x_signature_key → 06994fab2d674e7829144eaa2204631716d3c099b503d38945e92b6296531641 with source idbill_8f3a2c|paidtrue|paid_amount210050|paid_at2026-04-01 00:30:12 +0800|transaction_idTX-000123|transaction_statuscompleted); a body produced the way the brief's simulator does it (new URLSearchParams(fields).toString(), note '+' and spaces get encoded) verifies; tampered amount fails; extra field included in signature; missing/short/uppercase-garbage signature fails; duplicate key rejected; parsePaidAt('2026-04-01 00:30:12 +0800') === 2026-03-31T16:30:12Z; invalid dates null.
2. src/lib/server/http.ts (`import "server-only"` at top; Next route-handler helpers):
   - class HttpError extends Error { status: number } plus factories: badRequest(msg), unauthorized(), forbidden(), notFound(), conflict(msg), unprocessable(msg).
   - jsonError(status, message) → NextResponse.json({ error: message }, { status }).
   - route handler wrapper: `handle = <C>(fn: (req: Request, ctx: C) => Promise<Response>) => async (req: Request, ctx: C) => …` that maps HttpError → jsonError, zod ZodError → 400 with a short message, everything else → 500 'Internal error' with console.error of the error message ONLY (never request bodies/secrets).
   - readJson = async <T>(req: Request, schema: z.ZodType<T>) → parsed T or throws badRequest (invalid JSON or schema failure, short message naming the first issue's path).
   - json(data, status = 200) helper.
   zod is v4 (`import { z } from "zod"`); check node_modules/zod for the v4 API you use. Check how Next 16 route handler context types look (node_modules/next/dist/docs if present, or the types) — e.g. `{ params: Promise<{ leaseId: string }> }` — and make the wrapper generic so routes keep that typing.
Run `pnpm vitest run src/lib/gateway-signature.test.ts`, `pnpm lint`, `pnpm typecheck` (typecheck errors in files that are not yours can be ignored — others are mid-edit — but mention them).

Final report (concise): exported signatures of both modules, test results, and 2-4 one-line decisions (what / why / rejected alternative) for docs/DECISIONS.md.


### 🧑 User

<system-reminder>
Your final report is delivered through SubagentHandback: when your work is complete, call SubagentHandback({message: <your full report>}). The call ends your run, so make it your last step. Only a SubagentHandback call reaches your caller as your result; plain text you write at the end is not delivered. Do not also send the report with SendMessage: your caller would get it twice.
</system-reminder>


### 🤖 Assistant

**→ tool `Grep`**: `{"pattern": "^#", "path": "C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\docs\\TASK.md", "output_mode": "content"}`


### 🤖 Assistant

**→ tool `Glob`**: `{"pattern": "src/lib/**/*"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
1:# Technical Assessment - Rent Collection
10:## Read This First
29:## 1. The Business
39:### Roles
49:## 2. Local Setup and Seed Data
68:### Organizations and accounts
80:### Units and leases
90:### Payments on Aisyah's lease
95:## 3. Billing Rules - lib/billing.ts
128:### generateSchedule
151:### invoiceStatus
160:### parseRinggitToSen
164:## 4. Payments
166:### Recording a payment
173:### Approving, rejecting and voiding (managers only)
180:### Allocation
188:### Collections report
192:## 5. Online Payments
200:### Webhook
236:### Simulator
267:## 6. Access Control
274:### Server code
283:### Data API
298:### Storage
302:## 7. HTTP API
349:## 8. Database
370:## 9. UI
389:## Part B - Code Review (REVIEW.md)
509:## Part C - Decisions (DECISIONS.md)
520:## Bonus (optional, only if done well)
527:## Submission
534:## How We Assess
556:## Rules
```
</details>


### ⚙️ Tool

<details><summary>tool result</summary>

```
src\lib\server\prisma.ts
src\lib\supabase\server.ts
src\lib\supabase\client.ts
src\lib\supabase\config.ts
src\lib\utils.ts
```
</details>


### 🤖 Assistant

**→ tool `Read`**: `{"file_path": "C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\docs\\TASK.md", "offset": 192, "limit": 160}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
192	## 5. Online Payments
193	
194	A tenant pays online like this:
195	
196	1. The tenant clicks Pay now on their lease. Your API creates a gateway bill for the amount due now: the unpaid amounts of the lease's invoices due on or before today's Malaysia date. If nothing is due, refuse. Bill ids must be impossible to guess.
197	2. In production the tenant would now be redirected to the gateway. In this test, show the bill id and amount: we play the gateway using the simulator below.
198	3. The gateway calls your webhook, POST /api/webhooks/gateway. Only the webhook can settle a bill. The gateway also sends the tenant back to /payments/return?bill_id=...&paid=true. That page only shows the bill's real status from your database and changes nothing.
199	
200	### Webhook
201	
202	The request body is application/x-www-form-urlencoded, with these fields. The gateway may add more fields in future.
203	
204	| Field              | Example                    | Notes                                                    |
205	| ------------------ | -------------------------- | -------------------------------------------------------- |
206	| id                 | bill_8f3a2c                | Your bill id (this short example is guessable; yours must not be) |
207	| paid               | true                       | true or false                                            |
208	| paid_amount        | 210050                     | Amount in sen; 0 when not paid                           |
209	| pa…
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "cat package.json && cat src/lib/server/prisma.ts && cat node_modules/zod/package.json | grep '\"version\"' && ls node_modules/next/dist/docs 2>/dev/null | head; cat eslint.config.* 2>/dev/null | head -80; cat vitest.config.* 2>/dev/null", "description": "Inspect package.json, prisma helper, zod version, configs"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
{
  "name": "ezyfusion-rent-collection",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run --passWithNoTests",
    "check": "pnpm lint && pnpm typecheck && pnpm format:check && pnpm test",
    "db:reset": "supabase db reset",
    "db:pull": "prisma db pull && prisma generate",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@base-ui/react": "^1.9.0",
    "@date-fns/tz": "^1.5.0",
    "@hookform/resolvers": "^6.0.0",
    "@prisma/adapter-pg": "^7.10.1",
    "@prisma/client": "^7.10.1",
    "@supabase/ssr": "^0.12.7",
    "@supabase/supabase-js": "^2.118.0",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "cn": "^0.5.0",
    "date-fns": "^4.4.0",
    "lucide-react": "1.17.0",
    "next": "16.2.7",
    "pg": "^8.23.1",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "react-hook-form": "7.78.0",
    "server-only": "^0.0.1",
    "shadcn": "^4.22.1",
    "tailwind-merge": "3.6.0",
    "tw-animate-css": "1.4.0",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "4.3.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.23.1",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "16.2.7",
    "prettier": "^3.9.10",
   …
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "grep -rn \"RouteContext\" node_modules/next/dist/docs/01-app | head -10; grep -rln \"route.ts\\b\" node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/ | head", "description": "Search Next docs for RouteContext typing"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:189:In TypeScript, you can type the `context` parameter for Route Handlers with the globally available [`RouteContext`](/docs/app/api-reference/file-conventions/route#route-context-helper) helper:
node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md:194:export async function GET(_req: NextRequest, ctx: RouteContext<'/users/[id]'>) {
node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md:221:export async function GET(_: Request, ctx: RouteContext<'/docs/md/[...slug]'>) {
node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md:314:- [`RouteContext`](/docs/app/api-reference/file-conventions/route#route-context-helper)
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md:113:When using TypeScript, you can add types for `params` depending on your configured route segment — use [`PageProps<'/route'>`](/docs/app/api-reference/file-conventions/page#page-props-helper), [`LayoutProps<'/route'>`](/docs/app/api-reference/file-conventions/layout#layout-props-helper), or [`RouteContext<'/route'>`](/docs/app/api-reference/file-conventions/route#route-context-helper) to type `params` in `page`, `layout`, and `route` respectively.
node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md:337:  { params }: RouteContext<'/api/posts/[id]'>
node_modules/next/dist/docs/01-app/03-api-reference/03-file-convent…
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "grep -n \"unstable_rethrow\" node_modules/next/navigation.d.ts node_modules/next/dist/client/components/navigation.d.ts 2>/dev/null | head; grep -rn \"unstable_rethrow\" node_modules/next/dist/docs/01-app/03-api-reference/04-functions/*.md | head -3; cat tsconfig.json | head -30; ls src/app/api 2>/dev/null", "description": "Check unstable_rethrow availability and tsconfig"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
Exit code 2
node_modules/next/dist/client/components/navigation.d.ts:128:export { notFound, forbidden, unauthorized, redirect, permanentRedirect, RedirectType, unstable_rethrow, } from './navigation.react-server';
node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md:2:title: unstable_rethrow
node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md:3:description: API Reference for the unstable_rethrow function.
node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md:7:`unstable_rethrow` can be used to avoid catching internal errors thrown by Next.js when attempting to handle errors thrown in your application code.
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
```
</details>


### 🤖 Assistant

**→ tool `Write`**: `{"file_path": "C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\src\\lib\\gateway-signature.ts", "content": "import { createHmac, timingSafeEqual } from \"node:crypto\";\n\n// Pure helpers for the payment gateway callback (docs/TASK.md section 5).\n// No I/O, no env access: the route handler passes the key in.\n\ntype CallbackFields = Record<string, string>;\n\ntype ParseResult = { ok: true; fields: CallbackFields } | { ok: false };\n\nconst SIGNATURE_FIELD = \"x_signature\";\nconst SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;\nconst PAID_AT_PATTERN =\n  /^(\\d{4})-(\\d{2})-(\\d{2}) (\\d{2}):(\\d{2}):(\\d{2}) ([+-])(\\d{2})(\\d{2})$/;\nconst SEN_PATTERN = /^\\d+$/;\n\n// application/x-www-form-urlencoded → flat record. A key sent twice is\n// rejected: we could not say which value was signed. Unknown keys are kept,\n// because they are part of the signature source.\nexport const parseCallbackBody = (raw: string): ParseResult => {\n  const entries = new Map<string, string>();\n  for (const [key, value] of new URLSearchParams(raw)) {\n    if (entries.has(key)) {\n      return { ok: false };\n    }\n    entries.set(key, value);\n  }\n  // fromEntries defines own properties, so a \"__proto__\" key stays plain data.\n  return { ok: true, fields: Object.fromEntries(entries) };\n};\n\n// Ascending by UTF-16 code unit (same order as Array.prototype.sort's default),\n// deliberately not localeCompare, whose order depends on the ICU locale.\nconst byCharCode = (a: string, b: string): nu…`


### ⚙️ Tool

<details><summary>tool result</summary>

```
File created successfully at: C:\Users\Lenovo\Desktop\ezyfusion-rent-collection\src\lib\gateway-signature.ts (file state is current in your context — no need to Read it back)
```
</details>


### 🤖 Assistant

Let me clean up the `parsePaidAt` destructuring, which is awkward.


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "python - <<'EOF'\nimport re\np='src/lib/gateway-signature.ts'\ns=open(p,encoding='utf-8').read()\nstart=s.index(\"export const parsePaidAt\")\nend=s.index(\"// Integer sen as sent\")\nnew='''export const parsePaidAt = (s: string): Date | null => {\n  const match = PAID_AT_PATTERN.exec(s);\n  if (!match) {\n    return null;\n  }\n  const [y, mo, d, h, mi, sec, oh, om] = [1, 2, 3, 4, 5, 6, 8, 9].map(\n    (group) => Number(match[group]),\n  );\n  if (\n    y === undefined ||\n    mo === undefined ||\n    d === undefined ||\n    h === undefined ||\n    mi === undefined ||\n    sec === undefined ||\n    oh === undefined ||\n    om === undefined\n  ) {\n    return null;\n  }\n  if (\n    y < 1000 ||\n    mo < 1 ||\n    mo > 12 ||\n    d < 1 ||\n    d > daysInMonth(y, mo) ||\n    h > 23 ||\n    mi > 59 ||\n    sec > 59 ||\n    oh > 14 ||\n    om > 59\n  ) {\n    return null;\n  }\n  const offsetMinutes = (match[7] === \"-\" ? -1 : 1) * (oh * 60 + om);\n  const utcMs = Date.UTC(y, mo - 1, d, h, mi, sec) - offsetMinutes * 60_000;\n  return new Date(utcMs);\n};\n\n'''\ns=s[:start]+new+s[end:]\nopen(p,'w',encoding='utf-8',newline='\\n').write(s)\nEOF\ngrep -n \"y < 1000\" -B3 src/lib/gateway-signature.ts | head", "description": "Rewrite parsePaidAt body more cleanly"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
94-    return null;
95-  }
96-  if (
97:    y < 1000 ||
```
</details>


### 🤖 Assistant

**→ tool `Write`**: `{"file_path": "C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\src\\lib\\server\\http.ts", "content": "import \"server-only\";\nimport { unstable_rethrow } from \"next/navigation\";\nimport { NextResponse } from \"next/server\";\nimport { z } from \"zod\";\n\n// Route-handler plumbing: one error shape ({ error }) and one place that maps\n// thrown errors to status codes (docs/TASK.md sections 6 and 7).\n\ntype RouteFn<C> = (req: Request, ctx: C) => Promise<Response>;\n\nexport class HttpError extends Error {\n  readonly status: number;\n\n  constructor(status: number, message: string) {\n    super(message);\n    this.name = \"HttpError\";\n    this.status = status;\n  }\n}\n\nexport const badRequest = (message: string) => new HttpError(400, message);\nexport const unauthorized = () => new HttpError(401, \"Unauthorized\");\nexport const forbidden = () => new HttpError(403, \"Forbidden\");\nexport const notFound = () => new HttpError(404, \"Not found\");\nexport const conflict = (message: string) => new HttpError(409, message);\nexport const unprocessable = (message: string) => new HttpError(422, message);\n\nexport const json = (data: unknown, status = 200) =>\n  NextResponse.json(data, { status });\n\nexport const jsonError = (status: number, message: string) =>\n  NextResponse.json({ error: message }, { status });\n\n// \"amountSen: Invalid input: expected number\" — names the first failing field,\n// never echoes the submitted value.\nconst describeZodError = (error:…`


### 🤖 Assistant

**→ tool `Write`**: `{"file_path": "C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\src\\lib\\gateway-signature.test.ts", "content": "import { createHmac } from \"node:crypto\";\nimport { describe, expect, it } from \"vitest\";\nimport {\n  computeSignature,\n  parseCallbackBody,\n  parsePaidAt,\n  parseSenAmount,\n  signatureSource,\n  verifySignature,\n} from \"./gateway-signature\";\n\nconst KEY = \"test_x_signature_key\";\nconst VECTOR_SOURCE =\n  \"idbill_8f3a2c|paidtrue|paid_amount210050|paid_at2026-04-01 00:30:12 +0800|transaction_idTX-000123|transaction_statuscompleted\";\nconst VECTOR_SIGNATURE =\n  \"06994fab2d674e7829144eaa2204631716d3c099b503d38945e92b6296531641\";\n\nconst exampleFields = (): Record<string, string> => ({\n  id: \"bill_8f3a2c\",\n  paid: \"true\",\n  paid_amount: \"210050\",\n  paid_at: \"2026-04-01 00:30:12 +0800\",\n  transaction_id: \"TX-000123\",\n  transaction_status: \"completed\",\n});\n\n// Mirrors the brief's gateway-sim.mjs exactly.\nconst simulatorBody = (fields: Record<string, string>, key: string): string => {\n  const source = Object.keys(fields)\n    .sort()\n    .map((k) => `${k}${fields[k]}`)\n    .join(\"|\");\n  const signed = {\n    ...fields,\n    x_signature: createHmac(\"sha256\", key).update(source).digest(\"hex\"),\n  };\n  return new URLSearchParams(signed).toString();\n};\n\nconst parseOrThrow = (raw: string): Record<string, string> => {\n  const parsed = parseCallbackBody(raw);\n  if (!parsed.ok) {\n    throw new Error(\"expected bod…`


### ⚙️ Tool

<details><summary>tool result</summary>

```
File created successfully at: C:\Users\Lenovo\Desktop\ezyfusion-rent-collection\src\lib\server\http.ts (file state is current in your context — no need to Read it back)
```
</details>


### ⚙️ Tool

<details><summary>tool result</summary>

```
File created successfully at: C:\Users\Lenovo\Desktop\ezyfusion-rent-collection\src\lib\gateway-signature.test.ts (file state is current in your context — no need to Read it back)
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "pnpm vitest run src/lib/gateway-signature.test.ts 2>&1 | tail -15; pnpm exec eslint src/lib/gateway-signature.ts src/lib/gateway-signature.test.ts src/lib/server/http.ts; echo \"lint exit $?\"; pnpm typecheck 2>&1 | tail -20; pnpm exec prettier --check src/lib/gateway-signature.ts src/lib/gateway-signature.test.ts src/lib/server/http.ts", "description": "Run tests, lint, typecheck, prettier check", "timeout": 300000}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
Exit code 1

 RUN  v5.0.5 C:/Users/Lenovo/Desktop/ezyfusion-rent-collection


 Test Files  1 passed (1)
      Tests  42 passed (42)
   Start at  13:05:31
   Duration  189ms (transform 51%, import 25%, tests 14%, worker 9%)

lint exit 0

> ezyfusion-rent-collection@0.1.0 typecheck C:\Users\Lenovo\Desktop\ezyfusion-rent-collection
> tsc --noEmit

Checking formatting...
[[33mwarn[39m] src/lib/gateway-signature.ts
[[33mwarn[39m] Code style issues found in the above file. Run Prettier with --write to fix.
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "pnpm exec prettier --write src/lib/gateway-signature.ts && git diff --stat; pnpm lint 2>&1 | tail -5; pnpm vitest run src/lib/gateway-signature.test.ts 2>&1 | grep Tests", "description": "Format file, run full lint and re-run tests", "timeout": 300000}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
src/lib/gateway-signature.ts 132ms
 package.json   |  2 ++
 pnpm-lock.yaml | 34 ++++++++++++++++++++++++++++++++++
 2 files changed, 36 insertions(+)

> ezyfusion-rent-collection@0.1.0 lint C:\Users\Lenovo\Desktop\ezyfusion-rent-collection
> eslint

      Tests  42 passed (42)
[This command modified 1 file you've previously read: src\lib\gateway-signature.ts. Call Read before editing.]
```
</details>


### 🤖 Assistant

**→ tool `SubagentHandback`**: `{"message": "I wrote all three files. All 42 tests pass, `pnpm lint` and `pnpm typecheck` are clean across the whole repo, and Prettier passes on my files (I ran `--write` on `gateway-signature.ts`). Nothing is committed. The working tree also shows `package.json` and `pnpm-lock.yaml` changed, which is someone else's edit, not mine.\n\n**`C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\src\\lib\\gateway-signature.ts`** (pure, only uses `node:crypto`)\n```ts\nparseCallbackBody(raw: string): { ok: true; fields: Record<string, string> } | { ok: false }\nsignatureSource(fields: Record<string, string>): string\ncomputeSignature(fields: Record<string, string>, key: string): string   // lowercase hex\nverifySignature(fields: Record<string, string>, key: string): boolean   // throws if key === \"\"\nparsePaidAt(s: string): Date | null\nparseSenAmount(s: string): number | null\n```\n- `parseCallbackBody` builds a Map and then calls `Object.fromEntries`, so a `__proto__` key stays plain data.\n- `parsePaidAt` uses only `Date.UTC`, so the machine's timezone doesn't matter. It accepts offsets up to ±1459 and years from 1000.\n- `parseSenAmount` accepts leading zeros, e.g. `\"007\"` → 7.\n\n**`C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\src\\lib\\server\\http.ts`** (starts with `import \"server-only\"`)\n```ts\nclass HttpError extends Error { readonly status: number; constructor(status: number, message: string) }\nbadRequest(msg) / unauthorized() / forbidden() / notFound…`


### ⚙️ Tool

<details><summary>tool result</summary>

```
{"success":true,"message":"Report delivered to your caller."}
```
</details>
