import { describe, it, expect } from 'vitest';
import { Lexer } from '../parser/lexer.js';

function tokenTypes(source: string): string[] {
    return new Lexer(source).tokenize().map(t => t.type);
}

function tokenValues(source: string): string[] {
    return new Lexer(source).tokenize().map(t => t.value);
}

describe('Lexer', () => {
    it('tokenises a single suite keyword', () => {
        const types = tokenTypes('suite MyLogin\n');
        expect(types).toContain('SUITE');
        expect(types).toContain('IDENT');
    });

    it('tokenises a string literal', () => {
        const tokens = new Lexer('type "hello world" into foo\n').tokenize();
        const str = tokens.find(t => t.type === 'STRING');
        expect(str?.value).toBe('hello world');
    });

    it('tokenises a variable', () => {
        const tokens = new Lexer('check $myVar equals "x"\n').tokenize();
        const v = tokens.find(t => t.type === 'VARIABLE');
        expect(v?.value).toBe('myVar');
    });

    it('emits INDENT and DEDENT for indented block', () => {
        const src = `suite S\n  scenario "x"\n    click btn\n`;
        const types = tokenTypes(src);
        expect(types).toContain('INDENT');
        expect(types).toContain('DEDENT');
    });

    it('recognises all action keywords', () => {
        const keywords = ['type', 'click', 'select', 'clear', 'hover', 'scroll', 'wait', 'navigate', 'reload', 'press', 'store', 'check'];
        for (const kw of keywords) {
            const types = tokenTypes(`${kw} foo\n`);
            expect(types[0]).not.toBe('IDENT');
        }
    });

    it('recognises assertion keywords', () => {
        const src = 'check x is visible\n';
        const types = tokenTypes(src);
        expect(types).toContain('CHECK');
        expect(types).toContain('IS');
        expect(types).toContain('VISIBLE');
    });

    it('ignores comment lines', () => {
        const src = `# this is a comment\nclick btn\n`;
        const types = tokenTypes(src);
        expect(types).not.toContain('COMMENT');
        expect(types).toContain('CLICK');
    });

    it('tokenises a NUMBER', () => {
        const tokens = new Lexer('wait 500 ms\n').tokenize();
        const num = tokens.find(t => t.type === 'NUMBER');
        expect(num?.value).toBe('500');
    });

    it('tracks line numbers', () => {
        const src = `suite A\n  scenario "x"\n`;
        const tokens = new Lexer(src).tokenize();
        const suite = tokens.find(t => t.type === 'SUITE');
        expect(suite?.line).toBe(1);
    });
});
