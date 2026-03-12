/**
 * Tests for the 8 new features:
 * 1. select value "v" in element
 * 2. blur element action
 * 3. fill "text" into element
 * 4. reset spy "name" step
 * 5. check X is empty
 * 6. check $var not equals / not matches
 * 7. check X has aria "label" "val" / has role "button"
 * 8. take screenshot
 */
import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

const MANIFEST = {
    elements: {
        'my-select':  { name: 'my-select',  strategy: { type: 'by-ref' as const, value: 'my-select'  }, aliases: [] },
        'my-input':   { name: 'my-input',   strategy: { type: 'by-ref' as const, value: 'my-input'   }, aliases: [] },
        'submit-btn': { name: 'submit-btn', strategy: { type: 'by-ref' as const, value: 'submit-btn' }, aliases: [] },
        'my-div':     { name: 'my-div',     strategy: { type: 'by-ref' as const, value: 'my-div'     }, aliases: [] },
    },
};

const HTML = `<!DOCTYPE html><html><body>
  <select data-xtest="my-select">
    <option value="v1">Option A</option>
    <option value="v2">Option B</option>
    <option value="v3">Option C</option>
  </select>
  <input data-xtest="my-input" type="text" value="" />
  <button data-xtest="submit-btn" role="button" aria-label="Submit form">Submit</button>
  <div data-xtest="my-div" role="region" aria-label="content area">Hello</div>
</body></html>`;

// ── 1. Parser — select value / blur / fill / reset-spy / take-screenshot ──────

describe('Parser — new action steps', () => {
    it('select value parses with by=value', () => {
        const src = `suite S\n  scenario "t"\n    select value "v1" in my-select\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('select');
        expect(step.by).toBe('value');
        expect(step.value).toBe('v1');
    });

    it('select label (default) parses with by=label', () => {
        const src = `suite S\n  scenario "t"\n    select "Option A" in my-select\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('select');
        expect(step.by).toBe('label');
    });

    it('blur parses correctly', () => {
        const src = `suite S\n  scenario "t"\n    blur my-input\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('blur');
        expect(step.element.value).toBe('my-input');
    });

    it('fill parses correctly', () => {
        const src = `suite S\n  scenario "t"\n    fill "hello" into my-input\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('fill');
        expect(step.value).toBe('hello');
    });

    it('take screenshot without name', () => {
        const src = `suite S\n  scenario "t"\n    take screenshot\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('take-screenshot');
        expect(step.name).toBeUndefined();
    });

    it('take screenshot with name', () => {
        const src = `suite S\n  scenario "t"\n    take screenshot "login-form"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('take-screenshot');
        expect(step.name).toBe('login-form');
    });

    it('reset spy parses correctly', () => {
        const src = `suite S\n  scenario "t"\n    reset spy "onSubmit"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('reset-spy');
        expect(step.name).toBe('onSubmit');
    });
});

// ── 2. Parser — new assertions ────────────────────────────────────────────────

describe('Parser — new assertions', () => {
    const parseAssertion = (assertionText: string) => {
        const src = `suite S\n  scenario "t"\n    check my-input ${assertionText}\n`;
        return (parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any).assertion;
    };

    it('is empty', () => expect(parseAssertion('is empty')).toMatchObject({ op: 'is-empty' }));

    it('has aria "label" "val"', () =>
        expect(parseAssertion('has aria "label" "Submit"')).toMatchObject({ op: 'has-aria', name: 'label', value: 'Submit' }));

    it('has role "button"', () =>
        expect(parseAssertion('has role "button"')).toMatchObject({ op: 'has-role', role: 'button' }));

    it('check $var not equals "x"', () => {
        const src = `suite S\n  scenario "t"\n    check $name not equals "wrong"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('assert-variable');
        expect(step.negated).toBe(true);
        expect(step.op).toBe('equals');
        expect(step.value).toBe('wrong');
    });

    it('check $var not matches "pattern"', () => {
        const src = `suite S\n  scenario "t"\n    check $name not matches "^error"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.negated).toBe(true);
        expect(step.op).toBe('matches');
    });
});

// ── 3. Executor — select by value ─────────────────────────────────────────────

describe('Executor — select value "v" in element', () => {
    it('selects by value attribute', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    select value "v2" in my-select`,
            `    check my-select has value "v2"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('still selects by label (default)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    select "Option C" in my-select`,
            `    check my-select has value "v3"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 4. Executor — blur ────────────────────────────────────────────────────────

describe('Executor — blur element', () => {
    it('blur removes focus from element', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    focus my-input`,
            `    check my-input has focus`,
            `    blur my-input`,
            `    check my-input not has focus`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 5. Executor — fill ────────────────────────────────────────────────────────

describe('Executor — fill "text" into element', () => {
    it('fills an empty input', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    fill "hello world" into my-input`,
            `    check my-input has value "hello world"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('fill replaces existing content (unlike type)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    type "initial" into my-input`,
            `    fill "replaced" into my-input`,
            `    check my-input has value "replaced"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 6. Executor — is empty ────────────────────────────────────────────────────

describe('Executor — check X is empty', () => {
    it('PASSES for an empty input', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check my-input is empty`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS after typing into the input', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    type "hello" into my-input`,
            `    check my-input is empty`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });

    it('PASSES negated (not is empty) after typing', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    type "hello" into my-input`,
            `    check my-input not is empty`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 7. Executor — check $var not equals ──────────────────────────────────────

describe('Executor — check $var not equals/matches', () => {
    const HTML_STORE = `<!DOCTYPE html><html><body>
      <input data-xtest="my-input" value="hello world" />
    </body></html>`;

    it('PASSES when stored value does not equal the expected string', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    store my-input value as $v`,
            `    check $v not equals "goodbye"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML_STORE);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when stored value DOES equal the (negated) expected string', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    store my-input value as $v`,
            `    check $v not equals "hello world"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML_STORE);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });

    it('PASSES not matches when pattern does not match', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    store my-input value as $v`,
            `    check $v not matches "^error"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML_STORE);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 8. Executor — has aria / has role ─────────────────────────────────────────

describe('Executor — has aria / has role', () => {
    it('PASSES check submit-btn has aria "label" "Submit form"', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check submit-btn has aria "label" "Submit form"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when aria-label does not match', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check submit-btn has aria "label" "Wrong label"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });

    it('PASSES check submit-btn has role "button"', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check submit-btn has role "button"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS has role with wrong role', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check submit-btn has role "link"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

// ── 9. Executor — reset spy mid-scenario ──────────────────────────────────────

describe('Executor — reset spy "name"', () => {
    const SPY_HTML = `<!DOCTYPE html><html><body>
      <button data-xtest="submit-btn" onclick="onSubmit()">Submit</button>
    </body></html>`;

    it('resets call count mid-scenario', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit"`,
            `    click submit-btn`,
            `    check spy "onSubmit" was called once`,
            `    reset spy "onSubmit"`,
            `    check spy "onSubmit" was not called`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), SPY_HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 10. Executor — take screenshot (no-op in JSDOM) ──────────────────────────

describe('Executor — take screenshot', () => {
    it('does not throw in JSDOM (no-op)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    take screenshot "login"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('take screenshot without name also passes', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    take screenshot`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});
