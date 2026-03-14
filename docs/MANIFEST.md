# xtest — Surface Manifest Specification

The **Surface Manifest** is a JSDoc annotation block that declares the testable
surface of a component. It lives co-located with the component source, is parsed
at test time by the Manifest Extractor, and feeds the Resolver.

---

## Basic Syntax

```ts
/**
 * @xtest-surface
 * @element <semantic-name>   <resolution-strategy>
 *   @alias  "<alias1>", "<alias2>", ...
 */
```

- `@xtest-surface` marks the block as a xtest manifest
- `@element` declares one testable element
- The resolution strategy tells xtest *how* to find the element in the DOM
- `@alias` declares natural-language synonyms (optional)

---

## Resolution Strategies

### `by-ref: <name>`
Finds `[data-xtest="<name>"]`. Use with the `xtest()` directive in your template.
Zero production footprint — `data-xtest` attributes are stripped in prod builds.

```ts
/**
 * @element username-input   by-ref: username
 */
html`<input ${xtest('username')} type="text" />`
```

---

### `by-selector: <css>`
Raw CSS selector. Use as an escape hatch for third-party components or legacy HTML.

```ts
/**
 * @element error-message   by-selector: .alert-danger > p:first-child
 */
```

---

### `by-aria-label: "<label>"`
Finds `[aria-label="<label>"]`. Prefer this when elements have proper ARIA labels.
Also matches `<label>` elements' `for` target.

```ts
/**
 * @element username-input   by-aria-label: "Email address"
 */
```

---

### `by-role: <role>`
Finds `[role="<role>"]` plus native elements with that implicit role
(`button`, `link`, `textbox`, `checkbox`, `combobox`, etc.).

Optionally add `name: "<accessible-name>"` to disambiguate multiple elements
with the same role:

```ts
/**
 * @element submit-button    by-role: button name: "Sign in"
 * @element cancel-button    by-role: button name: "Cancel"
 */
```

---

### `by-name: <name>`
Finds `[name="<name>"]`. Works for `<input>`, `<select>`, `<textarea>`.

```ts
/**
 * @element username-input   by-name: username
 * @element remember-me      by-name: remember
 */
```

---

### `by-placeholder: "<text>"`
Finds `[placeholder="<text>"]`.

```ts
/**
 * @element username-input   by-placeholder: "Enter your email"
 */
```

---

### `by-type: <type>`
Finds `input[type="<type>"]`. Only reliable when there is exactly one input of
that type in the component. Use with caution.

```ts
/**
 * @element password-input   by-type: password
 */
```

---

### `by-text: "<text>"`
Finds the element whose visible text content matches. Case-insensitive, trims whitespace.

```ts
/**
 * @element submit-button   by-text: "Sign in"
 */
```

---

### `auto` (default, no strategy)
When no strategy is specified, xtest infers from the element name:

| Name contains | Inference |
|---|---|
| `*-input`, `*-field` | `input[type=text]`, then `input`, then `textarea` |
| `password*` | `input[type=password]` |
| `*-button`, `*-btn` | `button`, `[role=button]` |
| `*-link` | `a`, `[role=link]` |
| `*-checkbox` | `input[type=checkbox]` |
| `*-select`, `*-dropdown` | `select` |
| `*-error`, `*-message`, `*-alert` | `[role=alert]`, `.error`, `.alert` |
| `*-label` | `label` |
| `*-image`, `*-img` | `img` |

Auto-inference emits a warning if ambiguous (multiple matches).

---

## Aliases

Aliases are additional natural-language names the Resolver accepts.
Case-insensitive. Punctuation is normalised.

```ts
/**
 * @element username-input   by-ref: username
 *   @alias  "user name", "email", "email address", "login field"
 */
```

All of these step references will resolve to the same element:
```
type "ada" into username-input
type "ada" into "user name"
type "ada" into "email address"
type "ada" into "login field"
```

---

## Scoped Manifests

For compound components with sub-components, declare a scope:

```ts
/**
 * @xtest-surface UserTable
 * @scope row    by-selector: tr[data-row]
 *
 * @element edit-button    by-ref: edit    @scope row
 * @element delete-button  by-ref: delete  @scope row
 * @element row-name       by-selector: td:first-child  @scope row
 */
```

Steps then use scope qualifier (syntax reserved, not yet implemented):
```
within user-table row:2
  click edit-button
  check row-name contains "Ada"
```

---

## Auto-discovery via `xtest()` directive

If the component uses the `xtest()` directive and no explicit `@element` entry
exists for that ref name, xtest auto-registers the element using `by-ref` strategy:

```ts
// Component — no manifest block at all
class LoginForm extends MaoriElement {
    template() {
        return html`
            <input ${xtest('username')} type="text" />
            <input ${xtest('password')} type="password" />
            <button ${xtest('submit')} type="submit">Sign in</button>
        `;
    }
}
```

Auto-generated manifest:
```
username  →  [data-xtest="username"]
password  →  [data-xtest="password"]
submit    →  [data-xtest="submit"]
```

Aliases must still be declared explicitly in a `@xtest-surface` block if needed.

---

## Complete Example

```ts
/**
 * @xtest-surface
 *
 * @element username-input   by-ref: username
 *   @alias  "user name", "email", "email address", "login"
 *
 * @element password-input   by-ref: password
 *   @alias  "password", "pass", "secret"
 *
 * @element remember-me      by-name: remember
 *   @alias  "remember", "stay logged in", "keep me logged in"
 *
 * @element submit-button    by-role: button name: "Sign in"
 *   @alias  "submit", "login button", "sign in", "go"
 *
 * @element error-message    by-selector: [role=alert]
 *   @alias  "error", "error message", "alert", "warning"
 *
 * @element forgot-link      by-text: "Forgot password?"
 *   @alias  "forgot", "forgot password", "reset password"
 *
 * @element dashboard        by-selector: main[data-page=dashboard]
 *   @alias  "dashboard", "home", "main page"
 */
class LoginForm extends MaoriElement {
    template() {
        return html`
            <form>
                <input ${xtest('username')} type="text"     name="username" />
                <input ${xtest('password')} type="password" name="password" />
                <label>
                    <input ${xtest('remember')} type="checkbox" name="remember" />
                    Remember me
                </label>
                <p role="alert" class="error" hidden></p>
                <button type="submit">Sign in</button>
                <a href="/forgot">Forgot password?</a>
            </form>
        `;
    }
}
```

---

## Manifest in Separate File

For components you don't own (e.g. third-party), you can place the manifest
in a co-located `.xtest-map.ts` file:

```ts
// login-form.xtest-map.ts
import { defineSurface } from 'xtest';

export default defineSurface('login-form', {
    'username-input': {
        strategy: { type: 'by-selector', value: 'input[name=email]' },
        aliases:  ['user name', 'email', 'email address'],
    },
    'submit-button': {
        strategy: { type: 'by-role', value: 'button', name: 'Log in' },
        aliases:  ['submit', 'login button'],
    },
});
```

Pass it to the CLI:
```bash
xtest run login.xtest --map ./login-form.xtest-map.ts
```
