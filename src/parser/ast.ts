/**
 * Miura — AST node types
 *
 * The AST produced by the parser from a .xtest file.
 * All nodes carry source location for error messages.
 */

// ── Location ────────────────────────────────────────────────────────────────────

export interface Loc {
    line:   number;
    column: number;
    file?:  string;
}

// ── Element references ──────────────────────────────────────────────────────────

export type ElementRef =
    | { kind: 'name';     value: string; loc: Loc }   // submit-button
    | { kind: 'quoted';   value: string; loc: Loc }   // "user name input"
    | { kind: 'variable'; value: string; loc: Loc };  // $myEl

// ── Actions ─────────────────────────────────────────────────────────────────────

export type ActionKind =
    | 'click' | 'double-click' | 'right-click'
    | 'type' | 'clear' | 'select'
    | 'hover' | 'scroll-to'
    | 'wait-for' | 'wait-ms'
    | 'navigate' | 'reload'
    | 'press';

export interface TypeAction    { action: 'type';        element: ElementRef; value: string;  loc: Loc }
export interface ClickAction   { action: 'click'        | 'double-click' | 'right-click'; element: ElementRef; loc: Loc }
export interface SelectAction  { action: 'select';      element: ElementRef; value: string;  loc: Loc }
export interface ClearAction   { action: 'clear';       element: ElementRef; loc: Loc }
export interface HoverAction   { action: 'hover';       element: ElementRef; loc: Loc }
export interface ScrollAction  { action: 'scroll-to';   element: ElementRef; loc: Loc }
export interface WaitForAction { action: 'wait-for';    element: ElementRef; loc: Loc }
export interface WaitMsAction  { action: 'wait-ms';     ms: number;          loc: Loc }
export interface NavigateAction{ action: 'navigate';    url: string;         loc: Loc }
export interface ReloadAction  { action: 'reload';      loc: Loc }
export interface PressAction   { action: 'press';       key: string;         loc: Loc }

export type ActionStep =
    | TypeAction | ClickAction | SelectAction | ClearAction
    | HoverAction | ScrollAction | WaitForAction | WaitMsAction
    | NavigateAction | ReloadAction | PressAction;

// ── Assertions ──────────────────────────────────────────────────────────────────

export type VisibilityState = 'visible' | 'hidden' | 'absent' | 'present';
export type InputState      = 'enabled' | 'disabled' | 'checked' | 'unchecked' | 'readonly' | 'focused';

export type AssertionKind =
    | { op: 'is-visibility'; state: VisibilityState }
    | { op: 'is-input-state'; state: InputState }
    | { op: 'contains';      value: string }
    | { op: 'has-value';     value: string }
    | { op: 'has-focus' }
    | { op: 'has-class';     value: string }
    | { op: 'matches';       pattern: string };

export interface AssertElementStep {
    kind:      'assert-element';
    element:   ElementRef;
    assertion: AssertionKind;
    negated:   boolean;
    loc:       Loc;
}

export interface AssertVariableStep {
    kind:    'assert-variable';
    variable: string;
    op:       'equals' | 'matches';
    value:    string;
    loc:      Loc;
}

export type AssertStep = AssertElementStep | AssertVariableStep;

// ── Store ───────────────────────────────────────────────────────────────────────

export interface StoreStep {
    kind:     'store';
    element:  ElementRef;
    capture:  'text' | 'value';
    variable: string;
    loc:      Loc;
}

// ── Within ─────────────────────────────────────────────────────────────────────

export interface WithinStep {
    kind:  'within';
    root:  ElementRef;
    steps: Step[];
    loc:   Loc;
}

// ── Union step type ─────────────────────────────────────────────────────────────

export type Step =
    | (ActionStep & { kind: 'action' })
    | AssertStep
    | StoreStep
    | WithinStep;

// ── Scenario ────────────────────────────────────────────────────────────────────

export interface ScenarioNode {
    kind:        'scenario';
    description: string;
    given:       Step[];
    steps:       Step[];
    skipped:     boolean;
    focused:     boolean;
    loc:         Loc;
}

// ── Suite ───────────────────────────────────────────────────────────────────────

export interface SuiteNode {
    kind:      'suite';
    name:      string;
    setup:     Step[];
    teardown:  Step[];
    scenarios: ScenarioNode[];
    skipped:   boolean;
    focused:   boolean;
    loc:       Loc;
}

// ── File ────────────────────────────────────────────────────────────────────────

export interface XTestFile {
    suites: SuiteNode[];
    file?:  string;
}
