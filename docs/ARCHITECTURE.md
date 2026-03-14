# xtest — Architecture

## Overview

xtest is a plain-language component testing framework built around a single core idea: **the component owns the selector, not the test**. This document describes the full system design.

---

## Pipeline

```
.xtest file          Component source
     │                     │
     ▼                     ▼
  Lexer              Manifest Extractor
     │                     │
     ▼                     ▼
  Parser             Surface Manifest
     │                     │
     └────────┬────────────┘
              ▼
           Resolver
              │
         (name → selector)
              │
              ▼
           Runner
       (JSDOM │ Playwright)
              │
              ▼
           Reporter
       (TAP │ HTML │ stdout)
```

Each stage is independently testable and replaceable.

---

## Stage 1 — Lexer (`src/parser/lexer.ts`)

Converts a raw `.xtest` file string into a flat token stream.

**Token types:**
```
KEYWORD      suite | scenario | given | setup | teardown
ACTION       type | click | select | clear | press | wait | hover | scroll | navigate | reload | store
ASSERT       check
STRING       "..." (double-quoted literal)
IDENT        bare word (element name, variable)
VARIABLE     $name
PREPOSITION  into | in | for | to | as | on
ASSERTION_OP is | contains | has | equals | matches
STATE        visible | hidden | absent | enabled | disabled | focused | checked
MODIFIER     not
NEWLINE
INDENT
COMMENT      # ...
EOF
```

Indentation is significant (Python-style). `scenario` blocks are children of `suite`. Steps are children of `scenario`.

---

## Stage 2 — Parser (`src/parser/parser.ts`)

Builds a typed AST from the token stream.

**AST shape:**
```ts
SuiteNode {
    name: string
    setup?:    StepNode[]
    teardown?: StepNode[]
    scenarios: ScenarioNode[]
}

ScenarioNode {
    description: string
    given?:      StepNode[]
    steps:       StepNode[]
}

StepNode =
    | ActionStep   { action: ActionKind; element: ElementRef; value?: string }
    | AssertStep   { element: ElementRef; assertion: AssertionKind; value?: string; negated: boolean }
    | StoreStep    { element: ElementRef; variable: string }
    | PressStep    { key: string }
    | NavigateStep { url: string }
```

---

## Stage 3 — Manifest Extractor (`src/manifest/extractor.ts`)

Reads component source files and extracts `@xtest-surface` blocks from JSDoc comments.

**Input** (any `.ts`, `.js`, `.html` file):
```ts
/**
 * @xtest-surface
 * @element username-input   by-ref: username
 *   @alias  "user name", "email field"
 * @element submit-button    by-role: button
 */
```

**Output** (`SurfaceManifest`):
```ts
{
    elements: {
        "username-input": {
            name:     "username-input",
            strategy: { type: "by-ref", value: "username" },
            aliases:  ["user name", "email field"],
        },
        "submit-button": {
            name:     "submit-button",
            strategy: { type: "by-role", value: "button" },
            aliases:  [],
        },
    }
}
```

The extractor also auto-discovers elements from `data-xtest` attributes in HTML template strings — if a component uses `xtest('username')` in its template, the element is registered automatically even without an explicit `@element` annotation.

---

## Stage 4 — Resolver (`src/resolver/resolver.ts`)

Maps an `ElementRef` from the AST to a concrete DOM selector, using the `SurfaceManifest`.

**Resolution priority (first match wins):**

| Priority | Strategy | Example manifest entry | Resulting selector |
|---|---|---|---|
| 1 | `by-ref` | `by-ref: username` | `[data-xtest="username"]` |
| 2 | `by-selector` | `by-selector: .error-msg` | `.error-msg` |
| 3 | `by-aria-label` | `by-aria-label: "Username"` | `[aria-label="Username"]` |
| 4 | `by-role` | `by-role: button` | `[role="button"], button` |
| 5 | `by-name` | `by-name: username` | `[name="username"]` |
| 6 | `by-placeholder` | `by-placeholder: "Enter email"` | `[placeholder="Enter email"]` |
| 7 | `by-text` | `by-text: "Sign in"` | *(text search)* |
| 8 | `inferred` | *(no strategy)* | auto-infer from element name |

**Alias matching:**

Step text is normalised (lowercase, punctuation stripped) and compared against:
1. Exact element name match: `"submit-button"` → `submit-button`
2. Exact alias match: `"sign in"` → alias of `submit-button`
3. Fuzzy alias match (edit distance ≤ 2): `"singin"` → `submit-button` (warning emitted)
4. Inference fallback: name words matched against `[name]`, `[placeholder]`, `[aria-label]`

---

## Stage 5 — Runner (`src/runner/`)

Executes the resolved steps against a live DOM. Two adapters:

### JSDOM Runner (`src/runner/jsdom-runner.ts`)
- Renders the component HTML into a JSDOM environment
- No browser process required — fast, deterministic
- Suitable for unit testing pure HTML/template components
- Limitation: no real layout engine (visibility checks use `hidden`/`display` heuristics)

### Playwright Runner (`src/runner/playwright-runner.ts`)
- Launches a real browser via Playwright
- Used for integration/E2E scenarios
- Accepts a `--url` or `--html` target
- Full layout engine — visibility checks are pixel-accurate

**Runner interface:**
```ts
interface xtestRunner {
    mount(html: string): Promise<void>;
    find(selector: string): Promise<ElementHandle>;
    click(selector: string): Promise<void>;
    type(selector: string, text: string): Promise<void>;
    getValue(selector: string): Promise<string>;
    getText(selector: string): Promise<string>;
    isVisible(selector: string): Promise<boolean>;
    isPresent(selector: string): Promise<boolean>;
    hasFocus(selector: string): Promise<boolean>;
    press(key: string): Promise<void>;
    navigate(url: string): Promise<void>;
}
```

---

## Stage 6 — Reporter (`src/reporter/`)

Receives test results and formats them.

| Reporter | Output |
|---|---|
| `TapReporter` | TAP v13 (compatible with all CI systems) |
| `HtmlReporter` | Self-contained HTML page with pass/fail summary |
| `PrettyReporter` | Coloured stdout for CLI use |

---

## The `xtest()` Directive (`src/directive/xtest.ts`)

A framework-agnostic element annotation function:

```ts
// In development (NODE_ENV !== 'production'):
xtest('username')  →  { 'data-xtest': 'username' }

// In production:
xtest('username')  →  {}   // no-op, zero footprint
```

Works as a spread in any template system:
```ts
// Maori / Lit
html`<input ${xtest('username')} type="text" />`

// React
<input {...xtest('username')} type="text" />

// Vue
<input v-bind="xtest('username')" type="text" />

// Vanilla
Object.assign(inputEl, xtest('username'))
```

---

## The `@xtest-surface` Manifest

See [MANIFEST.md](./MANIFEST.md) for the full specification.

Short form: the manifest is a JSDoc block co-located with the component class/function that declares:
- Which elements are testable
- How to find them in the DOM
- What natural-language aliases they respond to

---

## File Layout

```
xtest-testing/
├── README.md
├── package.json
├── tsconfig.json
├── docs/
│   ├── ARCHITECTURE.md      ← this file
│   ├── GRAMMAR.md
│   └── MANIFEST.md
├── src/
│   ├── index.ts             ← public API
│   ├── parser/
│   │   ├── ast.ts           ← AST node types
│   │   ├── lexer.ts         ← tokenizer
│   │   └── parser.ts        ← AST builder
│   ├── manifest/
│   │   ├── types.ts         ← SurfaceManifest types
│   │   └── extractor.ts     ← JSDoc + data-xtest extractor
│   ├── resolver/
│   │   ├── resolver.ts      ← ElementRef → CSS selector
│   │   └── strategies.ts    ← per-strategy implementations
│   ├── directive/
│   │   └── xtest.ts         ← xtest() element annotator
│   ├── runner/
│   │   ├── runner.ts        ← xtestRunner interface
│   │   ├── jsdom-runner.ts  ← JSDOM adapter
│   │   └── playwright-runner.ts
│   ├── reporter/
│   │   ├── tap.ts
│   │   ├── html.ts
│   │   └── pretty.ts
│   └── cli/
│       └── index.ts         ← xtest run CLI
├── examples/
│   ├── login-form/
│   │   ├── login-form.ts
│   │   └── login.xtest
│   └── todo-list/
│       ├── todo-list.ts
│       └── todo.xtest
└── stories/                 ← Storybook demos
```

---

## Design Decisions

**Why indentation-sensitive syntax instead of braces?**
Because the `.xtest` format is meant to be written by non-engineers or QA teams. Braces add visual noise. Indentation reads more like a list.

**Why no LLM in the resolver?**
Determinism matters in a test runner. Fuzzy matching via edit distance is fast, offline, and reproducible. An LLM-assisted resolver is a future opt-in mode for alias suggestion, not the default path.

**Why JSDoc for the manifest instead of a separate file?**
Co-location. The manifest should be updated when the component changes. A separate `.manifest.json` file will drift. A JSDoc block in the component file drifts with it naturally.

**Why not just use Playwright's `getByRole` / `getByLabel`?**
Those are good — they push Playwright in the right direction. But they require the test author to know which ARIA role/label the element uses. xtest inverts this: the component author makes that decision once in the manifest.
