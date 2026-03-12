# Miura — DSL Grammar

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

Step        ← ActionStep / AssertStep / StoreStep / PressStep / NavigateStep / WithinStep

WithinStep  ← "within" ElementRef NEWLINE INDENT Step+ DEDENT

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
ClickAction ← "click" ElementRef
            / "double-click" ElementRef
            / "right-click" ElementRef
SelectAction← "select" String "in" ElementRef
ClearAction ← "clear" ElementRef
WaitAction  ← "wait" "for" ElementRef (Number "ms")?
            / "wait" Number "ms"
HoverAction ← "hover" ElementRef
ScrollAction← "scroll" "to" ElementRef
FocusAction ← "focus" ElementRef
ReloadAction← "reload" "page"
             / "navigate" "to" String

AssertStep  ← "check" ElementRef Assertion
            / "check" Variable "equals" String
            / "check" Variable "matches" String
            / "check" "spy" String SpyAssertion

SpyStep     ← "register" "spy" String ("returning" String)?

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
            / "contains" String
            / "has" "value" String
            / "has" "text"  String
            / "has" "focus"
            / "has" "class" String
            / "has" "count" Number
            / "has" "prop" String "equals" String
            / "has" "attr" String ("equals" String / "is" ("present"/"absent"))
            / "matches" String

Visibility  ← "visible" / "hidden" / "absent" / "present"
InputState  ← "enabled" / "disabled" / "checked" / "unchecked" / "readonly" / "focused"

StoreStep   ← "store" ElementRef "text" "as" Variable
            / "store" ElementRef "value" "as" Variable

Step        ← ActionStep / AssertStep / StoreStep / SpyStep / PressStep / NavigateStep / WithinStep

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

# Element count
check <element> has count 3
check <element> has count 0      # assert no matches

# Any assertion can be negated
check <element> not has prop "type" equals "password"
check <element> not has count 5
check <element> is not visible
```

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
clear <element>                    # clears value
select "Option Label" in <element> # selects <option> by visible text

# Pointer & focus
click <element>
double-click <element>
right-click <element>
hover <element>
focus <element>                    # move focus without clicking

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
