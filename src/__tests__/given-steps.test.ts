/**
 * Tests for:
 *   - focus element action step
 *   - component X is loaded  (given special step)
 *   - fixture "name" is applied  (given special step + fixtures option)
 */
import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

const BASE_HTML = `<!DOCTYPE html><html><body>
  <input data-xtest="username" type="text" />
  <button data-xtest="submit-button">Go</button>
</body></html>`;

const FIXTURE_HTML = `<!DOCTYPE html><html><body>
  <input data-xtest="email-field" type="email" value="fixture@example.com" />
</body></html>`;

const MANIFEST = {
    elements: {
        'username':      { name: 'username',      strategy: { type: 'by-ref' as const, value: 'username'      }, aliases: [] },
        'submit-button': { name: 'submit-button', strategy: { type: 'by-ref' as const, value: 'submit-button' }, aliases: [] },
        'email-field':   { name: 'email-field',   strategy: { type: 'by-ref' as const, value: 'email-field'   }, aliases: [] },
    },
};

// ── Parser tests ──────────────────────────────────────────────────────────────

describe('Parser — focus action', () => {
    it('parses focus step', () => {
        const src = `suite S\n  scenario "t"\n    focus username\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('action');
        expect(step.action).toBe('focus');
        expect(step.element.value).toBe('username');
    });
});

describe('Parser — given special steps', () => {
    it('parses component X is loaded', () => {
        const src = `suite S\n  scenario "t"\n    given\n      component LoginForm is loaded\n    check username is present\n`;
        const ast  = parseXTest(src);
        const step = ast.suites[0]!.scenarios[0]!.given[0] as any;
        expect(step.kind).toBe('load-component');
        expect(step.name).toBe('LoginForm');
    });

    it('parses fixture "name" is applied', () => {
        const src = `suite S\n  scenario "t"\n    given\n      fixture "login-page" is applied\n    check username is present\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.given[0] as any;
        expect(step.kind).toBe('apply-fixture');
        expect(step.name).toBe('login-page');
    });

    it('parses component and regular steps together in given', () => {
        const src = `suite S\n  scenario "t"\n    given\n      component LoginForm is loaded\n      navigate to "http://localhost:3000"\n    check username is present\n`;
        const given = parseXTest(src).suites[0]!.scenarios[0]!.given;
        expect(given).toHaveLength(2);
        expect((given[0] as any).kind).toBe('load-component');
        expect((given[1] as any).kind).toBe('action');
    });
});

// ── Executor tests ────────────────────────────────────────────────────────────

describe('Executor — focus action', () => {
    it('focus moves focus to the element', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    focus username\n    check username has focus\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), BASE_HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });

    it('focus then check is focused — passes', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    focus submit-button\n    check submit-button is focused\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), BASE_HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });
});

describe('Executor — given: component X is loaded', () => {
    it('is a no-op when no matching fixture is registered', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    given\n      component LoginForm is loaded\n    check username is present\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), BASE_HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });

    it('re-mounts with registered fixture HTML', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    given\n      component LoginForm is loaded\n    check email-field is present\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST, {
            fixtures: { LoginForm: FIXTURE_HTML },
        });
        const result   = await executor.runFile(parseXTest(src), BASE_HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });
});

describe('Executor — given: fixture "name" is applied', () => {
    it('mounts the named fixture HTML', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    given\n      fixture "email-page" is applied\n    check email-field is present\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST, {
            fixtures: { 'email-page': FIXTURE_HTML },
        });
        const result   = await executor.runFile(parseXTest(src), BASE_HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });

    it('throws a helpful error when fixture is not registered', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "t"\n    given\n      fixture "unknown" is applied\n    check username is present\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), BASE_HTML);
        await runner.teardown();
        expect(result.passed).toBe(false);
        const err = result.suites[0]!.scenarios[0]!.steps[0]?.error ?? '';
        expect(err).toContain('unknown');
    });
});
