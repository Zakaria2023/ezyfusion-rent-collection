# Subagent: Write Part B REVIEW.md


### 🧑 User

Write REVIEW.md (repo root of C:\Users\Lenovo\Desktop\ezyfusion-rent-collection) for "Part B - Code Review" of the assessment brief in docs/TASK.md. Read docs/TASK.md fully first (the brief's rules apply to the PR: roles from memberships/tenants never user_metadata, 401/403/404 semantics, Malaysia time UTC+8, integer sen, webhook behaviour table, collections report including empty months, audit/idempotency/concurrency). Facts given: prisma connects as the database owner (bypasses RLS); createClient() returns a Supabase server client for the current request; assume allocate(tx, paymentId) is correct. Every false positive costs points, so verify each claim by reasoning carefully (and for JS/Prisma/Postgres semantics you are unsure of, check node_modules sources, e.g. whether `prisma.invoice.create(...)` returns a lazy PrismaPromise that only executes when awaited, what Postgres date_trunc on timestamptz does with session TimeZone UTC, what SUM(bigint) returns). Only write REVIEW.md; touch no other file; do NOT git commit.

Format: a short intro stating the line-numbering convention (number each of the three files separately, line 1 = the `// app/...` path comment line as shown in the brief), then findings ordered most → least severe, each with: file + line number(s), a quoted code fragment, what goes wrong as a CONCRETE scenario (actual users/values/times, e.g. a payment at 2026-03-01 00:30 MYT), severity (Critical/High/Medium/Low), and the fix (short code where useful). Then a section "Looks suspicious but is correct" for things that are fine, with the reason. Keep it tight; no padding.

Candidate findings for you to VERIFY (drop any that are wrong, add any I missed):
late-fees route: role from user_metadata (user-editable → any tenant self-promotes); unauthenticated user gets 403 not 401; no org scoping — a manager of Beta can add fees to a Northwind lease and probe existence (should 404); `await nextReference()` runs inside the loop while creates are lazy/unexecuted until Promise.all, so every fee in one request gets the same reference, and concurrent requests race too (read-max-then-insert) → duplicate references (and findFirst by createdAt may return an invoice with null/other-format reference → parseInt NaN / crash); not idempotent — calling twice (or retries/concurrent calls) adds a second 2% fee to the same invoice; Promise.all of independent writes is not a transaction → partial fees on failure; kind 'late_fee' and `reference` are not part of the invoice model in the brief (kind is 'deposit'|'rent', allocation order/statuses assume that) — judge severity; the 0.995 ratio float check skips invoices with up to 0.5% unpaid (e.g. RM 7.50 unpaid on RM 1,500) and is float math on money; Math.round on Number of sen (float math; fine in magnitude? rounding mode for .5 is half-up for positives — judge); fee 0 when unpaid < 25 sen creates a zero invoice; no audit_log row; date logic (todayMyt via +8h then UTC slice; cutoff via Date.parse of a date-only string = UTC midnight; Prisma @db.Date returns UTC-midnight Date) — I believe this part is CORRECT, verify and if so list under "suspicious but correct".
webhook route: logs the full callback fields and the expected signature on failure (brief forbids logging payloads; logging a valid signature for the attacker's own payload hands them a forgery if logs leak); `!==` string compare is not constant-time; paid=false returns 200 without verifying the bill exists or marking a pending bill failed (brief: 404 unknown, pending→failed); paid=true never checks paid_amount equals the bill amount (422 required) — payment recorded at whatever amount the callback says; check-then-act race: status read outside the transaction with no row lock, so two deliveries 5 ms apart both see pending → two payments double-allocating (or, if a unique on gateway_bill_id exists, a 500 for the second → gateway retries); receivedAt = new Date() instead of paid_at → wrong collections month (paid 2026-03-31 23:50 MYT, delivered after midnight → April); BigInt(fields.paid_amount) throws on '' or '12.5' → 500; missing env key `!` → createHmac throws → 500 (fail closed, low); formData() on a non-form body throws → 500; Object.fromEntries drops duplicate keys (verify whether that is actually exploitable given the signature covers the same map).
collections action: a 'use server' exported function is a public POST endpoint — no authentication/authorization and orgId comes from the caller, so anyone can read any org's collections (critical); date_trunc('month', received_at) uses the session timezone (UTC), so the seed's bank transfer at 2026-03-01 00:30 MYT (= 2026-02-28T16:30Z) is reported in February — the brief's expected 2026-03 = 200000 fails; ${from}::date compared with timestamptz casts at UTC midnight → range boundaries off by 8 h; months with no payments are missing (brief requires every month incl. zero, e.g. 2026-02: 0) — fix with generate_series and `received_at at time zone 'Asia/Kuala_Lumpur'`; SUM(bigint) returns numeric → Prisma returns Decimal not bigint (type lie; Number() still works — judge severity); the template literal is parameterised so NOT SQL injection (suspicious-but-correct); no input validation of from/to format → Postgres error 500.

Final message: just say done and list the findings' titles with severities (one line each).


### 🧑 User

<system-reminder>
Your final report is delivered through SubagentHandback: when your work is complete, call SubagentHandback({message: <your full report>}). The call ends your run, so make it your last step. Only a SubagentHandback call reaches your caller as your result; plain text you write at the end is not delivered. Do not also send the report with SendMessage: your caller would get it twice.
</system-reminder>


### 🤖 Assistant

**→ tool `Read`**: `{"file_path": "C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\docs\\TASK.md"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
1	# Technical Assessment - Rent Collection
2	
3	> Brief copied word for word from the assessment page (portal chrome — timer,
4	> account, submit form — omitted). Started 2026-10-20 12:56 UTC+8.
5	
6	Stack: Next.js 16 (App Router) - TypeScript - Supabase (Postgres, Auth, Storage) - Prisma - shadcn/ui - Tailwind CSS
7	
8	Time: the timer above is what counts, normally 4 hours (about 30 min reading - 3 h building - 30 min write-ups and submission)
9	
10	## Read This First
11	
12	AI assistants (Claude Code, Cursor, Copilot...) are allowed and expected. We assess whether you understand and control what gets built. Code you cannot explain counts as not done.
13	
14	Hidden tests. We run automated tests against every rule in this brief, including edge cases that are not in the examples:
15	
16	- your billing functions, about 50 hidden cases, run under TZ=UTC, TZ=Asia/Kuala_Lumpur and TZ=America/New_York
17	- your HTTP API, called as each seeded account, including requests about other organizations' records and concurrent requests
18	- your Supabase Data API and Storage bucket, called directly with your publishable key and each user's token
19	- your payment webhook, with valid, forged, duplicated, concurrent and out-of-order callbacks
20	
21	AI logs. Export the transcript of every AI session you use (in Claude Code: /export) into an ai-logs/ folder in your repo. We do not count how much you used AI. We look at how you directed it, what you checked and what you corrected.
22	
23	Walkt…
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "cd /c/Users/Lenovo/Desktop/ezyfusion-rent-collection; ls node_modules/@prisma/; ls node_modules/@prisma/client/runtime/ | head -50; cat node_modules/@prisma/client/package.json | grep '\"version\"'", "description": "List Prisma runtime files and version"}`


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "cd /c/Users/Lenovo/Desktop/ezyfusion-rent-collection; node -e \"\nconst t=(s)=>{try{return String(BigInt(s))}catch(e){return 'throws '+e.constructor.name}};\nconsole.log(['', ' 12 ', '12.5', '0x10', '-5', undefined, '1e3'].map(s=>JSON.stringify(s)+'=>'+t(s)).join('\\n'));\nconsole.log(Math.round(25*2/100), Math.round(75*2/100), Math.round(Number(150000n-149250n)*2/100));\nconsole.log(149250/150000 >= 0.995, 149249/150000>=0.995);\nconsole.log(new Date(Date.parse('2026-03-09')).toISOString());\nconsole.log(Object.fromEntries(new URLSearchParams('paid=false&paid=true')));\n\"", "description": "Check BigInt parsing, rounding and date parsing semantics"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
adapter-pg
client
client.d.mts
client.d.ts
client.js
client.js.map
client.mjs
client.mjs.map
index-browser.d.mts
index-browser.d.ts
index-browser.js
index-browser.js.map
index-browser.mjs
index-browser.mjs.map
query_compiler_fast_bg.cockroachdb.js
query_compiler_fast_bg.cockroachdb.mjs
query_compiler_fast_bg.cockroachdb.wasm-base64.js
query_compiler_fast_bg.cockroachdb.wasm-base64.mjs
query_compiler_fast_bg.mysql.js
query_compiler_fast_bg.mysql.mjs
query_compiler_fast_bg.mysql.wasm-base64.js
query_compiler_fast_bg.mysql.wasm-base64.mjs
query_compiler_fast_bg.postgresql.js
query_compiler_fast_bg.postgresql.mjs
query_compiler_fast_bg.postgresql.wasm-base64.js
query_compiler_fast_bg.postgresql.wasm-base64.mjs
query_compiler_fast_bg.sqlite.js
query_compiler_fast_bg.sqlite.mjs
query_compiler_fast_bg.sqlite.wasm-base64.js
query_compiler_fast_bg.sqlite.wasm-base64.mjs
query_compiler_fast_bg.sqlserver.js
query_compiler_fast_bg.sqlserver.mjs
query_compiler_fast_bg.sqlserver.wasm-base64.js
query_compiler_fast_bg.sqlserver.wasm-base64.mjs
query_compiler_small_bg.cockroachdb.js
query_compiler_small_bg.cockroachdb.mjs
query_compiler_small_bg.cockroachdb.wasm-base64.js
query_compiler_small_bg.cockroachdb.wasm-base64.mjs
query_compiler_small_bg.mysql.js
query_compiler_small_bg.mysql.mjs
query_compiler_small_bg.mysql.wasm-base64.js
query_compiler_small_bg.mysql.wasm-base64.mjs
query_compiler_small_bg.postgresql.js
query_compiler_small_bg.postgresql.mjs
query_compiler_small_bg.postgresql.wasm…
```
</details>


### ⚙️ Tool

<details><summary>tool result</summary>

```
""=>0
" 12 "=>12
"12.5"=>throws SyntaxError
"0x10"=>16
"-5"=>-5
undefined=>throws TypeError
"1e3"=>throws SyntaxError
1 2 15
true false
2026-03-09T00:00:00.000Z
{ paid: 'true' }
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "cd /c/Users/Lenovo/Desktop/ezyfusion-rent-collection; f=node_modules/@prisma/client/runtime/client.js; grep -o 'function [A-Za-z]*([^)]*){[^}]*then([^}]*}[^}]*}' $f | head -5; grep -o '.\\{300\\}requestTransaction.\\{200\\}' $f | head -2; grep -o '.\\{200\\}\\.then(\\w*,\\w*){return \\w*()\\.then.\\{300\\}' $f | head -3", "description": "Find PrismaPromise lazy then implementation"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
function Ms(e,t,r,n=0){return e._createPrismaPromise(i=>{let o=t.customDataProxyFetch;return"transaction"in t&&i!==void 0&&(t.transaction?.kind==="batch"&&t.transaction.lock.then(),t.transaction=i),n===r.length?e._executeRequest(t):r[n]({model:t.model,operation:t.model?t.action:t.clientMethod,args:Ns(t.args??{}),__internalParams:t,query:(s,a=t)=>{let u=a.customDataProxyFetch;return a.customDataProxyFetch=Ls(o,u),a.args=s,Ms(e,a,r,n+1)}
function jd(e,t){let r=pr(e);if(r)return t(r).then(n=>{let i={type:"value",args:n.value,lastInsertId:n.lastInsertId},o=cr(e,r,i);if(!o)throw new Error("Could not substitute the evaluated impure node into the query plan");return o}
questArgs(e){return e[0]}};function Hi(e){return function(r,n){let i,o=(s=e)=>{try{return s===void 0||s?.kind==="itx"?i??=Fl(r(s)):Fl(r(s))}catch(a){return Promise.reject(a)}};return{get spec(){return n},then(s,a){return o().then(s,a)},catch(s){return o().catch(s)},finally(s){return o().finally(s)},requestTransaction(s){let a=o(s);return a.requestTransaction?a.requestTransaction(s):a},[Symbol.toStringTag]:"PrismaPromise"}}}function Fl(e){return typeof e.then=="function"?e:Promise.resolve(e)}var _l={name:"@prisma/
e $transaction function.");let P=i?.isolationLevel??this._engineConfig.transactionOptions.isolationLevel,T={kind:"batch",id:o,index:m,isolationLevel:P,maxWait:i?.maxWait??this._engineConfig.transactionOptions.maxWait,timeout:i?.timeout??this._engineConfig.transactionOptions.timeout,lock:s};return u.requestTra…
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "cd /c/Users/Lenovo/Desktop/ezyfusion-rent-collection; ls node_modules/@prisma/adapter-pg/dist/; f=$(ls node_modules/@prisma/adapter-pg/dist/index.js); grep -n -i 'date\\b\\|DATE\\|normalize_date\\|numeric\\|NUMERIC' $f | head -40", "description": "Inspect adapter-pg date and numeric handling"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
index.d.mts
index.d.ts
index.js
index.mjs
63:  DATE_ARRAY: 1182,
73:  NUMERIC_ARRAY: 1231,
130:    1082: "date",
138:    1700: "numeric",
176:    3912: "daterange",
186:    4535: "datemultirange",
220:    case ScalarColumnType.DATE:
221:      return import_driver_adapter_utils.ColumnTypeEnum.Date;
227:      return import_driver_adapter_utils.ColumnTypeEnum.DateTime;
228:    case ScalarColumnType.NUMERIC:
230:      return import_driver_adapter_utils.ColumnTypeEnum.Numeric;
257:    case ArrayColumnType.NUMERIC_ARRAY:
259:      return import_driver_adapter_utils.ColumnTypeEnum.NumericArray;
273:    case ArrayColumnType.DATE_ARRAY:
274:      return import_driver_adapter_utils.ColumnTypeEnum.DateArray;
278:      return import_driver_adapter_utils.ColumnTypeEnum.DateTimeArray;
280:      return import_driver_adapter_utils.ColumnTypeEnum.DateTimeArray;
301:function normalize_numeric(numeric) {
302:  return numeric;
304:function normalize_date(date) {
305:  return date;
337:  [ScalarColumnType.NUMERIC]: normalize_numeric,
338:  [ArrayColumnType.NUMERIC_ARRAY]: normalize_array(normalize_numeric),
342:  [ScalarColumnType.DATE]: normalize_date,
343:  [ArrayColumnType.DATE_ARRAY]: normalize_array(normalize_date),
367:  if (typeof arg === "string" && argType.scalarType === "datetime") {
368:    arg = new Date(arg);
370:  if (arg instanceof Date) {
375:      case "DATE":
376:        return formatDate(arg);
378:        return formatDateTime(arg);
389:function formatDateTime(date) {
391:  con…
```
</details>


### 🤖 Assistant

**→ tool `Bash`**: `{"command": "cd /c/Users/Lenovo/Desktop/ezyfusion-rent-collection; f=node_modules/@prisma/client/runtime/client.js; grep -o '.\\{60\\}case\"date\".\\{250\\}' $f | head -5; grep -o '.\\{80\\}case\"decimal\".\\{200\\}' $f | head -3; grep -o '.\\{100\\}\"numeric\".\\{150\\}' $f | head -3; sed -n 290,300p node_modules/@prisma/adapter-pg/dist/index.js; grep -n 'setTypeParser\\|1082\\|getTypeParser' node_modules/@prisma/adapter-pg/dist/index.js | head", "description": "Check Prisma date/decimal deserialization"}`


### ⚙️ Tool

<details><summary>tool result</summary>

```
64"));case"decimal":return new jl.Decimal(t);case"datetime":case"date":return new Date(t);case"time":return new Date(`1970-01-01T${t}Z`);case"bigint-array":return t.map(r=>st("bigint",r));case"bytes-array":return t.map(r=>st("bytes",r));case"decimal-array":return t.map(r=>st("decimal",r));case"datetime-array":return t.
urn!1}throw new Q(`Expected a boolean in column '${t}', got ${typeof e}: ${e}`)}case"decimal":if(typeof e!="number"&&typeof e!="string"&&!Xs.Decimal.isDecimal(e))throw new Q(`Expected a decimal in column '${t}', got ${typeof e}: ${e}`);return{$type:"Decimal",value:e};case"datetime":{if(typeof
nt":return BigInt(t);case"bytes":return new Uint8Array(Buffer.from(t,"base64"));case"decimal":return new jl.Decimal(t);case"datetime":case"date":return new Date(t);case"time":return new Date(`1970-01-01T${t}Z`);case"bigint-array":return t.map(r=>st("bigint",r));case"bytes-array":return t.map(
      return import_driver_adapter_utils.ColumnTypeEnum.Int64Array;
    default:
      if (fieldTypeId >= FIRST_NORMAL_OBJECT_ID) {
        return import_driver_adapter_utils.ColumnTypeEnum.Text;
      }
      throw new UnsupportedNativeDataType(fieldTypeId);
  }
}
function normalize_array(element_normalizer) {
  return (str) => (0, import_postgres_array.parse)(str, element_normalizer);
}
52:var { builtins: ScalarColumnType, getTypeParser } = types;
130:    1082: "date",
328:var parsePgBytes = getTypeParser(ScalarColumnType.BYTEA);
329:var normalizeByteaArray = getTypeParser(ArrayColu…
```
</details>


### 🤖 Assistant

**→ tool `Write`**: `{"file_path": "C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\REVIEW.md", "content": "# Part B - Code Review\n\nLine numbers count each of the three files separately. Line 1 is the\n`// app/...` path comment exactly as the PR shows it:\n\n- **late-fees** = `app/api/leases/[leaseId]/late-fees/route.ts`\n- **webhook** = `app/api/webhooks/gateway/route.ts`\n- **collections** = `app/(staff)/dashboard/actions.ts`\n\nFindings run from most to least severe. Two facts from the brief matter\nthroughout. First, `prisma` connects as the database owner, so RLS never runs\nfor these queries and every check has to be in this code. Second, all\nexamples use the seed data (Northwind: `manager@`, `staff@`, Aisyah, Ben.\nBeta: `manager@beta.test`, Chen).\n\n---\n\n## Critical\n\n### 1. collections L6-14: the Server Action has no authentication or authorization, and it trusts `orgId` from the caller\n\n```ts\n'use server'\nexport async function getCollections(orgId: string, from: string, to: string) {\n```\n\nEvery exported function in a `'use server'` file is a POST endpoint. Once the\ndashboard references it from client code, anyone can call it with any\narguments. Next.js documents that Server Actions must be treated as public API\nendpoints. This one never calls `getUser()`, never checks the role and takes\nthe organization from the request.\n\n**Scenario.** Chen, a Beta tenant, or a caller with no session at all, replays\nthe action's POST with `orgId` set to Northwind's id and rec…`


### ⚙️ Tool

<details><summary>tool result</summary>

```
File created successfully at: C:\Users\Lenovo\Desktop\ezyfusion-rent-collection\REVIEW.md (file state is current in your context — no need to Read it back)
```
</details>


### 🤖 Assistant

**→ tool `SubagentHandback`**: `{"message": "I wrote `C:\\Users\\Lenovo\\Desktop\\ezyfusion-rent-collection\\REVIEW.md` and touched nothing else; it is not committed. Each file is numbered separately, line 1 being its `// app/...` comment.\n\nI checked the claims I was unsure of in node_modules or by running Node:\n- **Lazy `create`:** a Prisma 7.10 `create(...)` call does not run until something awaits it.\n- **Dates:** a Prisma date column is written and read as UTC midnight of that calendar date.\n- **`SUM` type:** a sum over a bigint column comes back from a raw query as a `Decimal`, not a bigint.\n- **`BigInt` parsing:** `BigInt('')` gives 0, `BigInt('12.5')` throws, and `BigInt('0x10')` gives 16.\n\nAll your candidates held up, with these changes:\n- **Missing audit row:** dropped. The brief only requires audit rows for approval, rejection, void and lease creation, not for late fees.\n- **Missing env key:** moved to \"Looks suspicious but is correct\", because it fails closed.\n- **Duplicate form keys:** moved there too. It isn't exploitable because the signature covers the same map the handler reads.\n- **`SUM` returning `Decimal`:** moved there. The values are still exact; only the type annotation is wrong.\n- **Fee rounding (`Math.round`):** moved there. The result is exact and rounds .5 up.\n- **\"Last invoice by createdAt\" / null reference / NaN crash:** left out, because they depend on schema details the PR doesn't show.\n- **Added:** a non-UUID id makes Postgres throw a 500 instead of a 404. I…`


### ⚙️ Tool

<details><summary>tool result</summary>

```
{"success":true,"message":"Report delivered to your caller."}
```
</details>
