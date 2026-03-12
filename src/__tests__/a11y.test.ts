/**
 * Accessibility assertion tests:
 * 1. check X is focusable
 * 2. check X has accessible name "..."
 * 3. check X has alt "..."
 * 4. check page has no a11y violations
 * 5. check <element> has no a11y violations
 */
import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

const MANIFEST = {
    elements: {
        'submit-btn': { name: 'submit-btn', strategy: { type: 'by-ref' as const, value: 'submit-btn' }, aliases: [] },
        'icon-btn':   { name: 'icon-btn',   strategy: { type: 'by-ref' as const, value: 'icon-btn'   }, aliases: [] },
        'logo':       { name: 'logo',       strategy: { type: 'by-ref' as const, value: 'logo'       }, aliases: [] },
        'panel':      { name: 'panel',      strategy: { type: 'by-ref' as const, value: 'panel'      }, aliases: [] },
        'no-label':   { name: 'no-label',   strategy: { type: 'by-ref' as const, value: 'no-label'   }, aliases: [] },
    },
};

const HTML = `<!DOCTYPE html><html><body>
  <button data-xtest="submit-btn" aria-label="Submit form">Submit</button>
  <button data-xtest="icon-btn" aria-labelledby="icon-label" tabindex="0">
    <span id="icon-label">Close dialog</span>
  </button>
  <img data-xtest="logo" alt="Company logo" src="logo.png" />
  <div data-xtest="panel" role="region" aria-label="Main content" tabindex="-1">Content</div>
  <span data-xtest="no-label">Some text</span>
</body></html>`;

// ── 1. Parser — focusable ─────────────────────────────────────────────────────

describe('Parser — is focusable', () => {
    it('parses "is focusable"', () => {
        const src = `suite S\n  scenario "t"\n    check submit-btn is focusable\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('assert-element');
        expect(step.assertion).toMatchObject({ op: 'is-input-state', state: 'focusable' });
    });

    it('parses "not is focusable"', () => {
        const src = `suite S\n  scenario "t"\n    check panel not is focusable\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.negated).toBe(true);
        expect(step.assertion).toMatchObject({ op: 'is-input-state', state: 'focusable' });
    });
});

// ── 2. Parser — accessible name ───────────────────────────────────────────────

describe('Parser — has accessible name', () => {
    it('parses "has accessible name"', () => {
        const src = `suite S\n  scenario "t"\n    check submit-btn has accessible name "Submit form"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion).toMatchObject({ op: 'has-accessible-name', value: 'Submit form' });
    });
});

// ── 3. Parser — has alt ───────────────────────────────────────────────────────

describe('Parser — has alt', () => {
    it('parses "has alt"', () => {
        const src = `suite S\n  scenario "t"\n    check logo has alt "Company logo"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion).toMatchObject({ op: 'has-alt', value: 'Company logo' });
    });
});

// ── 4. Parser — a11y scan ─────────────────────────────────────────────────────

describe('Parser — check page has no a11y violations', () => {
    it('parses page-level a11y check', () => {
        const src = `suite S\n  scenario "t"\n    check page has no a11y violations\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('check-a11y');
        expect(step.selector).toBeUndefined();
    });

    it('parses element-scoped a11y check', () => {
        const src = `suite S\n  scenario "t"\n    check panel has no a11y violations\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('check-a11y');
        expect(step.selector).toBe('panel');
    });
});

// ── 5. Executor — is focusable ────────────────────────────────────────────────

describe('Executor — is focusable', () => {
    it('PASSES for a button (natively focusable)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check submit-btn is focusable`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS for tabindex="-1" element', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check panel is focusable`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });

    it('PASSES negated: panel not is focusable', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check panel not is focusable`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 6. Executor — has accessible name ────────────────────────────────────────

describe('Executor — has accessible name', () => {
    it('PASSES for aria-label', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check submit-btn has accessible name "Submit form"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('PASSES for aria-labelledby', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check icon-btn has accessible name "Close dialog"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS for wrong accessible name', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check submit-btn has accessible name "Wrong name"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });

    it('PASSES for alt text (image)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check logo has accessible name "Company logo"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 7. Executor — has alt ─────────────────────────────────────────────────────

describe('Executor — has alt', () => {
    it('PASSES for matching alt text', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check logo has alt "Company logo"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS for wrong alt text', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check logo has alt "Wrong alt"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

// ── 8. Executor — axe-core a11y scan ─────────────────────────────────────────

describe('Executor — check page has no a11y violations', () => {
    it('PASSES for accessible HTML', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const accessibleHTML = `<!DOCTYPE html><html lang="en"><head><title>Test</title></head><body>
          <main>
            <h1>Page title</h1>
            <button data-xtest="submit-btn" type="button">Submit</button>
          </main>
        </body></html>`;
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check page has no a11y violations`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), accessibleHTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS for HTML with a11y violations (img missing alt)', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const badHTML = `<!DOCTYPE html><html lang="en"><head><title>Test</title></head><body>
          <img data-xtest="logo" src="logo.png" />
        </body></html>`;
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    check page has no a11y violations`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), badHTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});
