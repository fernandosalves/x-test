import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

const HTML = `<!DOCTYPE html><html><body>
  <input data-xtest="username" type="email" value="ada@example.com" required />
  <button data-xtest="submit-button" disabled>Go</button>
  <div data-xtest="panel" id="panel" data-theme="dark" aria-label="Main panel"></div>
  <input data-xtest="checkbox" type="checkbox" checked />
</body></html>`;

const MANIFEST = {
    elements: {
        'username':      { name: 'username',      strategy: { type: 'by-ref' as const, value: 'username'      }, aliases: [] },
        'submit-button': { name: 'submit-button', strategy: { type: 'by-ref' as const, value: 'submit-button' }, aliases: [] },
        'panel':         { name: 'panel',         strategy: { type: 'by-ref' as const, value: 'panel'         }, aliases: [] },
        'checkbox':      { name: 'checkbox',      strategy: { type: 'by-ref' as const, value: 'checkbox'      }, aliases: [] },
    },
};

// ── Parser tests ──────────────────────────────────────────────────────────────

describe('Parser — has prop / has attr', () => {
    it('parses has prop assertion', () => {
        const src = `suite S\n  scenario "t"\n    check username has prop "type" equals "email"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('has-prop');
        expect(step.assertion.name).toBe('type');
        expect(step.assertion.value).toBe('email');
    });

    it('parses has attr equals assertion', () => {
        const src = `suite S\n  scenario "t"\n    check panel has attr "data-theme" equals "dark"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('has-attr');
        expect(step.assertion.name).toBe('data-theme');
        expect(step.assertion.value).toBe('dark');
    });

    it('parses has attr is present', () => {
        const src = `suite S\n  scenario "t"\n    check username has attr "required" is present\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('has-attr');
        expect(step.assertion.name).toBe('required');
        expect(step.assertion.state).toBe('present');
    });

    it('parses has attr is absent', () => {
        const src = `suite S\n  scenario "t"\n    check panel has attr "hidden" is absent\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('has-attr');
        expect(step.assertion.state).toBe('absent');
    });

    it('bare has attr defaults to present check', () => {
        const src = `suite S\n  scenario "t"\n    check username has attr "required"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('has-attr');
        expect(step.assertion.state).toBe('present');
    });

    it('has prop and has attr can be negated', () => {
        const src = `suite S\n  scenario "t"\n    check username not has prop "type" equals "text"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.negated).toBe(true);
        expect(step.assertion.op).toBe('has-prop');
    });
});

// ── JSDOMRunner tests ─────────────────────────────────────────────────────────

describe('JSDOMRunner — getProp / getAttr', () => {
    it('getProp returns element property value', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        const val = await runner.getProp('[data-xtest="username"]', 'type');
        expect(val).toBe('email');
        await runner.teardown();
    });

    it('getAttr returns attribute value', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        const val = await runner.getAttr('[data-xtest="panel"]', 'data-theme');
        expect(val).toBe('dark');
        await runner.teardown();
    });

    it('getAttr returns null for absent attribute', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        const val = await runner.getAttr('[data-xtest="panel"]', 'nonexistent');
        expect(val).toBeNull();
        await runner.teardown();
    });
});

// ── Executor end-to-end tests ─────────────────────────────────────────────────

describe('Executor — prop/attr assertions', () => {
    it('passes when prop matches', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "prop match"\n    check username has prop "type" equals "email"\n`;
        const result = await new Executor(new JSDOMRunner(), MANIFEST)
            .runFile(parseXTest(src), HTML);
        await result; // already resolved
        expect(result.passed).toBe(true);
    });

    it('fails when prop does not match', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "prop mismatch"\n    check username has prop "type" equals "text"\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(result.passed).toBe(false);
    });

    it('passes when attr equals expected value', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "attr match"\n    check panel has attr "data-theme" equals "dark"\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });

    it('passes attr is present check when attr exists', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "attr present"\n    check username has attr "required" is present\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });

    it('passes attr is absent check when attr does not exist', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "attr absent"\n    check panel has attr "hidden" is absent\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });

    it('negation: not has prop passes when value differs', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = `suite S\n  scenario "negated prop"\n    check username not has prop "type" equals "password"\n`;
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const result   = await executor.runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(result.passed).toBe(true);
    });
});
