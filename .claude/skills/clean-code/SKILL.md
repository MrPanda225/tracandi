---
name: clean-code
description: "Apply clean code principles while writing or reviewing code. Use on every new function, class, module, or code review. Covers naming, function structure, docstrings, SOLID, DRY, KISS, robustness, and TypeScript discipline. Do NOT use for architectural decisions or for improving existing messy code — those require separate skills."
---

Apply clean code rules to help the user write code that is correct, readable, and maintainable. Signal violations directly. Justify every correction with its named principle. Don't suggest abstractions without a concrete problem to solve.

The user provides code to write, refactor, or review. They may include a language, framework, or context.

## Context Protocol

Before applying rules, confirm:
- **Language**: JS, TS, Python, Java, C#, or other — conventions differ
- **Phase**: writing new code, reviewing existing code, or refactoring
- **Scope**: function, class, module, or full file

Load only the reference relevant to the current task. Don't apply all rules at once.

---

## Core Principles (always active)

These apply to every task without needing a reference file:

**DO**: Apply **DRY** — extract duplicated logic into a single source of truth
**DO**: Apply **KISS** — simplest solution that works, always
**DO**: Apply **YAGNI** — don't write code for hypothetical future needs
**DO**: Apply **SRP** — each function/class has one reason to change
**DO**: Apply **Low Coupling** — modules depend on each other as little as possible
**DO**: Apply **High Cohesion** — things that change together, live together
**DO**: Apply **Boy Scout Rule** — leave every piece of code slightly cleaner than you found it

**DON'T**: Introduce abstractions "just in case" — YAGNI beats SOLID
**DON'T**: Apply design patterns without a concrete problem — it's a KISS and YAGNI violation
**DON'T**: Optimise before profiling proves a bottleneck exists

---

## Naming

### The S-I-D rule — every name must be Short, Intuitive, Descriptive

**DO**: Name variables and functions so they read naturally, close to common speech
**DO**: Use English for all code, variables, functions, and comments — always
**DO**: Pick one convention and apply it consistently — camelCase (JS/TS), snake_case (Python)
**DON'T**: Use contractions — `onItmClk`, `usrNm` → `onItemClick`, `userName`
**DON'T**: Duplicate context — `MenuItem.handleMenuItemClick` → `MenuItem.handleClick`
**DON'T**: Use noise words — `UserData`, `UserInfo`, `UserObject` → `User`

### Booleans — always prefix

| Prefix | Use for | Example |
|---|---|---|
| `is` | state or characteristic | `isActive`, `isLoading` |
| `has` | possession of a value | `hasProducts`, `hasPermission` |
| `should` | conditional + action | `shouldPaginate`, `shouldUpdateUrl` |
| `can` | capability or permission | `canEdit`, `canDelete` |

**DON'T**: Name a boolean so its usage requires negation
```js
// ❌ name says "enabled" but used as disabled={!isEnabled}
const isEnabled = itemCount > 3
// ✅ name and usage align
const isDisabled = itemCount <= 3
```

### Functions — A/HC/LC pattern
`prefix? + action + high context + low context?`

**Action verbs to use:**
- `get` → accessing data / `fetch` → from remote source
- `set` → declarative assignment / `reset` → back to initial state
- `create` → new entity / `delete` → permanent erasure from DB
- `remove` → from a collection / `handle` → event handler implementation
- `compose` → building new data from existing parts

**`on` vs `handle` in component frameworks:**
- `on*` → prop name (the interface): `<Button onSubmit={...} />`
- `handle*` → implementation (the logic): `function handleSubmit() {}`

### Constants
- `UPPER_SNAKE_CASE` → true global configuration constants only (`MAX_RETRY_COUNT`, `API_BASE_URL`)
- `camelCase` → all regular `const` variables, even if they never change

### TypeScript specifics
- `PascalCase` → all type-level constructs: types, interfaces, enums
- No `IUser` prefix on interfaces — explicitly discouraged by Microsoft's own style guide
- `interface` → object shapes that may be extended or implemented
- `type` → unions, intersections, primitives, mapped types

---

## Functions

### One responsibility per function
If a function needs a comment to explain each "section" → it must be split.

```js
// ❌ Validates, computes, persists, AND notifies
function processOrder(order) {
  if (!order.items.length) throw new Error("Empty order");
  order.total = order.items.reduce((s, i) => s + i.price, 0);
  db.save(order);
  emailService.send(order.customerEmail, "Order confirmed");
}

// ✅ Each step is named, isolated, independently testable
function processOrder(order) {
  const validated = validateOrder(order);
  const priced    = calculateOrderTotal(validated);
  const saved     = saveOrder(priced);
  notifyCustomer(saved);
}
```

### Max 3 parameters — options object beyond that

```js
// ❌ Caller can't tell what false means
createUser("Alice", "alice@x.com", "admin", true, false);

// ✅ Self-documenting at the call site
createUser({ name: "Alice", email: "alice@x.com", role: "admin", isActive: true, sendWelcomeEmail: false });
```

### No magic numbers — named constants only

```js
// ❌
if (user.loginAttempts > 5) lockAccount(user);

// ✅
const MAX_LOGIN_ATTEMPTS = 5;
if (user.loginAttempts > MAX_LOGIN_ATTEMPTS) lockAccount(user);
```

### CQS — Command Query Separation
A function either **does something** (command) or **returns something** (query). Never both.

```js
// ❌ Saves AND returns — hidden side effect
function saveAndGetUser(data) { db.save(data); return db.find(data.id); }

// ✅
function saveUser(data) { db.save(data); }
function getUserById(id) { return db.find(id); }
```

### Immutability — never mutate parameters

```js
// ❌ Mutates the caller's data
function addItem(cart, item) { cart.push(item); return cart; }

// ✅ Returns a new value, original untouched
function addItem(cart, item) { return [...cart, item]; }
```

### Async / Await

**DO**: Use `async/await` over `.then()` chains — reads linearly, errors caught the same way as sync
**DO**: Run independent async calls in parallel with `Promise.all`
**DON'T**: Mix `.then()` and `await` in the same function
**DON'T**: Let a Promise float unhandled — always `await` or `.catch()`

```js
// ❌ Sequential — unnecessarily slow
const user = await getUser(id);
const settings = await getSettings(id); // doesn't depend on user

// ✅ Parallel — both fire at the same time
const [user, settings] = await Promise.all([getUser(id), getSettings(id)]);
```

### Docstrings — document the contract, not the code

Always include: one-line summary (what, not how), each parameter with type + valid range, return value, exceptions, side effects.

**DON'T**: Document what the signature already tells you
**DO**: Document what the caller can't infer — nulls, soft-delete behaviour, edge cases

```js
// ❌ Restates the code — zero value
/** Gets the user. @param {number} id @returns {object} */

// ✅ Adds information the signature doesn't give
/**
 * Retrieves an active user by ID.
 * Returns null if the user exists but has been soft-deleted.
 *
 * @param {number} id - The user's database ID.
 * @returns {User|null} The user, or null if not found or deactivated.
 */
```

### TypeScript — never use `any`
`any` disables all type checking and defeats TypeScript entirely.

**DO**: Use `unknown` — forces type verification before use
**DO**: Use `zod` or `valibot` for external data (API responses, user input)
**DON'T**: Write type guards by hand for complex external shapes

```ts
// ❌
function parseResponse(data: any) { return data.user.name; }

// ✅
const UserSchema = z.object({ id: z.number(), name: z.string() });
type User = z.infer<typeof UserSchema>;
function parseUser(data: unknown): User { return UserSchema.parse(data); }
```

---

## SOLID & Coupling

### S — Single Responsibility
One class = one reason to change.

```js
// ❌ Calculates, formats PDF, AND saves to DB
class Invoice { calculate() {} formatAsPDF() {} saveToDatabase() {} }

// ✅
class Invoice { calculate() {} }
class InvoicePDFFormatter { format(invoice) {} }
class InvoiceRepository { save(invoice) {} }
```

### O — Open/Closed
Add behaviour by adding code, not by editing existing code.

```js
// ❌ Every new discount type requires editing this function
function applyDiscount(order, type) {
  if (type === "student") return order.total * 0.9;
  if (type === "senior")  return order.total * 0.8;
}

// ✅ Each strategy is isolated
class StudentDiscount { apply(total) { return total * 0.9; } }
class SeniorDiscount  { apply(total) { return total * 0.8; } }
function applyDiscount(order, strategy) { return strategy.apply(order.total); }
```

### L — Liskov Substitution
A subclass must be usable anywhere its parent is used without breaking behaviour.

**DO**: Use a common interface instead of forcing inheritance when behaviour diverges
**DON'T**: Override a method in a way that violates the parent's contract

### I — Interface Segregation
No class should implement methods it doesn't need.

**DO**: Split fat interfaces by concern — implement only what's relevant
**DON'T**: Force stubs like `throw new Error("Not supported")` — that's Liskov + ISP violated

### D — Dependency Inversion
Depend on abstractions, not on concrete implementations.

```js
// ❌ Hardcoded dependency
class OrderService { constructor() { this.db = new MySQLDatabase(); } }

// ✅ Injected dependency — swap without touching OrderService
class OrderService { constructor(database) { this.db = database; } }
const service     = new OrderService(new MySQLDatabase());
const testService = new OrderService(new InMemoryDatabase());
```

### Composition over Inheritance

```js
// ❌ Deep inheritance — brittle, rigid
class Animal {} → class Pet {} → class Dog {} → class TrainedDog {}

// ✅ Compose behaviours independently
const canBark  = (base) => ({ ...base, bark:  () => "Woof!" });
const canFetch = (base) => ({ ...base, fetch: () => "Fetching!" });
const trainedDog = canFetch(canBark({ name: "Rex" }));
```

### Law of Demeter
Only call methods on: yourself, your parameters, objects you create, your direct fields.

```js
// ❌ Knows too much about the object graph
order.getCustomer().getAddress().getCity();

// ✅ Order exposes what callers need
class Order { getCustomerCity() { return this.customer.getCity(); } }
order.getCustomerCity();
```

---

## Interfaces

### Principle of Least Surprise
Code must behave exactly as its name suggests — no hidden side effects.

```js
// ❌ getUser() suggests a read — but mutates lastSeen
function getUser(id) { const user = db.find(id); user.lastSeen = Date.now(); return user; }

// ✅ Side effect is explicit and separate
function getUser(id)      { return db.find(id); }
function recordLastSeen(id) { db.update(id, { lastSeen: Date.now() }); }
```

### Principle of Least Knowledge
Expose only what is necessary. Keep internals private.

**DO**: Use private fields (`#field` in JS, `_field` convention in Python)
**DON'T**: Let callers reach into `service.repository.db.find(id)` — that's deep coupling

---

## Robustness

### Fail Fast
Detect and report errors as early as possible — don't let invalid state propagate.

```js
// ❌ Error surfaces far from its cause
function processPayment(order) { charge(order.total); }

// ✅ Blow up immediately at the boundary with a clear message
function processPayment(order) {
  if (!order) throw new Error("processPayment: order is required");
  if (typeof order.total !== "number") throw new Error(`processPayment: invalid total "${order.total}"`);
  charge(order.total);
}
```

### Defensive Programming
**DO**: Validate at the boundary of your system (API endpoints, user input, external data)
**DO**: Trust your own validated types downstream — don't re-validate everywhere
**DON'T**: Let raw external data enter the system without parsing

### Custom error classes — never throw raw strings

```js
// ❌
throw 'User not found';

// ✅
class NotFoundError extends Error {
  constructor(resource, id) {
    super(`${resource} with id "${id}" not found`);
    this.name = 'NotFoundError';
  }
}
```

### Result pattern (TypeScript) — make failure explicit

```ts
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function getUser(id: number): Promise<Result<User, NotFoundError>> {
  const user = await db.find(id);
  if (!user) return { ok: false, error: new NotFoundError('User', id) };
  return { ok: true, value: user };
}
```

**DO**: Use `Result` for expected failures (not found, validation, auth)
**DO**: Use `throw` for unexpected failures (DB down, network error, programming mistakes)

### Never silently swallow errors

```js
// ❌
try { await saveOrder(order); } catch (error) { /* nothing */ }

// ✅ Handle, log, and decide explicitly
try {
  await saveOrder(order);
} catch (error) {
  logger.error('Failed to save order', { orderId: order.id, error });
  throw error; // or return Result, or show user feedback — never ignore
}
```

### Comments — explain WHY, not WHAT

```js
// ❌ Restates the code
// Filter users where age > 18
const adults = users.filter(u => u.age > 18);

// ✅ Explains the non-obvious reason
// EU compliance: users under 18 cannot consent to data processing (GDPR Art. 8)
const eligibleUsers = users.filter(u => u.age >= GDPR_MINIMUM_CONSENT_AGE);
```

---

## The Clean Code Quality Test

Before delivering any code, ask:

> Could a developer who has never seen this codebase understand what this function does, why it exists, and what can go wrong — without reading its body?

If no → the naming, docstring, or structure needs work. Identify which principle is violated and correct it before delivering.

---

## Behaviour Rules

When the user presents code to write or review:
1. Identify which principle applies to the current task
2. Signal violations directly — name the principle being broken
3. Propose a corrected version with a one-line justification
4. Prioritise: correctness → robustness → readability → structure
5. Never suggest an abstraction without a concrete, present problem to solve

Format: violation → principle → correction. Concise. No padding.
