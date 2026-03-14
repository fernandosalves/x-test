# xtest

> Plain-language component testing. Write what you mean. The framework figures out the DOM.

---

## The Problem

Every testing framework forces the test author to know the DOM.

```ts
// Playwright — test author knows the selector
await page.locator('#user-name').fill('ada');
await page.locator('button[type=submit]').click();
await expect(page.locator('.error-msg')).toBeHidden();
```

When the component changes — an `id` renamed, a class restructured — **every test that touches that element breaks**. The test suite becomes a maintenance burden proportional to DOM churn.

The root cause: **the wrong person owns the selector**. The test author shouldn't know which `id` or CSS class the component uses internally. The *component author* knows that.

---

## The Idea

Flip the ownership:

1. **The component declares its testable surface** — a semantic map from human names to DOM reality, living next to the component code.
2. **Tests speak only to that surface** — plain language steps, zero selectors, zero framework knowledge.
3. **The resolver bridges the two** — at test time, `"username input"` resolves to whatever the component says it is.

When the DOM changes, you update the surface manifest — once. Every test that references `"username input"` continues to work automatically.

---

## Quick Look

**Component** (`login-form.ts`)

```ts
/**
 * @xtest-surface
 * @element username-input   by-ref: username
 *   @alias  "user name", "email", "username field"
 *
 * @element password-input   by-ref: password
 *   @alias  "password", "pass", "secret"
 *
 * @element submit-button    by-role: button
 *   @alias  "submit", "login", "sign in"
 *
 * @element error-message    by-selector: .error-msg
 *   @alias  "error", "error message", "alert"
 */
class LoginForm extends MaoriElement {
    template() {
        return html`
            <input ${xtest('username')} type="text" name="username" />
            <input ${xtest('password')} type="password" />
            <button ${xtest('submit-button')} type="submit">Sign in</button>
            <p class="error-msg" hidden></p>
        `;
    }
}
```

**Test** (`login.xtest`)

```
suite UserLogin

  scenario "Successful login"
    type "ada@example.com" into username-input
    type "hunter2"         into password-input
    click submit-button
    check error-message is absent
    check dashboard     is visible

  scenario "Wrong password shows error"
    type "ada@example.com" into username-input
    type "wrong"           into password-input
    click submit-button
    check error-message is visible
    check error-message contains "Invalid credentials"

  scenario "Empty form submission"
    click submit-button
    check error-message is visible
    check username-input has focus
```

**Run**

```bash
xtest run login.xtest --component ./login-form.ts
```

---

## Key Properties

- **Zero selectors in tests** — tests never reference a CSS selector, `id`, or class
- **Zero IDs required** — elements are found via `data-xtest` refs (dev-only, stripped in prod), ARIA, `name`, `role`, `placeholder`, or raw selector as last resort
- **Framework-agnostic** — works with any component that produces HTML: Maori, Lit, React, Vue, vanilla
- **No glue code** — unlike Gherkin/Cucumber, there are no step definition files
- **Natural aliases** — `"username input"`, `"name field"`, `"email"` all resolve to the same element
- **Runs in JSDOM or Playwright** — fast unit-test mode or full browser integration mode

---

## How Resolution Works

```
"click submit-button"
       │
       ▼
  Alias Resolver
  ┌──────────────────────────────────────┐
  │ 1. exact name match in manifest      │
  │ 2. alias fuzzy match                 │
  │ 3. ARIA role + accessible name       │
  │ 4. [name=...] / [type=...] inference │
  │ 5. data-xtest="..." (ref directive)  │
  │ 6. raw CSS selector (escape hatch)   │
  └──────────────────────────────────────┘
       │
       ▼
  button[type=submit]   ← resolved selector
       │
       ▼
  Runner (JSDOM / Playwright)
  .click()
```

---

## The `xtest()` Directive

The cleanest way to annotate elements — no IDs, no extra attributes in production:

```ts
import { xtest } from 'xtest';

// In dev:  renders as  data-xtest="username"
// In prod: xtest() is a no-op, zero DOM footprint
html`<input ${xtest('username')} type="text" />`
```

For components you don't control, or third-party HTML, use an explicit selector in the manifest:

```ts
/**
 * @element submit-button   by-selector: form > button:last-child
 */
```

---

## DSL at a Glance

| Syntax | Meaning |
|---|---|
| `type "text" into <element>` | Fill an input |
| `click <element>` | Click |
| `select "option" in <element>` | Choose a select option |
| `clear <element>` | Clear input value |
| `press "Enter"` | Keyboard event |
| `wait for <element>` | Wait until visible |
| `check <element> is visible` | Assert visible |
| `check <element> is absent` | Assert not in DOM |
| `check <element> contains "text"` | Assert text content |
| `check <element> has value "text"` | Assert input value |
| `check <element> has focus` | Assert focused |
| `check <element> is enabled/disabled` | Assert state |
| `store <element> text as $var` | Capture value |
| `check $var equals "text"` | Assert captured value |

---

## Docs

- [Architecture](./docs/ARCHITECTURE.md)
- [DSL Grammar](./docs/GRAMMAR.md)
- [Surface Manifest](./docs/MANIFEST.md)

---

## Status

Active design + implementation. See `docs/ARCHITECTURE.md` for the full system design.
