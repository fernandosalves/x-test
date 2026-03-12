/**
 * Regression tests for previously missing / silently-failing features:
 *   - has-class assertion (was silently passing — BUG)
 *   - matches assertion  (was silently passing — BUG)
 *   - readonly state     (was silently passing — BUG)
 *   - has-count assertion (new)
 *   - wait-for timeout   (new)
 *   - better error messages (actual vs expected)
 */
import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

const HTML = `<!DOCTYPE html><html><body>
  <input data-xtest="username" type="email" class="form-control highlight" value="ada@example.com" />
  <input data-xtest="notes"    type="text"  readonly />
  <button data-xtest="submit-button" class="btn btn-primary">Go</button>
  <ul data-xtest="list">
    <li data-xtest="list-item">One</li>
    <li data-xtest="list-item">Two</li>
    <li data-xtest="list-item">Three</li>
  </ul>
  <h1 data-xtest="title">Welcome Ada</h1>
</body></html>`;

const MANIFEST = {
    elements: {
        'username':      { name: 'username',      strategy: { type: 'by-ref' as const, value: 'username'      }, aliases: [] },
        'notes':         { name: 'notes',         strategy: { type: 'by-ref' as const, value: 'notes'         }, aliases: [] },
        'submit-button': { name: 'submit-button', strategy: { type: 'by-ref' as const, value: 'submit-button' }, aliases: [] },
        'list':          { name: 'list',          strategy: { type: 'by-ref' as const, value: 'list'          }, aliases: [] },
        'list-item':     { name: 'list-item',     strategy: { type: 'by-ref' as const, value: 'list-item'     }, aliases: [] },
        'title':         { name: 'title',         strategy: { type: 'by-ref' as const, value: 'title'         }, aliases: [] },
    },
};

// ── Parser tests ──────────────────────────────────────────────────────────────

describe('Parser — new assertions', () => {
    it('parses has count', () => {
        const src = `suite S\n  scenario "t"\n    check list-item has count 3\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('has-count');
        expect(step.assertion.count).toBe(3);
    });

    it('parses wait for with timeout', () => {
        const src = `suite S\n  scenario "t"\n    wait for submit-button 3000 ms\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('wait-for');
        expect(step.timeoutMs).toBe(3000);
    });

    it('parses wait for without timeout (default)', () => {
        const src = `suite S\n  scenario "t"\n    wait for submit-button\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('wait-for');
        expect(step.timeoutMs).toBeUndefined();
    });

    it('has-class is in the parsed assertion op', () => {
        const src = `suite S\n  scenario "t"\n    check username has class "highlight"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('has-class');
        expect(step.assertion.value).toBe('highlight');
    });

    it('matches is in the parsed assertion op', () => {
        const src = `suite S\n  scenario "t"\n    check title matches "^Welcome"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('matches');
        expect(step.assertion.pattern).toBe('^Welcome');
    });

    it('readonly state parses to is-input-state: readonly', () => {
        const src = `suite S\n  scenario "t"\n    check notes is readonly\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('is-input-state');
        expect(step.assertion.state).toBe('readonly');
    });
});

// ── JSDOMRunner unit tests ────────────────────────────────────────────────────

describe('JSDOMRunner — hasClass / isReadOnly / count', () => {
    it('hasClass returns true for present class', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        expect(await runner.hasClass('[data-xtest="username"]', 'highlight')).toBe(true);
        await runner.teardown();
    });

    it('hasClass returns false for absent class', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        expect(await runner.hasClass('[data-xtest="username"]', 'nonexistent')).toBe(false);
        await runner.teardown();
    });

    it('isReadOnly returns true for readonly input', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        expect(await runner.isReadOnly('[data-xtest="notes"]')).toBe(true);
        await runner.teardown();
    });

    it('isReadOnly returns false for normal input', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        expect(await runner.isReadOnly('[data-xtest="username"]')).toBe(false);
        await runner.teardown();
    });

    it('count returns the number of matching elements', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        expect(await runner.count('[data-xtest="list-item"]')).toBe(3);
        await runner.teardown();
    });

    it('count returns 0 for no matches', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        expect(await runner.count('[data-xtest="nonexistent"]')).toBe(0);
        await runner.teardown();
    });
});

// ── Executor end-to-end tests (regression for previously silent bugs) ─────────

describe('Executor — has-class assertion', () => {
    it('PASSES when element has the class', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check username has class "highlight"\n`;
        const r = await new Executor(new JSDOMRunner(), MANIFEST).runFile(parseXTest(src), HTML);
        expect(r.passed).toBe(true);
    });

    it('FAILS when element does not have the class (was silently passing before)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check username has class "missing-class"\n`;
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — matches assertion', () => {
    it('PASSES when text matches the regex', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check title matches "Welcome"\n`;
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when text does not match (was silently passing before)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check title matches "^Goodbye"\n`;
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — readonly state', () => {
    it('PASSES when input is readonly', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check notes is readonly\n`;
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when input is not readonly (was silently passing before)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check username is readonly\n`;
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — has-count assertion', () => {
    it('PASSES when count matches', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check list-item has count 3\n`;
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when count does not match', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check list-item has count 5\n`;
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });

    it('negation: not has count passes when count differs', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check list-item not has count 5\n`;
        const runner   = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('error message contains actual count', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check list-item has count 5\n`;
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        const err = r.suites[0]!.scenarios[0]!.steps[0]!.error;
        expect(err).toContain('5');   // expected
        expect(err).toContain('3');   // actual
    });
});

describe('Executor — has-text assertion', () => {
    it('PASSES when text matches exactly (trimmed)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check title has text "Welcome Ada"\n`;
        const runner   = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when text is a partial match (unlike contains)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check title has text "Welcome"\n`;
        const runner   = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });

    it('error message shows actual text', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    check title has text "wrong text"\n`;
        const runner   = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        const err = r.suites[0]!.scenarios[0]!.steps[0]!.error ?? '';
        expect(err).toContain('Welcome Ada');
    });
});
