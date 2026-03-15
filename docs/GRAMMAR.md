# xtest — DSL Grammar

The `.xtest` file format uses an indentation-sensitive plain-language grammar.
This document is the authoritative specification.

---

## PEG Grammar (formal)

```peg
File        ← Suite* EOF

Suite       ← SuiteKw Ident NEWLINE
              INDENT
                Setup?
                BeforeEach?
                Scenario+
                AfterEach?
                Teardown?
              DEDENT

SuiteKw     ← "suite"           -- normal
            / "xsuite"           -- skipped (all scenarios skipped)
            / "only" "suite"     -- focused (only this suite runs)

Setup       ← "setup"      NEWLINE INDENT Step+ DEDENT
Teardown    ← "teardown"   NEWLINE INDENT Step+ DEDENT
BeforeEach  ← ("beforeEach" / "before-each") NEWLINE INDENT Step+ DEDENT
AfterEach   ← ("afterEach"  / "after-each")  NEWLINE INDENT Step+ DEDENT

Scenario    ← ScenarioKw String NEWLINE
              INDENT
                Given?
                Step+
              DEDENT

ScenarioKw  ← "scenario"          -- normal
            / "xscenario"          -- skipped
            / "only" "scenario"    -- focused

Given       ← "given" NEWLINE INDENT GivenStep+ DEDENT
GivenStep   ← "component" Ident "is" "loaded"   -- mount component HTML from fixtures map
            / "fixture" String "is" "applied"    -- apply a named HTML fixture
            / Step

Step        ← ActionStep / AssertStep / StoreStep / PressStep / NavigateStep / WithinStep / MacroCall

WithinStep  ← "within" ElementRef ScopeChain? NEWLINE INDENT Step+ DEDENT
ScopeChain  ← (DotScope / LegacyScope)+
DotScope    ← "." Ident ScopeModifier?
LegacyScope ← Ident ScopeModifier?
ScopeModifier ← ParenQualifier? Filter?
ParenQualifier ← "(" Number? ")"
Filter     ← AttrFilter / TextFilter / BracketFilter
AttrFilter ← "#" Ident "(" FilterValue ")"
TextFilter ← "@" ("text" / "contains")? "(" String ")"
BracketFilter ← "[" ("text" / Ident) ("=" / "~=") String "]"
FilterValue ← String / Number / Ident

ActionStep  ← TypeAction
            / ClickAction
            / SelectAction
            / ClearAction
            / WaitAction
            / HoverAction
            / ScrollAction
            / FocusAction
            / ReloadAction

TypeAction  ← "type" String "into" ElementRef
FillAction  ← "fill" String "into" ElementRef
ClickAction ← "click" ElementRef
            / "double-click" ElementRef
            / "right-click" ElementRef
SelectAction← "select" ("value")? String "in" ElementRef
ClearAction ← "clear" ElementRef
WaitAction  ← "wait" "for" ElementRef (Number "ms")?
            / "wait" Number "ms"
HoverAction ← "hover" ElementRef
ScrollAction← "scroll" "to" ElementRef
FocusAction ← "focus" ElementRef
BlurAction  ← "blur" ElementRef
ReloadAction← "reload" "page"
             / "navigate" "to" String
Screenshot  ← "take" "screenshot" String?

AssertStep  ← "check" ElementRef Assertion
            / "check" Variable ("not")? "equals" String
            / "check" Variable ("not")? "matches" String
            / "check" "spy" String SpyAssertion

SpyStep     ← "register" "spy" String ("returning" String)?
            / "reset" "spy" String

MockStep    ← "mock" Method String MockModifier* ("returning" String)?
MockModifier← "with" "status" Number
            / "with" "delay" Number "ms"?
            / "delay" Number "ms"?
Method      ← "GET" / "POST" / "PUT" / "PATCH" / "DELETE" / "HEAD"

WaitFnStep  ← "wait" "for" "function" String (Number "ms"?)?   -- default timeout 5000ms

RequestStep ← "check" "request" String RequestAssertion
RequestAssertion
            ← "was" "made"
            / "was" ("not" / "never") ("made" / "called")
            / "was" "called" "once"
            / "was" "called" Number "times"
            / "was" "called" "with" String

SpyAssertion← "was" "called"
            / "was" ("not" / "never") "called"
            / "was" "called" "once"
            / "was" "called" Number "times"
            / "was" "called" "with" String+
            / "last" "returned" String

Assertion   ← Negation? AssertionOp

Negation    ← "is" "not" / "not"

AssertionOp ← "is" Visibility
            / "is" InputState
            / "is" "empty"
            / "contains" String
            / "has" "value" String
            / "has" "text"  String
            / "has" "focus"
            / "has" "class" String
            / "has" "count" Number
            / "has" "prop"  String "equals" String
            / "has" "attr"  String ("equals" String / "is" ("present"/"absent"))
            / "has" "aria"  String String
            / "has" "role"  String
            / "has" "accessible" "name" String
            / "has" "alt" String
            / "matches" String

A11yStep    ← "check" "page" "has" ("no" / "not") "a11y" ("violations")?
            / "check" ElementRef "has" ("no" / "not") "a11y" ("violations")?

Visibility  ← "visible" / "hidden" / "absent" / "present"
InputState  ← "enabled" / "disabled" / "checked" / "unchecked" / "readonly" / "focused" / "focusable"

StoreStep   ← "store" ElementRef "text" "as" Variable
            / "store" ElementRef "value" "as" Variable

Step        ← ActionStep / AssertStep / StoreStep / SpyStep / MockStep / RequestStep / WaitFnStep / PressStep / NavigateStep / WithinStep
            / MacroCall

PressStep   ← "press" Key
Key         ← String      -- "Enter", "Tab", "Escape", "ArrowDown" etc.

NavigateStep← "navigate" "to" String

ElementRef  ← Variable / QuotedRef / BareRef
Variable    ← "$" Ident
QuotedRef   ← '"' [^"]* '"'    -- allows spaces: "user name input"
BareRef     ← Ident ("-" Ident)*  -- kebab: submit-button

String      ← '"' [^"]* '"'
Number      ← [0-9]+
Ident       ← [a-zA-Z_] [a-zA-Z0-9_]*
NEWLINE     ← "\n" / "\r\n"
INDENT      ← deeper indentation than parent (2 or 4 spaces; consistent per file)
DEDENT      ← return to parent indentation level
Comment     ← "#" [^\n]* NEWLINE   (ignored by parser)
```

---

## Full Example

```
# Login form test suite
suite UserLogin

  setup
    navigate to "http://localhost:3000/login"

  beforeEach
    clear username-input
    clear password-input

  scenario "Successful login"
    type "ada@example.com" into username-input
    type "hunter2"         into password-input
    click submit-button
    check error-message is absent
    check dashboard     is visible

  scenario "Wrong password"
    within login-form
      type "ada@example.com" into username-input
      type "wrong"           into password-input
      click submit-button
    check error-message is visible
    check error-message contains "Invalid credentials"
    check password-input has value ""

  scenario "Input attributes"
    check username-input has attr "required" is present
    check username-input has prop "type" equals "email"
    check submit-button  has attr "disabled" is absent

  scenario "Empty form — required validation"
    click submit-button
    check error-message is visible
    check username-input has focus

  scenario "Tab navigation order"
    click username-input
    press "Tab"
    check password-input has focus
    press "Tab"
    check submit-button has focus

  scenario "Capture and assert dynamic value"
    type "ada@example.com" into username-input
    store username-input value as $entered
    clear username-input
    type "other@example.com" into username-input
    check $entered equals "ada@example.com"

  # xscenario — skipped (flaky / WIP)
  xscenario "Network timeout recovery"
    navigate to "http://slow-server"
    wait for dashboard

  afterEach
    reload page

  teardown
    navigate to "about:blank"
```

---

## Indentation Rules

- Consistent 2 or 4 spaces per file (mixed triggers a parse error)
- Tabs are not allowed
- A `scenario` block must be indented exactly one level inside `suite`
- Steps must be indented exactly one level inside `scenario`, `setup`, `teardown`, or `given`
- `given` blocks are optional and must come before steps in a scenario

---

## Comments

Lines starting with `#` are comments and are ignored by the parser:

```
suite Registration

  # This tests the happy path
  scenario "New user registers"
    # Fill in the form
    type "ada" into username-input
    type "secret" into password-input
    click register-button
    # Expect redirect
    check welcome-banner is visible
```

---

## Element References

Element references appear wherever a step targets a UI element. Three forms:

| Form | Example | When to use |
|---|---|---|
| Bare (kebab-case) | `submit-button` | Matches manifest element name or alias |
| Quoted | `"user name input"` | Alias with spaces |
| Variable | `$myElement` | Captured reference (future feature) |

All bare and quoted references are resolved through the alias resolver before reaching the runner. If no match is found, the test fails with a `ResolutionError` listing the closest candidates.

---

## Assertions Reference

```
# Visibility
check <element> is visible
check <element> is hidden
check <element> is absent       # not in DOM at all
check <element> is present      # in DOM (may be hidden)
check <element> is not visible

# Content
check <element> contains "text"           # case-insensitive substring match
check <element> has text "exact text"     # exact text equality (trimmed)
check <element> has value "text"          # input/select current value
check <element> has class "name"

# DOM properties (element[prop])
check <element> has prop "type"     equals "email"
check <element> has prop "disabled" equals "false"
check <element> has prop "tagName"  equals "BUTTON"

# HTML attributes (getAttribute)
check <element> has attr "required"           # presence (bare)
check <element> has attr "required" is present
check <element> has attr "disabled" is absent
check <element> has attr "data-theme" equals "dark"
check <element> has attr "aria-label" equals "Main panel"

# Interaction state
check <element> has focus
check <element> is enabled
check <element> is disabled
check <element> is checked
check <element> is unchecked
check <element> is readonly

# Variable assertions
check $var equals "text"
check $var matches "regex pattern"
check $var not equals "text"       # negated
check $var not matches "pattern"   # negated

# Element count
check <element> has count 3
check <element> has count 0      # assert no matches

# Emptiness
check <element> is empty         # value="" for inputs; trimmed text="" for others
check <element> not is empty

# ARIA
check <element> has aria "label" "Submit form"    # checks aria-label attribute
check <element> has aria "labelledby" "my-id"     # checks any aria-* attribute
check <element> has role "button"                 # checks role attribute
check <element> not has role "link"

# Focusability
check <element> is focusable                      # tabIndex >= 0
check <element> not is focusable

# Accessible name  (aria-label > aria-labelledby > alt > title > textContent)
check <element> has accessible name "Submit form"
check <element> has accessible name "Close dialog"

# Image alt text
check <element> has alt "Company logo"
check <element> has alt ""                        # decorative image (empty alt)

# Any assertion can be negated
check <element> not has prop "type" equals "password"
check <element> not has count 5
check <element> is not visible
```

---

## Accessibility Testing

xtest has first-class a11y support through four assertion types and an **axe-core** integration for automated scanning.

### Focusability

```
check <element> is focusable        # tabIndex >= 0
check <element> not is focusable    # tabIndex < 0 (explicitly removed from tab order)
```

### Accessible Name

Computes the accessible name following the ARIA priority chain:
`aria-label` → `aria-labelledby` → `alt` (images) → `title` → `textContent`

```
check submit-btn has accessible name "Submit form"
check icon-btn   has accessible name "Close dialog"
check logo       has accessible name "Company logo"  # reads alt attribute
```

### Image Alt Text

Shorthand for checking the `alt` attribute directly:

```
check logo  has alt "Company logo"
check deco  has alt ""              # decorative image — alt must be empty string
check hero  not has alt ""          # meaningful image — must have non-empty alt
```

### Axe-core Scan (`check … has no a11y violations`)

Runs the full [axe-core](https://github.com/dequelabs/axe-core) ruleset against a page or scoped element. Fails with a detailed list if any violations are found.

```
check page has no a11y violations           # whole document
check login-form has no a11y violations     # scoped to an element subtree
```

**Error output example:**
```
[xtest] Accessibility violations found:
  • [critical] image-alt: Ensures <img> elements have alternate text
    Nodes: <img src="hero.png">
  • [serious] label: Ensures every form element has a label
    Nodes: <input type="email">
```

**Notes:**
- Colour-contrast checks produce a harmless JSDOM `canvas` warning — they are skipped automatically in environments without a canvas renderer
- Scoped checks (`check login-form has no a11y violations`) only report violations *within* that element's subtree
- Playwright mode injects `axe.min.js` at runtime — no extra setup required

### Combined a11y example

```
suite Accessibility — Login Form
  scenario "form is accessible"
    check page has no a11y violations

  scenario "submit button has correct accessible name"
    check submit-btn is focusable
    check submit-btn has accessible name "Log in to your account"
    check submit-btn has role "button"

  scenario "logo has meaningful alt text"
    check logo has alt "Acme Inc."
    check logo not has alt ""
```

---

## Network Mocks

xtest intercepts `fetch` (JSDOM) or uses `page.route()` (Playwright) automatically — no MSW setup required. Mocks and call logs **auto-reset between scenarios**.

### Registering mocks

```
mock GET "/api/users" returning "{ \"users\": [] }"
mock POST "/api/login" returning "{ \"token\": \"abc123\" }"
mock POST "/api/login" with status 401 returning "{ \"error\": \"Unauthorized\" }"
mock DELETE "/api/item/1" with status 204
```

- Method is case-insensitive (`GET`, `get`, `Get` all work)
- `with status N` is optional — defaults to `200`
- `with delay N ms` is optional — simulates network latency (in ms)
- Both modifiers can appear together in any order
- `returning "body"` is optional — defaults to empty body
- Unregistered requests throw a clear error: `[xtest] No mock registered for GET /api/data`

### Mock with delay

Simulate a slow API to test loading states:

```
mock GET "/api/users" with delay 800 ms returning "{ \"users\": [] }"
mock POST "/api/login" with status 503 with delay 2000 returning "{ \"error\": \"Service unavailable\" }"
```

### `wait for function "name" [N ms]`

Calls `window.name()` and awaits its return value. Useful after triggering fetch-based actions so you can wait for the Promise chain to settle before asserting on the DOM. Default timeout is **5000 ms**.

```
wait for function "loadData"                # 5s timeout
wait for function "initApp" 3000 ms         # custom timeout
wait for function "submitForm" 10000 ms
```

Fails with a clear timeout message if the function doesn't resolve in time, or with a type error if `window.name` is not a function.

### Asserting on requests

The request identifier is `"METHOD url"` as a single string:

```
check request "GET /api/users" was made
check request "GET /api/users" was not made
check request "POST /api/login" was called once
check request "POST /api/login" was called 3 times
check request "POST /api/login" was called with "ada@example.com"
```

### Full scenario example

```
suite User Dashboard

  scenario "loads and displays users"
    mock GET "/api/users" returning "{ \"users\": [{ \"id\": 1, \"name\": \"Ada\" }] }"
    navigate to "http://localhost:3000"
    wait 50 ms
    check user-list contains "Ada"
    check request "GET /api/users" was called once

  scenario "shows empty state when no users"
    mock GET "/api/users" returning "{ \"users\": [] }"
    navigate to "http://localhost:3000"
    wait 50 ms
    check empty-state is visible
    check request "GET /api/users" was made

  scenario "handles login error"
    mock POST "/api/login" with status 401 returning "{ \"error\": \"Unauthorized\" }"
    fill "wrong@test.com" into email-input
    click login-btn
    wait 50 ms
    check error-banner is visible
    check error-banner contains "Unauthorized"
    check request "POST /api/login" was called with "wrong@test.com"

  scenario "mocks do not bleed between scenarios"
    mock GET "/api/users" returning "[]"
    check request "GET /api/users" was not made    # auto-reset: previous scenario's calls are gone
```

**Notes:**
- `wait N ms` after triggering a fetch gives the async Promise chain time to settle and update the DOM
- `was called with "text"` does a substring match against the serialised request body
- Mocks are matched by exact `METHOD url` key — query strings must be included if present: `mock GET "/api/users?page=2" returning "..."`

---

## Spy Assertions

Spies are named functions injected into `window` that record every call. Register
them before the action that triggers them, then assert on the recorded calls.

```
# Register (as a regular step or in given/beforeEach)
register spy "onSubmit"
register spy "fetchUser" returning "{ id: 1 }"

# Was called at all
check spy "onSubmit" was called
check spy "onSubmit" was not called
check spy "onSubmit" was never called    # alias for "was not called"

# Exact call count
check spy "onSubmit" was called once
check spy "onSubmit" was called 3 times

# Arguments (checks at least one call matched ALL listed args in order)
check spy "onSubmit" was called with "ada@example.com"
check spy "onSubmit" was called with "ada@example.com" "hunter2"

# Return value of most recent call
check spy "fetchUser" last returned "{ id: 1 }"
```

**How it works:**
- `register spy "name"` attaches a function to `window.name` in the test environment.
- Any inline HTML handler `onclick="onSubmit(value)"` or component callback
  that calls `window.name(...)` will be recorded.
- Spy call records are **automatically reset between scenarios** for isolation.
- An optional `returning "value"` makes the spy return that string when called.

**Example:**

```
suite LoginForm
  scenario "submits with correct email"
    register spy "onSubmit"
    type "ada@example.com" into email-field
    click submit-button
    check spy "onSubmit" was called once
    check spy "onSubmit" was called with "ada@example.com"
```

---

### Actions Reference

```
# Input
type "text" into <element>         # sets value + fires input/change events
fill "text" into <element>         # clear + type in one step (replaces existing)
clear <element>                    # clears value

# Selection
select "Option Label" in <element> # selects <option> by visible text
select value "v2" in <element>     # selects <option> by value attribute

# Pointer & focus
click <element>
double-click <element>
right-click <element>
hover <element>
focus <element>                    # move focus without clicking
blur <element>                     # remove focus, fire blur/focusout events

# Keyboard
press "Enter"
press "Tab"
press "Escape"
press "ArrowDown"
press "Ctrl+A"      # modifier combos

# Scrolling
scroll to <element>

# Navigation
navigate to "https://example.com"
reload page

# Timing
wait for <element>              # waits until visible (default timeout: 5000ms)
wait for <element> 3000 ms      # waits up to 3000ms
wait 500 ms

# Debugging
take screenshot
take screenshot "my-screenshot"    # saves as my-screenshot.png (Playwright only)
```

---

## Scope (`within`)

Scope all nested steps to a root element. Subsequent element queries are
rooted within that element's subtree — they will not match elements outside it.

```
within login-form
  type "ada@example.com" into username-input
  type "hunter2"         into password-input
  click submit-button

# Steps after the within block return to document scope
check dashboard is visible
```

Scopes can be nested:

```
within main-panel
  within user-section
    check avatar is visible
    check name-label contains "Ada"
```

The `within` root element is resolved via the manifest like any other element.

---

## Skip and Focus

Same semantics as `xit` / `it.only` in Jest:

```
xscenario "flaky test — WIP"
  navigate to "http://slow-server"
  wait for dashboard

only scenario "debug this one"
  click submit-button
  check dashboard is visible

xsuite SkipAll
  scenario "a"
    ...

only suite FocusHere
  scenario "b"
    ...
```

- `xscenario` / `xsuite` — always skipped, reported as `# SKIP` in TAP
- `only scenario` / `only suite` — triggers **focus mode**: only focused scenarios run; all others are auto-skipped for that file

---

## `beforeEach` / `afterEach`

Per-scenario hooks declared inside a `suite`. `afterEach` always runs even
if the scenario fails.

```
suite LoginForm

  beforeEach
    clear username-input
    clear password-input

  afterEach
    reload page

  scenario "first"
    ...

  scenario "second"
    ...
```

| Hook | Runs | On failure? |
|---|---|---|
| `setup` | Once before all scenarios | — |
| `beforeEach` | Before every non-skipped scenario | skipped if beforeEach throws |
| `afterEach` | After every non-skipped scenario | **always** |
| `teardown` | Once after all scenarios | best-effort |

---

## `given` Block

Per-scenario setup that runs before the scenario's own steps. Supports all
regular steps plus two special forms:

```
scenario "login as Ada"
  given
    component LoginForm is loaded    # mounts HTML registered for LoginForm
    navigate to "http://localhost:3000"

scenario "with dark theme"
  given
    fixture "dark-theme-page" is applied  # mounts registered fixture HTML
    check body has class "dark"
```

Fixtures are registered when constructing the `Executor`:

```ts
const executor = new Executor(runner, manifest, {
    fixtures: {
        'LoginForm':       loginFormHTML,
        'dark-theme-page': darkThemeHTML,
    },
});
```

`component X is loaded` is a no-op if no fixture is registered for `X` (falls
back to the HTML passed to `runFile`). `fixture "name" is applied` throws a
helpful error if the fixture is not found.

---

## Multi-suite Files

A single `.xtest` file may contain multiple `suite` blocks:

```
suite LoginForm
  scenario "..."
    ...

suite RegistrationForm
  scenario "..."
    ...
```

Each suite resolves element references against its own component's manifest, declared with the `--component` flag or a `@xtest-target` annotation in the file header.
