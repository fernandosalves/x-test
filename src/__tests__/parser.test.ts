import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

describe('Parser', () => {
    it('parses a minimal suite', () => {
        const ast = parseXTest(`suite Login\n  scenario "basic"\n    click submit-button\n`);
        expect(ast.suites).toHaveLength(1);
        expect(ast.suites[0]!.name).toBe('Login');
        expect(ast.suites[0]!.scenarios).toHaveLength(1);
        expect(ast.suites[0]!.scenarios[0]!.description).toBe('basic');
    });

    it('parses a type action', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    type "hello" into username-input\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('action');
        expect(step.action).toBe('type');
        expect(step.value).toBe('hello');
        expect(step.element.value).toBe('username-input');
    });

    it('parses a click action', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    click submit-button\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('click');
        expect(step.element.value).toBe('submit-button');
    });

    it('parses an is-visible assertion', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    check error-message is visible\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('assert-element');
        expect(step.assertion.op).toBe('is-visibility');
        expect(step.assertion.state).toBe('visible');
        expect(step.negated).toBe(false);
    });

    it('parses an is-absent assertion', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    check error-message is absent\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.state).toBe('absent');
    });

    it('parses a contains assertion', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    check error-message contains "Invalid"\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('contains');
        expect(step.assertion.value).toBe('Invalid');
    });

    it('parses a has-value assertion', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    check username-input has value "ada"\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.assertion.op).toBe('has-value');
        expect(step.assertion.value).toBe('ada');
    });

    it('parses a store step', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    store username-input value as $captured\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('store');
        expect(step.capture).toBe('value');
        expect(step.variable).toBe('captured');
    });

    it('parses a variable assertion', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    check $myVar equals "hello"\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('assert-variable');
        expect(step.variable).toBe('myVar');
        expect(step.op).toBe('equals');
        expect(step.value).toBe('hello');
    });

    it('parses a press step', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    press "Enter"\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('press');
        expect(step.key).toBe('Enter');
    });

    it('parses a navigate step', () => {
        const ast = parseXTest(`suite S\n  scenario "t"\n    navigate to "http://localhost"\n`);
        const step = ast.suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.action).toBe('navigate');
        expect(step.url).toBe('http://localhost');
    });

    it('parses setup and teardown blocks', () => {
        const src = `suite S\n  setup\n    navigate to "http://localhost"\n  teardown\n    reload page\n  scenario "t"\n    click btn\n`;
        const ast = parseXTest(src);
        expect(ast.suites[0]!.setup).toHaveLength(1);
        expect(ast.suites[0]!.teardown).toHaveLength(1);
    });

    it('parses multiple scenarios', () => {
        const src = `suite S\n  scenario "first"\n    click a\n  scenario "second"\n    click b\n`;
        const ast = parseXTest(src);
        expect(ast.suites[0]!.scenarios).toHaveLength(2);
    });

    it('parses multiple suites in one file', () => {
        const src = `suite A\n  scenario "t"\n    click x\nsuite B\n  scenario "t"\n    click y\n`;
        const ast = parseXTest(src);
        expect(ast.suites).toHaveLength(2);
    });

    it('attaches source location to suite', () => {
        const ast = parseXTest(`suite Login\n  scenario "t"\n    click x\n`, 'test.xtest');
        expect(ast.suites[0]!.loc.line).toBeGreaterThanOrEqual(1);
        expect(ast.file).toBe('test.xtest');
    });
});
