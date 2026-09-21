---
name: security
description: "Use when writing code that handles external input or crosses a trust boundary: API endpoints, forms, file uploads, authentication flows, authorization checks, secrets management, or data from third-party services. Trigger specifically when the task involves the boundary between the system and the outside world. Do NOT trigger for pure internal logic with no external input or sensitive data."
---

Apply security principles to help the user write code that is safe at every trust boundary. Cite the attack vector being prevented with every rule. Signal violations directly. Never trade security for convenience.

The user provides code to write or review that involves external input, auth, permissions, secrets, or third-party data.

## Context Protocol

Before applying rules, confirm:
- **Language / framework**: Node/Express, Python/Django, Java/Spring, etc.
- **Boundary type**: user input, auth flow, file upload, API, secrets, or permissions
- **Environment**: development or production — some rules apply only in prod

Load only the domain relevant to the current task. Don't apply all rules at once.

---

## Core Principles (always active)

**DO**: **Never trust input** — validate and sanitize everything from outside the system: user input, query params, headers, external APIs, file uploads
**DO**: **Least privilege** — every component gets only the permissions it actually needs
**DO**: **Defense in depth** — never rely on a single security layer, stack multiple controls
**DO**: **Fail securely** — on error, default to denying access, never to allowing it
**DO**: Keep **secrets out of code** — no API keys, passwords, or tokens in source files, ever

**DON'T**: Treat frontend validation as security — it is UX. Always validate server-side
**DON'T**: Return 404 for unauthorized access — it leaks resource existence. Use 403
**DON'T**: Rely on logs to catch attacks — use them to investigate after the fact
**DON'T**: Treat HTTPS as sufficient — it protects transit only, not injection or at-rest data
**DON'T**: Treat rate limiting and input validation as alternatives — you need both

---

## Input Validation

### SQL Injection — never concatenate user input into queries

**DO**: Use parameterized queries or an ORM — always
**DON'T**: Concatenate user input into SQL strings — ever

```ts
// ❌ Attacker inputs: ' OR '1'='1
const query = `SELECT * FROM users WHERE email = '${email}'`

// ✅ Parameterized — input is never interpreted as SQL
db.query('SELECT * FROM users WHERE email = $1', [email])

// ✅ ORM — parameterization handled automatically
await User.findOne({ where: { email } })
```

### XSS — never inject raw input into the DOM

**DO**: Use `textContent` or framework-provided safe rendering
**DO**: Sanitize with DOMPurify before any `innerHTML` usage
**DON'T**: Use `innerHTML`, `dangerouslySetInnerHTML`, or `eval` with user input

```ts
// ❌ Attacker inputs: <script>document.cookie</script>
element.innerHTML = userInput

// ✅
element.textContent = userInput

// ✅ React — JSX escapes by default
return <div>{userInput}</div>

// ✅ If HTML input is required — sanitize first
import DOMPurify from 'dompurify'
return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userInput) }} />
```

### Schema validation — validate all input at the boundary

**DO**: Use a schema library (zod, valibot) on every incoming request
**DO**: Treat every request as if it was crafted manually with curl or Postman
**DON'T**: Accept user-controlled values for sensitive fields like `role` or `isAdmin`

```ts
import { z } from 'zod'

const CreateUserSchema = z.object({
  email:   z.string().email(),
  age:     z.number().int().min(0).max(120),
  role:    z.enum(['customer', 'editor']), // never accept 'admin' from user input
  website: z.string().url().optional(),
})

app.post('/users', (req, res) => {
  const result = CreateUserSchema.safeParse(req.body)
  if (!result.success) return res.status(400).json({ errors: result.error.flatten() })
  await createUser(result.data) // typed and validated
})
```

### Mass assignment — allowlist fields explicitly

```ts
// ❌ Attacker sends { role: 'admin', isVerified: true }
await User.create({ ...req.body })

// ✅ Explicit allowlist — or use the validated schema
const { email, name, password } = req.body
await User.create({ email, name, password })
```

### Path traversal — file operations

```ts
// ❌ Attacker inputs: ../../etc/passwd
const filePath = path.join(__dirname, 'uploads', req.params.filename)

// ✅ Resolve and verify the path stays within the expected directory
const uploadsDir = path.resolve(__dirname, 'uploads')
const filePath   = path.resolve(uploadsDir, req.params.filename)
if (!filePath.startsWith(uploadsDir)) {
  return res.status(403).json({ error: 'Access denied' })
}
```

### CSRF — Cross-Site Request Forgery

**Primary defense — `sameSite` cookie attribute:**
```ts
app.use(session({
  cookie: {
    sameSite: 'lax', // blocks CSRF from cross-site POST requests
    httpOnly: true,
    secure: true,
  }
}))
```

**Defense in depth — CSRF tokens for high-stakes operations:**
```ts
// SPA: send token in header on every state-changing request
await fetch('/api/transfer', {
  method: 'POST',
  headers: { 'X-CSRF-Token': csrfToken },
  body: JSON.stringify(payload),
})
```

**When `sameSite: lax` alone is sufficient**: session-based apps, no cross-origin forms needed.
**Add CSRF tokens too for**: payments, account deletion, any high-stakes irreversible action.

### Rate limiting — all public endpoints

**DO**: Apply stricter limits on auth routes (brute force prevention)
**DO**: Apply general limits on all public API routes
**DON'T**: Treat rate limiting as optional — it's the last line against brute force and DoS

```ts
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 })   // auth routes
const apiLimiter   = rateLimit({ windowMs: 60 * 1000, max: 100 })         // general API

app.post('/auth/login', loginLimiter, handleLogin)
app.use('/api', apiLimiter)
```

### File uploads — high-risk surface

**DO**: Detect MIME type from magic bytes — never from extension or request header
**DO**: Replace original filename with a random UUID — always
**DO**: Store uploads outside the webroot
**DO**: Serve files through a controller with an auth check
**DO**: Set `Content-Disposition: attachment` — prevents browser inline execution
**DON'T**: Trust `req.file.mimetype` — it's user-controlled and can be faked

```ts
import { fromBuffer } from 'file-type'
import crypto from 'crypto'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

app.post('/upload', upload.single('file'), async (req, res) => {
  const detected = await fromBuffer(req.file.buffer)
  if (!detected || !ALLOWED_TYPES.includes(detected.mime)) {
    return res.status(400).json({ error: 'File type not allowed' })
  }

  const safeFilename = `${crypto.randomUUID()}.${detected.ext}`
  await fs.writeFile(path.join('/var/app/uploads', safeFilename), req.file.buffer)
  res.json({ fileId: safeFilename })
})

// Serve with auth check — never via static file serving
app.get('/files/:fileId', requireAuth, async (req, res) => {
  const record = await db.findFile(req.params.fileId)
  if (!record || record.ownerId !== req.user.id) return res.status(403).send()

  res.setHeader('Content-Disposition', 'attachment')
  res.sendFile(path.join('/var/app/uploads', record.filename))
})
```

---

## Authentication

### Passwords — bcrypt or argon2 only

**DO**: Hash with bcrypt (min 10 rounds, 12 recommended) or argon2
**DO**: Always run `bcrypt.compare` even when the user is not found — prevents timing attacks
**DON'T**: Use MD5, SHA1, or SHA256 for passwords — too fast, brute-forceable
**DON'T**: Store plain text passwords — ever

```ts
const SALT_ROUNDS = 12

async function hashPassword(plain: string) { return bcrypt.hash(plain, SALT_ROUNDS) }
async function verifyPassword(plain: string, hash: string) { return bcrypt.compare(plain, hash) }
```

### JWT — sign, verify, expire

**DO**: Use short-lived access tokens (≤15 minutes)
**DO**: Store access tokens in memory — not localStorage (XSS risk)
**DO**: Store refresh tokens in `httpOnly` cookies
**DO**: Use separate secrets for access and refresh tokens
**DO**: Use `jwt.verify()` — never `jwt.decode()` for auth decisions
**DON'T**: Skip token expiry — a leaked token without expiry is permanently valid

```ts
function generateTokens(userId: number) {
  const accessToken  = jwt.sign({ sub: userId }, ACCESS_SECRET,  { expiresIn: '15m' })
  const refreshToken = jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: '7d' })
  return { accessToken, refreshToken }
}

// ❌ decode() skips signature verification
const payload = jwt.decode(token)

// ✅ verify() throws if invalid or expired
const payload = jwt.verify(token, ACCESS_SECRET)
```

### Login — prevent user enumeration

**DO**: Return the same message for wrong email and wrong password
**DO**: Run bcrypt even when the user is not found — constant-time response

```ts
// ❌ Reveals that the email exists
if (!user) return res.status(404).json({ error: 'Email not found' })

// ✅ Same response for both cases
const dummyHash = '$2b$12$invalidhashfortimingprotection'
const hash = user?.passwordHash ?? dummyHash
await bcrypt.compare(plain, hash) // same time whether user exists or not
if (!user || !match) return res.status(401).json({ error: 'Invalid email or password' })
```

### Password reset — token hygiene

```ts
// ✅ Secure flow
const token       = crypto.randomBytes(32).toString('hex')       // 1. random token
const hashedToken = crypto.createHash('sha256').update(token).digest('hex') // 2. store hash
await db.saveResetToken(userId, hashedToken, expiresAt)           // 3. save hash only
// 4. send raw token in email link — /reset?token=<raw>

// 5. on reset: hash incoming, compare to stored hash
const incoming = crypto.createHash('sha256').update(req.query.token).digest('hex')
const record   = await db.findResetToken(incoming)
if (!record || record.expiresAt < Date.now()) return res.status(400).send()
```

---

## Authorization

### Always enforce permissions server-side

**DO**: Check permissions on every endpoint independently
**DON'T**: Rely on the UI hiding buttons — attackers call endpoints directly

```ts
// ❌ Frontend hides the Delete button — but endpoint has no check
app.delete('/posts/:id', async (req, res) => { await Post.delete(req.params.id) })

// ✅ Every endpoint enforces its own permission
app.delete('/posts/:id', requireAuth, async (req, res) => {
  const post = await Post.findById(req.params.id)
  if (!post) return res.status(404).send()
  if (req.user.role !== 'admin' && post.authorId !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  await post.delete()
  res.status(204).send()
})
```

### IDOR — scope queries to the authenticated user

**DO**: Always scope resource queries to `req.user.id` — never trust IDs from the request alone
**DON'T**: Fetch a resource and then check ownership — scope it at the query level

```ts
// ❌ Any authenticated user can read any order by guessing the ID
const order = await Order.findById(req.params.id)

// ✅ Ownership enforced at query level
const order = await Order.findOne({ where: { id: req.params.id, customerId: req.user.id } })
if (!order) return res.status(404).send()
```

### RBAC — centralize permission checks

**DO**: Define roles and permissions in one place
**DO**: Use reusable middleware — never scatter permission checks across endpoints
**DON'T**: Duplicate permission logic in every handler

```ts
const PERMISSIONS = {
  customer: ['orders:read:own', 'profile:update:own'],
  editor:   ['posts:create', 'posts:update:own'],
  admin:    ['posts:delete', 'users:manage', 'orders:read:all'],
}

function requirePermission(permission: string) {
  return (req, res, next) => {
    if (!PERMISSIONS[req.user.role]?.includes(permission)) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    next()
  }
}

app.delete('/posts/:id', requireAuth, requirePermission('posts:delete'), handleDeletePost)
```

### 403 vs 404 — never leak resource existence

**DO**: Return 403 consistently for authorization failures — even when the resource exists
**DON'T**: Return 404 as a substitute for 403 — it reveals resource non-existence to attackers

```ts
// ❌ Tells the attacker that post 42 exists but they can't access it
if (!canAccess) return res.status(404).send()

// ✅ Access denied — existence not confirmed
if (!canAccess) return res.status(403).json({ error: 'Forbidden' })
```

### Least privilege — at every level

```sql
-- ✅ App DB user with only needed permissions
CREATE USER app_user WITH PASSWORD '...';
GRANT SELECT, INSERT, UPDATE ON orders, users TO app_user;
-- No DROP, no TRUNCATE, no access to audit_logs
```

---

## Data Protection

### Secrets — never in source code

**DO**: Load secrets from environment variables
**DO**: Add `.env` to `.gitignore` — always
**DO**: Validate all required environment variables at startup (fail fast)
**DO**: Use a secrets manager in production (AWS Secrets Manager, Vault, Doppler)
**DON'T**: Commit `.env` files, `*.pem`, or `*.key` files

```ts
// ❌
const stripe = new Stripe('sk_live_abc123...')

// ✅
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
```

```ts
// Validate at startup — fail fast if a secret is missing
const EnvSchema = z.object({
  DATABASE_URL:      z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  NODE_ENV:          z.enum(['development', 'test', 'production']),
})
export const env = EnvSchema.parse(process.env) // throws at startup if invalid
```

### Sensitive data — never log it

**DO**: Log only what's needed for debugging (email, userId, error code)
**DON'T**: Log passwords, tokens, full credit card numbers, SSNs, or raw PII

```ts
// ❌
logger.info('Login', { email, password, token })

// ✅
logger.info('Login', { email })
logger.error('Payment failed', { userId, last4: cardNumber.slice(-4), errorCode })
```

### Encryption at rest — fields you need to read back

**DO**: Use reversible encryption (AES-256) for fields you need to read back (SSN, bank account)
**DO**: Use bcrypt/argon2 for passwords — one-way only
**DON'T**: Hash sensitive fields you need to retrieve in plaintext

```ts
function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(text), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}
```

### Error responses — never expose internals in production

**DO**: Send generic messages to the client in production
**DO**: Log full details server-side for debugging
**DO**: Distinguish operational errors (safe to describe) from unexpected errors (hide details)
**DON'T**: Send stack traces, file paths, DB error messages, or library versions to the client

```ts
// ✅ Central error handler
app.use((err: any, req, res, next) => {
  if (err.statusCode) {
    // Operational — message is safe to expose
    return res.status(err.statusCode).json({ error: err.message })
  }
  // Unexpected — log fully, hide from client
  logger.error('Unexpected error', { err, url: req.url })
  const isProd = process.env.NODE_ENV === 'production'
  res.status(500).json({ error: isProd ? 'An unexpected error occurred' : err.message })
})
```

**DO**: Scrub sensitive fields before sending API responses

```ts
const { passwordHash, internalId, ...safeUser } = user
res.json(safeUser)
```

### Security headers and CORS

**DO**: Apply `helmet` — sets secure defaults for all headers (CSP, HSTS, X-Frame-Options)
**DO**: Allowlist CORS origins explicitly in production
**DON'T**: Use `cors()` with no config — it allows any origin

```ts
import helmet from 'helmet'
app.use(helmet())

app.use(cors({
  origin: ['https://app.example.com', 'https://admin.example.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}))
```

---

## Dependencies

### Audit regularly

**DO**: Run `npm audit` (or equivalent) before every release and in CI
**DO**: Commit and maintain the lockfile — exact versions locked
**DO**: Configure Dependabot or Renovate for automated update PRs
**DON'T**: Install packages without checking downloads, last publish date, and maintainer count

```bash
npm audit --audit-level=high  # fail CI on high/critical only
npm outdated                  # check for updates
```

**Before installing any new package, check:**
- Downloads/week — low downloads = less battle-tested
- Last publish — unmaintained packages don't get security patches
- Maintainer count — single maintainer = higher supply chain risk
- Transitive dependency count — more deps = larger attack surface

### Typosquatting — verify package names

```bash
# ❌ Easy to mistype
npm install lodahs   # lodash
npm install expres   # express

# ✅ Confirm the exact name and publisher on npmjs.com before installing
```

### Import only what you use

```ts
// ❌ Imports entire lodash (70KB+, hundreds of functions)
import _ from 'lodash'

// ✅ Import only what you need
import groupBy from 'lodash/groupBy'

// ✅ Better — use native alternatives when available
const result = Object.groupBy(items, item => item.category)
```

---

## Security Checklist

### Input validation
- [ ] All user input validated server-side with a schema library (zod, valibot)
- [ ] No raw user input concatenated into SQL — parameterized queries or ORM
- [ ] No raw user input injected into the DOM — `textContent` or sanitized HTML
- [ ] No user input in file paths without traversal check
- [ ] Mass assignment prevented — fields explicitly allowlisted
- [ ] Rate limiting on all public endpoints, stricter on auth routes
- [ ] `sameSite: 'lax'` minimum on all cookies — CSRF tokens on high-stakes operations

### File uploads
- [ ] MIME type detected from magic bytes — not extension or request header
- [ ] Original filename replaced with a random UUID
- [ ] File size limit enforced server-side
- [ ] Files stored outside the webroot
- [ ] Files served through a controller with auth check
- [ ] `Content-Disposition: attachment` set when serving files

### Authentication
- [ ] Passwords hashed with bcrypt or argon2 (min 10 rounds)
- [ ] JWT access tokens ≤ 15 minutes
- [ ] JWT stored in memory — refresh token in `httpOnly` cookie
- [ ] Separate secrets for access and refresh tokens
- [ ] Same message returned for wrong email and wrong password
- [ ] `bcrypt.compare` runs even when user is not found
- [ ] Password reset tokens stored as hashes, not plain values

### Authorization
- [ ] Every endpoint checks permissions server-side
- [ ] Resource queries scoped to authenticated user (IDOR prevention)
- [ ] Roles and permissions defined centrally
- [ ] 403 returned for unauthorized access — not 404

### Data protection
- [ ] No secrets in source code or committed `.env` files
- [ ] Environment variables validated at startup
- [ ] No passwords, tokens, or PII in logs
- [ ] Sensitive fields encrypted at rest
- [ ] Stack traces never sent to client in production
- [ ] API responses scrubbed of internal fields
- [ ] `helmet` applied — security headers active
- [ ] CORS allowlist explicit — no `*` in production
- [ ] HTTPS enforced

### Dependencies
- [ ] `npm audit` passes with no high/critical vulnerabilities
- [ ] Lockfile committed and up to date
- [ ] No unmaintained packages (last publish > 2 years)
- [ ] Dependabot or Renovate configured

---

## The Security Quality Test

Before delivering any code that crosses a trust boundary, ask:

> If an attacker crafted a malicious request to this endpoint — injected SQL, spoofed a file type, guessed a resource ID, or sent a request from another domain — would this code reject it before any damage is done?

If no → identify which layer is missing (validation, auth, rate limiting, CORS) and add it before delivering.

---

## Behaviour Rules

When the user presents code that crosses a trust boundary:
1. Identify the attack vector the code is exposed to
2. Signal the vulnerability directly — name the attack (SQLi, XSS, IDOR, CSRF, timing attack)
3. Propose a corrected version with the prevention mechanism named
4. Prioritise: input validation → auth → authorization → data protection → dependencies
5. Never accept "this is internal only" as a reason to skip validation — boundaries change

Format: vulnerability → attack vector → correction. Concise. No padding.
