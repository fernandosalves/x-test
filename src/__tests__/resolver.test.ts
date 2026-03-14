import { describe, it, expect } from 'vitest';
import { Resolver, ResolutionError } from '../resolver/resolver.js';
import { defineSurface } from '../manifest/types.js';

const manifest = defineSurface('LoginForm', {
    'username-input': {
        strategy: { type: 'by-ref', value: 'username' },
        aliases: ['user name', 'email', 'email address'],
    },
    'password-input': {
        strategy: { type: 'by-type', value: 'password' },
        aliases: ['password', 'pass'],
    },
    'submit-button': {
        strategy: { type: 'by-role', value: 'button', name: 'Sign in' },
        aliases: ['submit', 'login button', 'sign in'],
    },
    'error-message': {
        strategy: { type: 'by-selector', value: '[role=alert]' },
        aliases: ['error', 'error message', 'alert'],
    },
});

describe('Resolver — scoped elements', () => {
    const scopedManifest = defineSurface('UserTable', {
        'row-edit': {
            strategy: { type: 'by-ref', value: 'edit' },
            aliases: [],
            scope: 'row',
        },
    }, {
        scopes: {
            row: { type: 'by-selector', value: 'tr[data-row]' },
        },
    });

    const resolver = new Resolver(scopedManifest);

    it('prefixes selector with scope selector', () => {
        const r = resolver.resolveByName('row-edit');
        expect(r.selector).toBe('tr[data-row] [data-xtest="edit"]');
        expect(r.scopeChain).toEqual(['tr[data-row]']);
    });
});

describe('Resolver', () => {
    const resolver = new Resolver(manifest);

    it('resolves by exact element name', () => {
        const r = resolver.resolveByName('username-input');
        expect(r.confidence).toBe('exact');
        expect(r.selector).toBe('[data-xtest="username"]');
    });

    it('resolves by exact alias', () => {
        const r = resolver.resolveByName('email');
        expect(r.confidence).toBe('alias');
        expect(r.element?.name).toBe('username-input');
    });

    it('resolves by-selector strategy', () => {
        const r = resolver.resolveByName('error-message');
        expect(r.selector).toBe('[role=alert]');
    });

    it('resolves by-type strategy', () => {
        const r = resolver.resolveByName('password-input');
        expect(r.selector).toBe('input[type="password"]');
    });

    it('resolves by-role strategy', () => {
        const r = resolver.resolveByName('submit-button');
        expect(r.selector).toContain('button');
    });

    it('resolves alias with spaces', () => {
        const r = resolver.resolveByName('email address');
        expect(r.element?.name).toBe('username-input');
    });

    it('resolves alias case-insensitively', () => {
        const r = resolver.resolveByName('Error Message');
        expect(r.element?.name).toBe('error-message');
    });

    it('resolves with fuzzy match for close typo', () => {
        const r = resolver.resolveByName('erorr');
        expect(r.confidence).toBe('fuzzy');
        expect(r.warning).toBeDefined();
    });

    it('throws ResolutionError for unknown element with no close match', () => {
        expect(() => resolver.resolveByName('completely-unknown-xyz-abc')).toThrow(ResolutionError);
    });

    it('provides candidates in ResolutionError', () => {
        try {
            resolver.resolveByName('completely-unknown-xyz-abc');
        } catch (e) {
            expect(e).toBeInstanceOf(ResolutionError);
            expect((e as ResolutionError).candidates).toBeDefined();
        }
    });

    it('resolves ElementRef of kind name', () => {
        const r = resolver.resolve({ kind: 'name', value: 'submit-button', loc: { line: 1, column: 1 } });
        expect(r.confidence).toBe('exact');
    });

    it('resolves ElementRef of kind quoted', () => {
        const r = resolver.resolve({ kind: 'quoted', value: 'sign in', loc: { line: 1, column: 1 } });
        expect(r.element?.name).toBe('submit-button');
    });

    it('returns fallback result for variable refs', () => {
        const r = resolver.resolve({ kind: 'variable', value: 'el', loc: { line: 1, column: 1 } });
        expect(r.confidence).toBe('fallback');
    });
});

describe('Resolver — inference mode (empty manifest)', () => {
    const emptyResolver = new Resolver({ elements: {} });

    it('infers selector for password-input name', () => {
        const r = emptyResolver.resolveByName('password-input');
        expect(r.selector).toContain('password');
        expect(r.confidence).toBe('inferred');
    });

    it('infers selector for submit-button name', () => {
        const r = emptyResolver.resolveByName('submit-button');
        expect(r.selector).toContain('button');
    });

    it('infers selector for error-message name', () => {
        const r = emptyResolver.resolveByName('error-message');
        expect(r.selector).toContain('error');
    });
});
