/**
 * Miura — Runner interface + execution engine
 *
 * The Runner interface is implemented by each environment adapter (JSDOM, Playwright).
 * The Executor ties together the Parser, Resolver, and Runner to run a full suite.
 */

import type { XTestFile, SuiteNode, ScenarioNode, Step, ActionStep, ElementRef } from '../parser/ast.js';
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
    /** Select an option in a <select> by visible text. */
    select(selector: string, optionText: string): Promise<void>;
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
    passed:    boolean;
    suites:    SuiteResult[];
    total:     number;
    totalPass: number;
    totalFail: number;
    duration:  number;
}

// ── Executor ────────────────────────────────────────────────────────────────────

export class Executor {
    private _runner:   MiuraRunner;
    private _resolver: Resolver;
    private _vars:     Map<string, string> = new Map();

    constructor(runner: MiuraRunner, manifest: SurfaceManifest) {
        this._runner   = runner;
        this._resolver = new Resolver(manifest);
    }

    async runFile(file: XTestFile, html?: string): Promise<RunResult> {
        const start    = Date.now();
        const suites:  SuiteResult[] = [];
        let   total    = 0, pass = 0, fail = 0;

        for (const suite of file.suites) {
            const result = await this._runSuite(suite, html);
            suites.push(result);
            total += result.scenarios.length;
            pass  += result.scenarios.filter(s => s.passed).length;
            fail  += result.scenarios.filter(s => !s.passed).length;
        }

        return {
            passed:    fail === 0,
            suites,
            total,
            totalPass: pass,
            totalFail: fail,
            duration:  Date.now() - start,
        };
    }

    private async _runSuite(suite: SuiteNode, html?: string): Promise<SuiteResult> {
        const start = Date.now();
        if (html) await this._runner.mount(html);

        // Setup
        for (const step of suite.setup) {
            await this._execStep(step);
        }

        const scenarios: ScenarioResult[] = [];
        for (const scenario of suite.scenarios) {
            // Re-mount between scenarios for isolation
            if (html && scenarios.length > 0) await this._runner.mount(html);
            this._vars.clear();
            scenarios.push(await this._runScenario(scenario));
        }

        // Teardown
        for (const step of suite.teardown) {
            try { await this._execStep(step); } catch { /* best effort */ }
        }

        return {
            name:      suite.name,
            passed:    scenarios.every(s => s.passed),
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
                return { description: scenario.description, passed: false, steps, duration: Date.now() - start };
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

    private async _execStep(step: Step): Promise<void> {
        switch (step.kind) {
            case 'action': return this._execAction(step);
            case 'assert-element':  return this._execAssertElement(step);
            case 'assert-variable': return this._execAssertVariable(step);
            case 'store':           return this._execStore(step);
        }
    }

    private async _execAction(step: ActionStep & { kind: 'action' }): Promise<void> {
        const r = this._resolve('element' in step ? (step as any).element : null);

        switch (step.action) {
            case 'type':       return this._runner.type(r!.selector, (step as any).value);
            case 'click':      return this._runner.click(r!.selector);
            case 'double-click': return this._runner.click(r!.selector, { double: true });
            case 'right-click':  return this._runner.click(r!.selector, { right: true });
            case 'select':     return this._runner.select(r!.selector, (step as any).value);
            case 'clear':      return this._runner.clear(r!.selector);
            case 'hover':      return this._runner.hover(r!.selector);
            case 'scroll-to':  return this._runner.scrollTo(r!.selector);
            case 'wait-for':   return this._runner.waitFor(r!.selector);
            case 'wait-ms':    return this._runner.waitMs((step as any).ms);
            case 'navigate':   return this._runner.navigate((step as any).url);
            case 'reload':     return this._runner.reload();
            case 'press':      return this._runner.press((step as any).key);
        }
    }

    private async _execAssertElement(step: any): Promise<void> {
        const r = this._resolveRef(step.element);
        const a = step.assertion;
        const neg = step.negated;

        const check = async (cond: boolean): Promise<void> => {
            const result = neg ? !cond : cond;
            if (!result) throw new Error(`Assertion failed: ${this._stepLabel(step)}`);
        };

        switch (a.op) {
            case 'is-visibility':
                if (a.state === 'visible')  await check(await this._runner.isVisible(r.selector));
                if (a.state === 'hidden')   await check(!await this._runner.isVisible(r.selector));
                if (a.state === 'absent')   await check(!await this._runner.isPresent(r.selector));
                if (a.state === 'present')  await check(await this._runner.isPresent(r.selector));
                break;
            case 'is-input-state':
                if (a.state === 'enabled')   await check(await this._runner.isEnabled(r.selector));
                if (a.state === 'disabled')  await check(!await this._runner.isEnabled(r.selector));
                if (a.state === 'checked')   await check(await this._runner.isChecked(r.selector));
                if (a.state === 'unchecked') await check(!await this._runner.isChecked(r.selector));
                if (a.state === 'focused')   await check(await this._runner.hasFocus(r.selector));
                break;
            case 'contains': {
                const text = await this._runner.getText(r.selector, r.needsText);
                await check(text.toLowerCase().includes((a.value as string).toLowerCase()));
                break;
            }
            case 'has-value': {
                const val = await this._runner.getValue(r.selector);
                await check(val === a.value);
                break;
            }
            case 'has-focus':
                await check(await this._runner.hasFocus(r.selector));
                break;
        }
    }

    private async _execAssertVariable(step: any): Promise<void> {
        const stored = this._vars.get(step.variable) ?? '';
        const match  = step.op === 'equals'
            ? stored === step.value
            : new RegExp(step.value).test(stored);
        if (!match) throw new Error(`Variable $${step.variable} expected ${step.op} "${step.value}" but was "${stored}"`);
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
            case 'assert-element':
                return `check ${s.element.value} ${s.negated ? 'not ' : ''}${JSON.stringify(s.assertion)}`;
            case 'assert-variable':
                return `check $${s.variable} ${s.op} "${s.value}"`;
            case 'store':
                return `store ${s.element.value} ${s.capture} as $${s.variable}`;
        }
    }
}
