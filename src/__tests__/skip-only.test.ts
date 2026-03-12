import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

describe('xscenario / only scenario', () => {

    it('xscenario sets skipped=true', () => {
        const ast = parseXTest(`suite S\n  xscenario "skip me"\n    click btn\n`);
        expect(ast.suites[0]!.scenarios[0]!.skipped).toBe(true);
        expect(ast.suites[0]!.scenarios[0]!.focused).toBe(false);
    });

    it('scenario sets skipped=false', () => {
        const ast = parseXTest(`suite S\n  scenario "normal"\n    click btn\n`);
        expect(ast.suites[0]!.scenarios[0]!.skipped).toBe(false);
    });

    it('only scenario sets focused=true', () => {
        const ast = parseXTest(`suite S\n  only scenario "focus me"\n    click btn\n`);
        expect(ast.suites[0]!.scenarios[0]!.focused).toBe(true);
        expect(ast.suites[0]!.scenarios[0]!.skipped).toBe(false);
    });

    it('xsuite sets suite skipped=true', () => {
        const ast = parseXTest(`xsuite SkipAll\n  scenario "inside"\n    click btn\n`);
        expect(ast.suites[0]!.skipped).toBe(true);
    });

    it('only suite sets suite focused=true', () => {
        const ast = parseXTest(`only suite FocusMe\n  scenario "inside"\n    click btn\n`);
        expect(ast.suites[0]!.focused).toBe(true);
    });

    it('mix of normal, skipped, and focused scenarios', () => {
        const src = `suite S\n  scenario "a"\n    click x\n  xscenario "b"\n    click y\n  only scenario "c"\n    click z\n`;
        const ast = parseXTest(src);
        const [a, b, c] = ast.suites[0]!.scenarios;
        expect(a!.skipped).toBe(false);
        expect(a!.focused).toBe(false);
        expect(b!.skipped).toBe(true);
        expect(c!.focused).toBe(true);
    });
});

describe('Runner — skip/only execution', () => {
    it('marks skipped scenarios in result', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');

        const ast = parseXTest(`suite S\n  xscenario "skip this"\n    click btn\n  scenario "run this"\n    check btn is present\n`);
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, { elements: {} });
        const result   = await executor.runFile(ast, `<!DOCTYPE html><html><body><button data-xtest="btn">Go</button></body></html>`);
        await runner.teardown();

        const scenarios = result.suites[0]!.scenarios;
        expect(scenarios[0]!.skipped).toBe(true);
        expect(scenarios[1]!.skipped).toBe(false);
        expect(result.totalSkipped).toBe(1);
        expect(result.total).toBe(1);         // skipped not counted in total
        expect(result.totalPass).toBe(1);
    });

    it('only runs focused scenario when only is used', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');

        const src = `suite S\n  scenario "ignored"\n    check missing-btn is visible\n  only scenario "focused"\n    check btn is present\n`;
        const ast      = parseXTest(src);
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, { elements: {} });
        const result   = await executor.runFile(ast, `<!DOCTYPE html><html><body><button data-xtest="btn">Go</button></body></html>`);
        await runner.teardown();

        const [ignored, focused] = result.suites[0]!.scenarios;
        expect(ignored!.skipped).toBe(true);   // skipped by only-mode
        expect(focused!.skipped).toBe(false);
        expect(focused!.passed).toBe(true);
        expect(result.passed).toBe(true);
        expect(result.totalSkipped).toBe(1);
    });

    it('skipped count in TAP output', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const { formatTAP } = await import('../reporter/tap.js');

        const ast      = parseXTest(`suite S\n  xscenario "skipped"\n    click btn\n  scenario "pass"\n    check btn is present\n`);
        const runner   = new JSDOMRunner();
        const executor = new Executor(runner, { elements: {} });
        const result   = await executor.runFile(ast, `<!DOCTYPE html><html><body><button data-xtest="btn">Go</button></body></html>`);
        await runner.teardown();

        const tap = formatTAP(result);
        expect(tap).toContain('# SKIP');
        expect(tap).toContain('# skipped 1');
    });
});
