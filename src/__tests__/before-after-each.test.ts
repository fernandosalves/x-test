import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

const HTML = `<!DOCTYPE html><html><body>
  <input data-xtest="username" type="text" />
  <button data-xtest="submit-button">Go</button>
  <div data-xtest="result" id="result"></div>
</body></html>`;

// ── Parser tests ──────────────────────────────────────────────────────────────

describe('Parser — beforeEach / afterEach', () => {
    it('parses beforeEach block (camelCase)', () => {
        const src = `suite S\n  beforeEach\n    click submit-button\n  scenario "t"\n    click submit-button\n`;
        const suite = parseXTest(src).suites[0]!;
        expect(suite.beforeEach).toHaveLength(1);
        expect((suite.beforeEach[0] as any).action).toBe('click');
    });

    it('parses afterEach block (camelCase)', () => {
        const src = `suite S\n  afterEach\n    reload page\n  scenario "t"\n    click submit-button\n`;
        const suite = parseXTest(src).suites[0]!;
        expect(suite.afterEach).toHaveLength(1);
        expect((suite.afterEach[0] as any).action).toBe('reload');
    });

    it('parses before-each (kebab-case)', () => {
        const src = `suite S\n  before-each\n    click submit-button\n  scenario "t"\n    click submit-button\n`;
        const suite = parseXTest(src).suites[0]!;
        expect(suite.beforeEach).toHaveLength(1);
    });

    it('parses after-each (kebab-case)', () => {
        const src = `suite S\n  after-each\n    click submit-button\n  scenario "t"\n    click submit-button\n`;
        const suite = parseXTest(src).suites[0]!;
        expect(suite.afterEach).toHaveLength(1);
    });

    it('defaults to empty arrays when omitted', () => {
        const src = `suite S\n  scenario "t"\n    click submit-button\n`;
        const suite = parseXTest(src).suites[0]!;
        expect(suite.beforeEach).toHaveLength(0);
        expect(suite.afterEach).toHaveLength(0);
    });

    it('parses multiple steps inside beforeEach', () => {
        const src = `suite S\n  beforeEach\n    type "ada" into username\n    click submit-button\n  scenario "t"\n    click submit-button\n`;
        const suite = parseXTest(src).suites[0]!;
        expect(suite.beforeEach).toHaveLength(2);
    });

    it('can have both beforeEach and afterEach', () => {
        const src = `suite S\n  beforeEach\n    click submit-button\n  afterEach\n    reload page\n  scenario "t"\n    click submit-button\n`;
        const suite = parseXTest(src).suites[0]!;
        expect(suite.beforeEach).toHaveLength(1);
        expect(suite.afterEach).toHaveLength(1);
    });

    it('beforeEach coexists with setup/teardown', () => {
        const src = `suite S\n  setup\n    navigate to "http://localhost"\n  beforeEach\n    click submit-button\n  teardown\n    reload page\n  scenario "t"\n    click submit-button\n`;
        const suite = parseXTest(src).suites[0]!;
        expect(suite.setup).toHaveLength(1);
        expect(suite.beforeEach).toHaveLength(1);
        expect(suite.teardown).toHaveLength(1);
    });
});

// ── Executor tests ────────────────────────────────────────────────────────────

describe('Executor — beforeEach / afterEach hooks', () => {
    it('beforeEach runs before each scenario', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');

        const src = `suite S\n  beforeEach\n    type "seeded" into username\n  scenario "first"\n    check username has value "seeded"\n  scenario "second"\n    check username has value "seeded"\n`;
        const ast      = parseXTest(src);
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, {
            elements: {
                username: { name: 'username', strategy: { type: 'by-ref', value: 'username' }, aliases: [] },
            },
        });
        const result = await executor.runFile(ast, HTML);
        await runner.teardown();

        expect(result.suites[0]!.scenarios[0]!.passed).toBe(true);
        expect(result.suites[0]!.scenarios[1]!.passed).toBe(true);
        expect(result.passed).toBe(true);
    });

    it('afterEach runs after each scenario even on failure', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');

        const callLog: string[] = [];

        // Use a custom runner to spy on reload calls
        const { JSDOMRunner: Base } = await import('../runner/jsdom-runner.js');
        class SpyRunner extends Base {
            override async reload(): Promise<void> {
                callLog.push('reload');
            }
        }

        const src = `suite S\n  afterEach\n    reload page\n  scenario "fail"\n    check nonexistent is visible\n  scenario "pass"\n    check submit-button is present\n`;
        const ast      = parseXTest(src);
        const runner   = new SpyRunner();
        const executor = new Executor(runner, { elements: {} });
        const result   = await executor.runFile(ast, HTML);
        await runner.teardown();

        // afterEach should have run twice (once per scenario including the failing one)
        expect(callLog.length).toBe(2);
        // Suite should still report the failure
        expect(result.suites[0]!.scenarios[0]!.passed).toBe(false);
        expect(result.suites[0]!.scenarios[1]!.passed).toBe(true);
    });

    it('skipped scenarios do NOT trigger beforeEach/afterEach', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');

        const callLog: string[] = [];
        class SpyRunner extends JSDOMRunner {
            override async reload(): Promise<void> { callLog.push('reload'); }
        }

        const src = `suite S\n  afterEach\n    reload page\n  xscenario "skipped"\n    click submit-button\n  scenario "run"\n    check submit-button is present\n`;
        const ast      = parseXTest(src);
        const runner   = new SpyRunner();
        const executor = new Executor(runner, { elements: {} });
        await executor.runFile(ast, HTML);
        await runner.teardown();

        expect(callLog.length).toBe(1); // only for the non-skipped scenario
    });
});
