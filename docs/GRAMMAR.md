# Miura — DSL Grammar

The `.xtest` file format uses an indentation-sensitive plain-language grammar.
This document is the authoritative specification.

---

## PEG Grammar (formal)

```peg
File        ← Suite* EOF

Suite       ← "suite" Ident NEWLINE
              INDENT
                Setup?
                Scenario+
                Teardown?
              DEDENT

Setup       ← "setup" NEWLINE INDENT Step+ DEDENT
Teardown    ← "teardown" NEWLINE INDENT Step+ DEDENT

Scenario    ← "scenario" String NEWLINE
              INDENT
                Given?
                Step+
              DEDENT

Given       ← "given" NEWLINE INDENT GivenStep+ DEDENT
GivenStep   ← "component" Ident "is" "loaded"
            / "fixture" String "is" "applied"
            / Step

Step        ← ActionStep / AssertStep / StoreStep / PressStep / NavigateStep

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

  scenario "Successful login"
    type "ada@example.com" into username-input
    type "hunter2"         into password-input
    click submit-button
    check error-message is absent
    check dashboard     is visible

  scenario "Wrong password"
    type "ada@example.com" into username-input
    type "wrong"           into password-input
    click submit-button
    check error-message is visible
    check error-message contains "Invalid credentials"
    check password-input has value ""

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

## Scope (future)

For testing components that contain sub-components, steps can be scoped:

```
# Not yet implemented — reserved syntax
within login-form
  click submit-button

within user-table row:3
  check edit-button is enabled
```

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
