import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

// ── Parser tests ──────────────────────────────────────────────────────────────

describe('Parser — within block', () => {
    it('parses a within block with kind=within', () => {
        const src = `suite S\n  scenario "t"\n    within login-form\n      click submit-button\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('within');
        expect(step.root.value).toBe('login-form');
        expect(step.steps).toHaveLength(1);
        expect(step.steps[0].action).toBe('click');
    });

    describe('Executor — scope filters', () => {
        it('applies attr and text filters from shortcuts', async () => {
            const { Executor } = await import('../runner/runner.js');
            const { JSDOMRunner } = await import('../runner/jsdom-runner.js');

            const src = `suite S\n  scenario "filters"\n    within user-table.row#id(42).cell@contains("Ada")\n      click cell-button\n`;
            const ast = parseXTest(src);
            const runner = new JSDOMRunner();
            const executor = new Executor(runner, {
                elements: {
                    'user-table': {
                        name: 'user-table',
                        strategy: { type: 'by-selector', value: '[data-xtest="user-table"]' },
                        aliases: [],
                    },
                    'cell-button': {
                        name: 'cell-button',
                        strategy: { type: 'by-selector', value: '[data-xtest="cell-button"]' },
                        aliases: [],
                        scope: 'cell',
                    },
                },
                scopes: {
                    row: { name: 'row', strategy: { type: 'by-selector', value: 'tr[data-row]' } },
                    cell: { name: 'cell', strategy: { type: 'by-selector', value: 'td[data-cell]' }, parent: 'row' },
                },
            });
            const result = await executor.runFile(ast, TABLE_HTML);
            await runner.teardown();

            expect(result.passed).toBe(true);
            expect(result.suites[0]!.scenarios[0]!.passed).toBe(true);
        });
    });

    it('parses multiple steps inside within', () => {
        const src = `suite S\n  scenario "t"\n    within login-form\n      type "ada" into username-input\n      click submit-button\n      check error-message is absent\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.steps).toHaveLength(3);
    });

    it('parses within with quoted element ref', () => {
        const src = `suite S\n  scenario "t"\n    within "login form"\n      click submit-button\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.root.kind).toBe('quoted');
        expect(step.root.value).toBe('login form');
    });

    it('within can coexist with steps before and after', () => {
        const src = `suite S\n  scenario "t"\n    click outside-btn\n    within login-form\n      click submit-button\n    check dashboard is visible\n`;
        const steps = parseXTest(src).suites[0]!.scenarios[0]!.steps;
        expect(steps).toHaveLength(3);
        expect(steps[0]!.kind).toBe('action');
        expect(steps[1]!.kind).toBe('within');
        expect(steps[2]!.kind).toBe('assert-element');
    });

    it('parses dot-chained scopes with qualifiers', () => {
        const src = `suite S\n  scenario "t"\n    within user-table.row(2).cell(3)\n      click action-button\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.scopes).toEqual([
            { name: 'row', qualifier: 2 },
            { name: 'cell', qualifier: 3 },
        ]);
    });

    it('parses named filter shortcuts for attr/text', () => {
        const src = `suite S\n  scenario "t"\n    within user-table.row#id(42).cell@text("Ada")\n      click action-button\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.scopes[0]!.filter).toEqual({ target: 'attr', attr: 'id', operator: 'equals', value: '42' });
        expect(step.scopes[1]!.filter).toEqual({ target: 'text', operator: 'equals', value: 'Ada' });
    });
});

// ── Runner tests ──────────────────────────────────────────────────────────────

const FORM_HTML = `<!DOCTYPE html><html><body>
  <div data-xtest="login-form" id="form">
    <input data-xtest="username" type="text" />
    <input data-xtest="password" type="password" />
    <button data-xtest="submit-button" type="submit">Sign in</button>
  </div>
  <div data-xtest="other-section" id="other">
    <button data-xtest="submit-button" id="other-btn">Other submit</button>
  </div>
</body></html>`;

const TABLE_HTML = `<!DOCTYPE html><html><body>
  <table data-xtest="user-table">
    <tr data-row id="41">
      <td data-cell>
        <button data-xtest="cell-button">Edit Bob</button>
        Bob
      </td>
    </tr>
    <tr data-row id="42">
      <td data-cell>
        <button data-xtest="cell-button">Edit Ada</button>
        Ada
      </td>
    </tr>
  </table>
</body></html>`;

describe('JSDOMRunner — pushScope / popScope', () => {
    it('scopes queries to the within element', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(FORM_HTML);

        await runner.pushScope('[data-xtest="login-form"]');
        // Should find the submit-button inside login-form, not the one in other-section
        const el = await runner.isPresent('[data-xtest="submit-button"]');
        expect(el).toBe(true);
        await runner.popScope();

        await runner.teardown();
    });

    it('scope stack unwinds after popScope', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(FORM_HTML);

        await runner.pushScope('[data-xtest="login-form"]');
        await runner.popScope();
        // After pop, document-level query should work again
        const present = await runner.isPresent('[data-xtest="other-section"]');
        expect(present).toBe(true);

        await runner.teardown();
    });

    it('throws when scoped element is absent from the scope root', async () => {
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const runner = new JSDOMRunner();
        await runner.mount(FORM_HTML);

        await runner.pushScope('[data-xtest="login-form"]');
        // other-section does NOT exist inside login-form
        const present = await runner.isPresent('[data-xtest="other-section"]');
        expect(present).toBe(false);
        await runner.popScope();

        await runner.teardown();
    });
});

describe('Executor — within step end-to-end', () => {
    it('runs within block and scopes all nested steps', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');

        const src = `suite S\n  scenario "within"\n    within login-form\n      check username-input is present\n      check submit-button  is present\n`;
        const ast = parseXTest(src);
        const runner = new JSDOMRunner();
        const executor = new Executor(runner, {
            elements: {
                'login-form': { name: 'login-form', strategy: { type: 'by-ref', value: 'login-form' }, aliases: [] },
                'username-input': { name: 'username-input', strategy: { type: 'by-ref', value: 'username' }, aliases: [] },
                'submit-button': { name: 'submit-button', strategy: { type: 'by-ref', value: 'submit-button' }, aliases: [] },
            },
        });
        const result = await executor.runFile(ast, FORM_HTML);
        await runner.teardown();

        expect(result.passed).toBe(true);
        expect(result.suites[0]!.scenarios[0]!.passed).toBe(true);
    });

    it('within step label includes nested step count', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');

        const src = `suite S\n  scenario "label"\n    within login-form\n      check username-input is present\n      click submit-button\n`;
        const ast = parseXTest(src);
        const runner = new JSDOMRunner();
        const executor = new Executor(runner, {
            elements: {
                'login-form': { name: 'login-form', strategy: { type: 'by-ref', value: 'login-form' }, aliases: [] },
                'username-input': { name: 'username-input', strategy: { type: 'by-ref', value: 'username' }, aliases: [] },
                'submit-button': { name: 'submit-button', strategy: { type: 'by-ref', value: 'submit-button' }, aliases: [] },
            },
        });
        const result = await executor.runFile(ast, FORM_HTML);
        await runner.teardown();

        const stepResult = result.suites[0]!.scenarios[0]!.steps[0]!;
        expect(stepResult.step).toContain('within');
        expect(stepResult.step).toContain('2 steps');
    });
});
