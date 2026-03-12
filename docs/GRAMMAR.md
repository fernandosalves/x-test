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
GivenStep   ← "component" Ident "is" "loaded"
            / "fixture" String "is" "applied"
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
            / ReloadAction

TypeAction  ← "type" String "into" ElementRef
ClickAction ← "click" ElementRef
            / "double-click" ElementRef
            / "right-click" ElementRef
SelectAction← "select" String "in" ElementRef
ClearAction ← "clear" ElementRef
WaitAction  ← "wait" "for" ElementRef
            / "wait" Number "ms"
HoverAction ← "hover" ElementRef
ScrollAction← "scroll" "to" ElementRef
ReloadAction← "reload" "page"
             / "navigate" "to" String

AssertStep  ← "check" ElementRef Assertion
            / "check" Variable "equals" String
            / "check" Variable "matches" String

Assertion   ← Negation? AssertionOp

Negation    ← "is" "not" / "not"

AssertionOp ← "is" Visibility
            / "is" InputState
            / "contains" String
            / "has" "value" String
            / "has" "focus"
            / "has" "class" String
            / "has" "prop" String "equals" String
            / "has" "attr" String ("equals" String / "is" ("present"/"absent"))
            / "matches" String

Visibility  ← "visible" / "hidden" / "absent" / "present"
InputState  ← "enabled" / "disabled" / "checked" / "unchecked" / "readonly"

StoreStep   ← "store" ElementRef "text" "as" Variable
            / "store" ElementRef "value" "as" Variable

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
check <element> contains "text"
check <element> has value "text"  # input/select current value
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

# Any assertion can be negated
check <element> not has prop "type" equals "password"
check <element> is not visible
```

---

## Actions Reference

```
# Input
type "text" into <element>         # sets value + fires input/change events
clear <element>                    # clears value
select "Option Label" in <element> # selects <option> by visible text

# Pointer
click <element>
double-click <element>
right-click <element>
hover <element>

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
