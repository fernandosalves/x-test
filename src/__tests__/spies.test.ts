/**
 * Tests for spy assertions:
 *   - register spy "name" [returning "value"]
 *   - check spy "name" was called
 *   - check spy "name" was not called
 *   - check spy "name" was called once
 *   - check spy "name" was called N times
 *   - check spy "name" was called with "arg"
 *   - check spy "name" last returned "value"
 */
import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

const HTML = `<!DOCTYPE html><html><body>
  <button data-xtest="submit-button" onclick="onSubmit('ada@example.com')">Submit</button>
  <button data-xtest="cancel-button" onclick="onCancel()">Cancel</button>
  <button data-xtest="multi-button"  onclick="onMulti('a'); onMulti('b')">Multi</button>
</body></html>`;

const MANIFEST = {
    elements: {
        'submit-button': { name: 'submit-button', strategy: { type: 'by-ref' as const, value: 'submit-button' }, aliases: [] },
        'cancel-button': { name: 'cancel-button', strategy: { type: 'by-ref' as const, value: 'cancel-button' }, aliases: [] },
        'multi-button':  { name: 'multi-button',  strategy: { type: 'by-ref' as const, value: 'multi-button'  }, aliases: [] },
    },
};

// ── Parser ────────────────────────────────────────────────────────────────────

describe('Parser — register spy', () => {
    it('parses register spy "name"', () => {
        const src = `suite S\n  scenario "t"\n    register spy "onSubmit"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('register-spy');
        expect(step.name).toBe('onSubmit');
        expect(step.returnValue).toBeUndefined();
    });

    it('parses register spy "name" returning "value"', () => {
        const src = `suite S\n  scenario "t"\n    register spy "onSubmit" returning "success"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('register-spy');
        expect(step.name).toBe('onSubmit');
        expect(step.returnValue).toBe('success');
    });
});

describe('Parser — check spy assertions', () => {
    const parse = (assertion: string) => {
        const src = `suite S\n  scenario "t"\n    check spy "fn" ${assertion}\n`;
        return (parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any).assertion;
    };

    it('was called', () => expect(parse('was called')).toMatchObject({ op: 'was-called' }));
    it('was not called', () => expect(parse('was not called')).toMatchObject({ op: 'was-not-called' }));
    it('was never called', () => expect(parse('was never called')).toMatchObject({ op: 'was-not-called' }));
    it('was called once', () => expect(parse('was called once')).toMatchObject({ op: 'was-called-times', count: 1 }));
    it('was called 3 times', () => expect(parse('was called 3 times')).toMatchObject({ op: 'was-called-times', count: 3 }));
    it('was called with "arg"', () => expect(parse('was called with "hello"')).toMatchObject({ op: 'was-called-with', args: ['hello'] }));
    it('was called with two args', () => expect(parse('was called with "a" "b"')).toMatchObject({ op: 'was-called-with', args: ['a', 'b'] }));
    it('last returned', () => expect(parse('last returned "success"')).toMatchObject({ op: 'last-returned', value: 'success' }));
});

// ── JSDOMRunner spy registry ──────────────────────────────────────────────────

describe('JSDOMRunner — spy registry', () => {
    it('registerSpy attaches function to window', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        await runner.registerSpy('testFn');
        // Spy starts with no calls
        expect(await runner.getSpyCalls('testFn')).toHaveLength(0);
        await runner.teardown();
    });

    it('resetAllSpies clears call records', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(HTML);
        await runner.registerSpy('onSubmit');
        // simulate a call by re-clicking after spy is registered
        await runner.click('[data-xtest="submit-button"]');
        const callsBefore = await runner.getSpyCalls('onSubmit');
        expect(callsBefore.length).toBeGreaterThan(0);
        await runner.resetAllSpies();
        expect(await runner.getSpyCalls('onSubmit')).toHaveLength(0);
        await runner.teardown();
    });
});

// ── Executor end-to-end ───────────────────────────────────────────────────────

describe('Executor — spy was called', () => {
    it('PASSES when spy was called after click', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit"`,
            `    click submit-button`,
            `    check spy "onSubmit" was called`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when spy was NOT called', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit"`,
            `    check spy "onSubmit" was called`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — spy was not called', () => {
    it('PASSES when spy was never called', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onCancel"`,
            `    check spy "onCancel" was not called`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when spy was called (not-called assertion)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onCancel"`,
            `    click cancel-button`,
            `    check spy "onCancel" was not called`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — spy was called N times', () => {
    it('was called once', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit"`,
            `    click submit-button`,
            `    check spy "onSubmit" was called once`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('was called 2 times (fail — only called once)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit"`,
            `    click submit-button`,
            `    check spy "onSubmit" was called 2 times`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
        const err = r.suites[0]!.scenarios[0]!.steps[2]!.error ?? '';
        expect(err).toContain('1');
    });
});

describe('Executor — spy was called with', () => {
    it('PASSES when called with expected arg', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit"`,
            `    click submit-button`,
            `    check spy "onSubmit" was called with "ada@example.com"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when called with wrong arg', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit"`,
            `    click submit-button`,
            `    check spy "onSubmit" was called with "wrong@example.com"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — spy last returned', () => {
    it('PASSES when spy returns the expected value', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit" returning "success"`,
            `    click submit-button`,
            `    check spy "onSubmit" last returned "success"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when spy returns a different value', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    register spy "onSubmit" returning "success"`,
            `    click submit-button`,
            `    check spy "onSubmit" last returned "failure"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — spy isolation between scenarios', () => {
    it('spy call count resets to 0 between scenarios', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "first"`,
            `    register spy "onSubmit"`,
            `    click submit-button`,
            `    check spy "onSubmit" was called once`,
            `  scenario "second"`,
            `    register spy "onSubmit"`,
            `    check spy "onSubmit" was not called`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});
