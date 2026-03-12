/**
 * Miura — Runner interface + execution engine
 *
 * The Runner interface is implemented by each environment adapter (JSDOM, Playwright).
 * The Executor ties together the Parser, Resolver, and Runner to run a full suite.
 */

import type { XTestFile, SuiteNode, ScenarioNode, Step, ActionStep, ElementRef, WithinStep, LoadComponentStep, ApplyFixtureStep, RegisterSpyStep, ResetSpyStep, AssertSpyStep, SpyCall, TakeScreenshotStep, CheckA11yStep, A11yViolation, MockRequestStep, AssertRequestStep, RequestCall, AwaitFunctionStep } from '../parser/ast.js';
import type { SurfaceManifest } from '../manifest/types.js';
import { Resolver, type ResolutionResult } from '../resolver/resolver.js';

// ── Runner interface ────────────────────────────────────────────────────────────

export interface MiuraRunner {
    /** Mount HTML into the test environment. */
    mount(html: string): Promise<void>;
    /** Navigate to a URL. */
    navigate(url: string): Promise<void>;
    /** Reload the current page. */
    reload(): Promise<void>;
    /** Click an element. */
    click(selector: string, opts?: { double?: boolean; right?: boolean }): Promise<void>;
    /** Type text into an input. */
    type(selector: string, text: string): Promise<void>;
    /** Clear an input. */
    clear(selector: string): Promise<void>;
    /** Select an option in a <select> by visible text (default) or by value attribute. */
    select(selector: string, option: string, by?: 'label' | 'value'): Promise<void>;
    /** Hover over an element. */
    hover(selector: string): Promise<void>;
    /** Scroll to an element. */
    scrollTo(selector: string): Promise<void>;
    /** Wait until an element is present and visible. */
    waitFor(selector: string, timeoutMs?: number): Promise<void>;
    /** Wait for a fixed duration. */
    waitMs(ms: number): Promise<void>;
    /** Press a key. */
    press(key: string): Promise<void>;
    /** Get the text content of an element (first match). */
    getText(selector: string, needsText?: string): Promise<string>;
    /** Get the value of an input. */
    getValue(selector: string): Promise<string>;
    /** Check if an element is visible. */
    isVisible(selector: string): Promise<boolean>;
    /** Check if an element exists in the DOM. */
    isPresent(selector: string): Promise<boolean>;
    /** Check if an element has focus. */
    hasFocus(selector: string): Promise<boolean>;
    /** Check if an element is enabled. */
    isEnabled(selector: string): Promise<boolean>;
    /** Check if a checkbox is checked. */
    isChecked(selector: string): Promise<boolean>;
    /** Get a DOM property value (e.g. element.value, element.checked). */
    getProp(selector: string, prop: string): Promise<string>;
    /** Get an attribute value; returns null if absent. */
    getAttr(selector: string, attr: string): Promise<string | null>;
    /** Move focus to an element (without click). */
    focus(selector: string): Promise<void>;
    /** Remove focus from an element. */
    blur(selector: string): Promise<void>;
    /** Clear then type in one step (mirrors Playwright fill). */
    fill(selector: string, value: string): Promise<void>;
    /** Check if an element has a CSS class. */
    hasClass(selector: string, className: string): Promise<boolean>;
    /** Check if an input/textarea is readonly. */
    isReadOnly(selector: string): Promise<boolean>;
    /** Count the number of elements matching the selector (ignores scope stack). */
    count(selector: string): Promise<number>;
    /** Check whether an element is empty (value for inputs, trimmed text otherwise). */
    isEmpty(selector: string): Promise<boolean>;
    /** Check if an element can receive keyboard focus (tabIndex >= 0). */
    isFocusable(selector: string): Promise<boolean>;
    /** Compute the accessible name of an element (aria-label → aria-labelledby → alt → title → textContent). */
    getAccessibleName(selector: string): Promise<string>;
    /** Run an axe-core accessibility scan and return any violations. */
    checkA11y(selector?: string): Promise<A11yViolation[]>;
    /** Register a network mock for fetch/XHR interception. */
    mockRequest(method: string, url: string, status: number, body?: string, delayMs?: number): Promise<void>;
    /** Return all recorded calls to a given method+url. */
    getRequestCalls(method: string, url: string): Promise<RequestCall[]>;
    /** Clear all registered mocks and call logs. */
    clearRequestMocks(): Promise<void>;
    /** Call window[name]() and await its return value, failing if it doesn't resolve within timeoutMs. */
    awaitFunction(name: string, timeoutMs: number): Promise<void>;
    /** Register a named spy on the window/global object and return its recorded calls. */
    registerSpy(name: string, returnValue?: string): Promise<void>;
    /** Get all recorded calls for a named spy. */
    getSpyCalls(name: string): Promise<SpyCall[]>;
    /** Clear call records for one named spy. */
    resetSpy(name: string): Promise<void>;
    /** Clear all spy call records (called between scenarios). */
    resetAllSpies(): Promise<void>;
    /** Capture a screenshot (no-op in environments that don't support it). */
    screenshot(name?: string): Promise<void>;
    /** Push a scoping root — subsequent selectors are resolved within this element. */
    pushScope(selector: string): Promise<void>;
    /** Pop the most recently pushed scope. */
    popScope(): Promise<void>;
    /** Tear down the environment. */
    teardown(): Promise<void>;
}

// ── Test result types ────────────────────────────────────────────────────────────

export interface StepResult {
    step:     string;
    passed:   boolean;
    error?:   string;
    duration: number;
    warning?: string;
}

export interface ScenarioResult {
    description: string;
    passed:      boolean;
    skipped:     boolean;
    focused:     boolean;
    steps:       StepResult[];
    duration:    number;
}

export interface SuiteResult {
    name:      string;
    passed:    boolean;
    scenarios: ScenarioResult[];
    duration:  number;
}

export interface RunResult {
    passed:       boolean;
    suites:       SuiteResult[];
    total:        number;
    totalPass:    number;
    totalFail:    number;
    totalSkipped: number;
    duration:     number;
}

// ── Executor ────────────────────────────────────────────────────────────────────

export class Executor {
    private _runner:   MiuraRunner;
    private _resolver: Resolver;
    private _fixtures: Record<string, string>;
    private _vars:     Map<string, string> = new Map();

    constructor(runner: MiuraRunner, manifest: SurfaceManifest, opts: { fixtures?: Record<string, string> } = {}) {
        this._runner   = runner;
        this._resolver = new Resolver(manifest);
        this._fixtures = opts.fixtures ?? {};
    }

    async runFile(file: XTestFile, html?: string): Promise<RunResult> {
        const start   = Date.now();
        const suites: SuiteResult[] = [];

        // Determine if any suite/scenario is focused — only run focused ones
        const anyFocused =
            file.suites.some(s => s.focused) ||
            file.suites.some(s => s.scenarios.some(sc => sc.focused));

        for (const suite of file.suites) {
            const result = await this._runSuite(suite, html, anyFocused);
            suites.push(result);
        }

        const allScenarios = suites.flatMap(s => s.scenarios);
        const total        = allScenarios.filter(s => !s.skipped).length;
        const pass         = allScenarios.filter(s => s.passed  && !s.skipped).length;
        const fail         = allScenarios.filter(s => !s.passed && !s.skipped).length;
        const skipped      = allScenarios.filter(s => s.skipped).length;

        return {
            passed:       fail === 0,
            suites,
            total,
            totalPass:    pass,
            totalFail:    fail,
            totalSkipped: skipped,
            duration:     Date.now() - start,
        };
    }

    private async _runSuite(suite: SuiteNode, html?: string, anyFocused = false): Promise<SuiteResult> {
        const start = Date.now();
        if (html) await this._runner.mount(html);

        // Setup
        for (const step of suite.setup) {
            await this._execStep(step);
        }

        const scenarios: ScenarioResult[] = [];
        for (const scenario of suite.scenarios) {
            // Skip if: scenario is xscenario, suite is xsuite, or only-mode is active and this isn't focused
            const shouldSkip =
                scenario.skipped ||
                suite.skipped ||
                (anyFocused && !scenario.focused && !suite.focused);

            if (shouldSkip) {
                scenarios.push({
                    description: scenario.description,
                    passed:      true,
                    skipped:     true,
                    focused:     scenario.focused,
                    steps:       [],
                    duration:    0,
                });
                continue;
            }

            // Re-mount between scenarios for isolation
            if (html && scenarios.filter(s => !s.skipped).length > 0) await this._runner.mount(html);
            this._vars.clear();
            await this._runner.resetAllSpies();
            await this._runner.clearRequestMocks();

            // beforeEach
            for (const step of suite.beforeEach) {
                await this._execStep(step);
            }

            let scenarioResult: ScenarioResult;
            try {
                scenarioResult = await this._runScenario(scenario);
            } finally {
                // afterEach — always runs, even on failure
                for (const step of suite.afterEach) {
                    try { await this._execStep(step); } catch { /* best effort */ }
                }
            }
            scenarios.push(scenarioResult!);
        }

        // Teardown
        for (const step of suite.teardown) {
            try { await this._execStep(step); } catch { /* best effort */ }
        }

        return {
            name:      suite.name,
            passed:    scenarios.filter(s => !s.skipped).every(s => s.passed),
            scenarios,
            duration:  Date.now() - start,
        };
    }

    private async _runScenario(scenario: ScenarioNode): Promise<ScenarioResult> {
        const start = Date.now();
        const steps: StepResult[] = [];

        // Given
        for (const step of scenario.given) {
            const r = await this._execStepSafe(step);
            steps.push(r);
            if (!r.passed) {
                return { description: scenario.description, passed: false, skipped: false, focused: scenario.focused, steps, duration: Date.now() - start };
            }
        }

        // Steps
        for (const step of scenario.steps) {
            const r = await this._execStepSafe(step);
            steps.push(r);
            if (!r.passed) break; // stop on first failure
        }

        return {
            description: scenario.description,
            passed:      steps.every(s => s.passed),
            skipped:     false,
            focused:     scenario.focused,
            steps,
            duration:    Date.now() - start,
        };
    }

    private async _execStepSafe(step: Step): Promise<StepResult> {
        const label = this._stepLabel(step);
        const t0    = Date.now();
        try {
            await this._execStep(step);
            return { step: label, passed: true, duration: Date.now() - t0 };
        } catch (err) {
            return {
                step:     label,
                passed:   false,
                error:    err instanceof Error ? err.message : String(err),
                duration: Date.now() - t0,
            };
        }
    }

    private async _execWithin(step: WithinStep): Promise<void> {
        const { selector } = this._resolver.resolve(step.root);
        await this._runner.pushScope(selector);
        try {
            for (const s of step.steps) {
                await this._execStep(s);
            }
        } finally {
            await this._runner.popScope();
        }
    }

    private async _execStep(step: Step): Promise<void> {
        switch (step.kind) {
            case 'action': return this._execAction(step);
            case 'assert-element':  return this._execAssertElement(step);
            case 'assert-variable': return this._execAssertVariable(step);
            case 'store':           return this._execStore(step);
            case 'within':          return this._execWithin(step);
            case 'load-component':  return this._execLoadComponent(step as LoadComponentStep);
            case 'apply-fixture':   return this._execApplyFixture(step as ApplyFixtureStep);
            case 'register-spy':    return this._execRegisterSpy(step as RegisterSpyStep);
            case 'reset-spy':       return this._runner.resetSpy((step as ResetSpyStep).name);
            case 'assert-spy':      return this._execAssertSpy(step as AssertSpyStep);
            case 'take-screenshot': return this._runner.screenshot((step as TakeScreenshotStep).name);
            case 'check-a11y':      return this._execCheckA11y(step as CheckA11yStep);
            case 'mock-request':    { const m = step as MockRequestStep; return this._runner.mockRequest(m.method, m.url, m.status, m.body, m.delayMs); }
            case 'assert-request':  return this._execAssertRequest(step as AssertRequestStep);
            case 'await-function':  return this._runner.awaitFunction((step as AwaitFunctionStep).name, (step as AwaitFunctionStep).timeoutMs);
        }
    }

    private async _execAction(step: ActionStep & { kind: 'action' }): Promise<void> {
        const r = this._resolve('element' in step ? (step as any).element : null);

        switch (step.action) {
            case 'type':       return this._runner.type(r!.selector, (step as any).value);
            case 'click':      return this._runner.click(r!.selector);
            case 'double-click': return this._runner.click(r!.selector, { double: true });
            case 'right-click':  return this._runner.click(r!.selector, { right: true });
            case 'select':     return this._runner.select(r!.selector, (step as any).value, (step as any).by);
            case 'clear':      return this._runner.clear(r!.selector);
            case 'hover':      return this._runner.hover(r!.selector);
            case 'scroll-to':  return this._runner.scrollTo(r!.selector);
            case 'wait-for':   return this._runner.waitFor(r!.selector, (step as any).timeoutMs);
            case 'wait-ms':    return this._runner.waitMs((step as any).ms);
            case 'navigate':   return this._runner.navigate((step as any).url);
            case 'reload':     return this._runner.reload();
            case 'press':      return this._runner.press((step as any).key);
            case 'focus':      return this._runner.focus(r!.selector);
            case 'blur':       return this._runner.blur(r!.selector);
            case 'fill':       return this._runner.fill(r!.selector, (step as any).value);
        }
    }

    private async _execLoadComponent(step: LoadComponentStep): Promise<void> {
        // component X is loaded — re-mount with the component's fixture HTML if registered
        const html = this._fixtures[step.name];
        if (html) await this._runner.mount(html);
        // otherwise no-op: component was already mounted via runFile()
    }

    private async _execApplyFixture(step: ApplyFixtureStep): Promise<void> {
        const html = this._fixtures[step.name];
        if (html) {
            await this._runner.mount(html);
        } else {
            throw new Error(`[miura] Fixture "${step.name}" not found. Register it in Executor options: new Executor(runner, manifest, { fixtures: { "${step.name}": html } })`);
        }
    }

    private async _execRegisterSpy(step: RegisterSpyStep): Promise<void> {
        await this._runner.registerSpy(step.name, step.returnValue);
    }

    private async _execAssertSpy(step: AssertSpyStep): Promise<void> {
        const calls = await this._runner.getSpyCalls(step.spyName);
        const a     = step.assertion;

        const fail = (msg: string) => {
            throw new Error(`Assertion failed: check spy "${step.spyName}" ${msg}`);
        };

        switch (a.op) {
            case 'was-called':
                if (calls.length === 0) fail(`was called — but was never called`);
                break;
            case 'was-not-called':
                if (calls.length > 0) fail(`was not called — but was called ${calls.length} time(s)`);
                break;
            case 'was-called-times':
                if (calls.length !== a.count)
                    fail(`was called ${a.count} time(s) — but was called ${calls.length} time(s)`);
                break;
            case 'was-called-with': {
                const match = calls.some(c =>
                    a.args.every((expected, i) => c.args[i] === expected)
                );
                if (!match)
                    fail(`was called with ${JSON.stringify(a.args)} — actual calls: ${JSON.stringify(calls.map(c => c.args))}`);
                break;
            }
            case 'last-returned': {
                const last = calls[calls.length - 1];
                if (!last) { fail(`last returned "${a.value}" — but was never called`); break; }
                if (last.returnValue !== a.value)
                    fail(`last returned "${a.value}" — got "${last.returnValue}"`);
                break;
            }
        }
    }

    private async _execAssertElement(step: any): Promise<void> {
        const r = this._resolveRef(step.element);
        const a = step.assertion;
        const neg = step.negated;

        const check = async (cond: boolean, expected?: string, actual?: string): Promise<void> => {
            const result = neg ? !cond : cond;
            if (!result) {
                const detail = expected
                    ? actual !== undefined
                        ? ` — expected ${neg ? 'not ' : ''}${expected}, got ${actual}`
                        : ` — expected ${neg ? 'not ' : ''}${expected}`
                    : '';
                throw new Error(`Assertion failed: ${this._stepLabel(step)}${detail}`);
            }
        };

        switch (a.op) {
            case 'is-visibility': {
                const visible  = await this._runner.isVisible(r.selector);
                const present  = await this._runner.isPresent(r.selector);
                const actualState = !present ? 'absent' : visible ? 'visible' : 'hidden';
                if (a.state === 'visible')  await check(visible,  'visible',  actualState);
                if (a.state === 'hidden')   await check(!visible && present, 'hidden',  actualState);
                if (a.state === 'absent')   await check(!present, 'absent',  actualState);
                if (a.state === 'present')  await check(present,  'present', actualState);
                break;
            }
            case 'is-input-state':
                if (a.state === 'enabled')   await check(await this._runner.isEnabled(r.selector),  'enabled');
                if (a.state === 'disabled')  await check(!await this._runner.isEnabled(r.selector), 'disabled');
                if (a.state === 'checked')   await check(await this._runner.isChecked(r.selector),  'checked');
                if (a.state === 'unchecked') await check(!await this._runner.isChecked(r.selector), 'unchecked');
                if (a.state === 'focused')   await check(await this._runner.hasFocus(r.selector),    'focused');
                if (a.state === 'readonly')  await check(await this._runner.isReadOnly(r.selector),  'readonly');
                if (a.state === 'focusable') await check(await this._runner.isFocusable(r.selector), 'focusable');
                break;
            case 'has-prop': {
                const actualProp = await this._runner.getProp(r.selector, a.name);
                await check(String(actualProp) === a.value, `prop "${a.name}" = "${a.value}"`, `"${actualProp}"`);
                break;
            }
            case 'has-attr': {
                const attrVal = await this._runner.getAttr(r.selector, a.name);
                if (a.state === 'present') { await check(attrVal !== null, `attr "${a.name}" present`, attrVal === null ? 'absent' : 'present'); break; }
                if (a.state === 'absent')  { await check(attrVal === null, `attr "${a.name}" absent`,  attrVal === null ? 'absent' : `"${attrVal}"`); break; }
                await check(attrVal === a.value, `attr "${a.name}" = "${a.value}"`, attrVal !== null ? `"${attrVal}"` : 'absent');
                break;
            }
            case 'contains': {
                const text = await this._runner.getText(r.selector, r.needsText);
                await check(text.toLowerCase().includes((a.value as string).toLowerCase()), `contains "${a.value}"`, `"${text}"`);
                break;
            }
            case 'has-value': {
                const val = await this._runner.getValue(r.selector);
                await check(val === a.value, `value "${a.value}"`, `"${val}"`);
                break;
            }
            case 'has-focus':
                await check(await this._runner.hasFocus(r.selector), 'focused');
                break;
            case 'has-class': {
                const has = await this._runner.hasClass(r.selector, a.value);
                await check(has, `class "${a.value}"`);
                break;
            }
            case 'matches': {
                const text = await this._runner.getText(r.selector);
                await check(new RegExp(a.pattern).test(text), `matches /${a.pattern}/`);
                break;
            }
            case 'has-count': {
                const actual = await this._runner.count(r.selector);
                await check(actual === a.count, `count ${a.count}`, String(actual));
                break;
            }
            case 'has-text': {
                const text = await this._runner.getText(r.selector);
                await check(text.trim() === a.value, `text "${a.value}"`, `"${text.trim()}"`);
                break;
            }
            case 'is-empty': {
                const empty = await this._runner.isEmpty(r.selector);
                await check(empty, 'empty');
                break;
            }
            case 'has-aria': {
                const actual = await this._runner.getAttr(r.selector, `aria-${a.name}`);
                await check(actual === a.value, `aria-${a.name}="${a.value}"`, `"${actual ?? '(absent)'}"`);
                break;
            }
            case 'has-role': {
                const actual = await this._runner.getAttr(r.selector, 'role');
                await check(actual === a.role, `role="${a.role}"`, `"${actual ?? '(absent)'}"`);
                break;
            }
            case 'has-accessible-name': {
                const name = await this._runner.getAccessibleName(r.selector);
                await check(name === a.value, `accessible name "${a.value}"`, `"${name}"`);
                break;
            }
            case 'has-alt': {
                const alt = await this._runner.getAttr(r.selector, 'alt');
                await check(alt === a.value, `alt "${a.value}"`, `"${alt ?? '(absent)'}"`);
                break;
            }
            default:
                throw new Error(`[miura] Unhandled assertion op: ${(a as any).op}`);
        }
    }

    private async _execAssertRequest(step: AssertRequestStep): Promise<void> {
        const calls = await this._runner.getRequestCalls(step.method, step.url);
        const a     = step.assertion;
        const label = `${step.method} ${step.url}`;
        switch (a.op) {
            case 'was-made':
                if (calls.length === 0) throw new Error(`[miura] Expected request ${label} to have been made, but it was never called`);
                break;
            case 'was-not-made':
                if (calls.length > 0) throw new Error(`[miura] Expected request ${label} NOT to have been made, but it was called ${calls.length} time(s)`);
                break;
            case 'was-made-times':
                if (calls.length !== a.count) throw new Error(`[miura] Expected request ${label} to be called ${a.count} time(s), but was called ${calls.length} time(s)`);
                break;
            case 'was-made-with': {
                const match = calls.some(c => c.body.includes(a.body) || c.body === a.body);
                if (!match) {
                    const bodies = calls.map(c => `  "${c.body}"`).join('\n') || '  (none)';
                    throw new Error(`[miura] Expected request ${label} to be called with:\n  "${a.body}"\nActual bodies:\n${bodies}`);
                }
                break;
            }
        }
    }

    private async _execCheckA11y(step: CheckA11yStep): Promise<void> {
        const violations = await this._runner.checkA11y(step.selector);
        if (violations.length > 0) {
            const details = violations.map(v =>
                `  • [${v.impact ?? 'unknown'}] ${v.id}: ${v.description}\n    Nodes: ${v.nodes.join(', ')}`
            ).join('\n');
            throw new Error(`[miura] Accessibility violations found:\n${details}`);
        }
    }

    private async _execAssertVariable(step: any): Promise<void> {
        const stored = this._vars.get(step.variable) ?? '';
        const match  = step.op === 'equals'
            ? stored === step.value
            : new RegExp(step.value).test(stored);
        const result = step.negated ? !match : match;
        if (!result) throw new Error(`Variable $${step.variable} expected ${step.negated ? 'not ' : ''}${step.op} "${step.value}" but was "${stored}"`);
    }

    private async _execStore(step: any): Promise<void> {
        const r = this._resolveRef(step.element);
        const captured = step.capture === 'value'
            ? await this._runner.getValue(r.selector)
            : await this._runner.getText(r.selector);
        this._vars.set(step.variable, captured);
    }

    private _resolve(ref: ElementRef | null): ResolutionResult | null {
        if (!ref) return null;
        return this._resolver.resolve(ref);
    }

    private _resolveRef(ref: ElementRef): ResolutionResult {
        return this._resolver.resolve(ref);
    }

    private _stepLabel(step: Step): string {
        const s = step as any;
        switch (step.kind) {
            case 'action': {
                const el = s.element ? ` ${s.element.value}` : '';
                const val = s.value ? ` "${s.value}"` : s.url ? ` "${s.url}"` : s.key ? ` "${s.key}"` : s.ms ? ` ${s.ms}ms` : '';
                return `${s.action}${val}${el}`;
            }
            case 'assert-element': {
                const op = s.assertion.op as string;
                const detail = (() => {
                    const a = s.assertion;
                    if (a.op === 'is-visibility' || a.op === 'is-input-state') return `is ${a.state}`;
                    if (a.op === 'contains')   return `contains "${a.value}"`;
                    if (a.op === 'has-value')  return `has value "${a.value}"`;
                    if (a.op === 'has-text')   return `has text "${a.value}"`;
                    if (a.op === 'has-focus')  return 'has focus';
                    if (a.op === 'has-class')  return `has class "${a.value}"`;
                    if (a.op === 'matches')    return `matches /${a.pattern}/`;
                    if (a.op === 'has-prop')   return `has prop "${a.name}" equals "${a.value}"`;
                    if (a.op === 'has-attr')   return a.value ? `has attr "${a.name}" equals "${a.value}"` : `has attr "${a.name}" is ${a.state}`;
                    if (a.op === 'has-count')  return `has count ${a.count}`;
                    if (a.op === 'is-empty')   return 'is empty';
                    if (a.op === 'has-aria')            return `has aria-${a.name} "${a.value}"`;
                    if (a.op === 'has-role')            return `has role "${a.role}"`;
                    if (a.op === 'has-accessible-name') return `has accessible name "${a.value}"`;
                    if (a.op === 'has-alt')             return `has alt "${a.value}"`;
                    return op;
                })();
                return `check ${s.element.value} ${s.negated ? 'not ' : ''}${detail}`;
            }
            case 'assert-variable':
                return `check $${s.variable} ${s.negated ? 'not ' : ''}${s.op} "${s.value}"`;
            case 'store':
                return `store ${s.element.value} ${s.capture} as $${s.variable}`;
            case 'within':
                return `within ${s.root.value} (${s.steps.length} steps)`;
            case 'load-component':
                return `component ${s.name} is loaded`;
            case 'apply-fixture':
                return `fixture "${s.name}" is applied`;
            case 'register-spy':
                return `register spy "${s.name}"${s.returnValue !== undefined ? ` returning "${s.returnValue}"` : ''}`;
            case 'reset-spy':
                return `reset spy "${s.name}"`;
            case 'take-screenshot':
                return `take screenshot${s.name ? ` "${s.name}"` : ''}`;
            case 'check-a11y':
                return `check ${s.selector ?? 'page'} has no a11y violations`;
            case 'mock-request':
                return `mock ${s.method} "${s.url}"${s.status !== 200 ? ` with status ${s.status}` : ''}${s.delayMs ? ` with delay ${s.delayMs}ms` : ''}${s.body ? ` returning "${s.body}"` : ''}`;
            case 'await-function':
                return `wait for function "${s.name}" ${s.timeoutMs}ms`;
            case 'assert-request': {
                const ra = s.assertion;
                const rdetail = ra.op === 'was-made' ? 'was made'
                    : ra.op === 'was-not-made' ? 'was not made'
                    : ra.op === 'was-made-times' ? `was called ${ra.count} time(s)`
                    : `was called with "${ra.body}"`;
                return `check request "${s.method} ${s.url}" ${rdetail}`;
            }
            case 'assert-spy': {
                const a = s.assertion;
                const detail = (() => {
                    if (a.op === 'was-called')       return 'was called';
                    if (a.op === 'was-not-called')   return 'was not called';
                    if (a.op === 'was-called-times') return `was called ${a.count} time(s)`;
                    if (a.op === 'was-called-with')  return `was called with ${JSON.stringify(a.args)}`;
                    if (a.op === 'last-returned')    return `last returned "${a.value}"`;
                    return a.op;
                })();
                return `check spy "${s.spyName}" ${detail}`;
            }
            default:
                return String((s as any).kind ?? 'unknown step');
        }
    }
}
