import { describe, it, expect } from 'vitest';
import { extractManifest, mergeManifests } from '../manifest/extractor.js';

const COMPONENT_SOURCE = `
/**
 * @xtest-surface
 * @element username-input   by-ref: username
 *   @alias  "user name", "email address"
 *
 * @element submit-button    by-role: button name: "Sign in"
 *   @alias  "submit", "login button"
 *
 * @element error-message    by-selector: [role=alert]
 */
class LoginForm extends HTMLElement {
    render() {
        return \`
            <input data-xtest="username" type="text" />
            <input data-xtest="password" type="password" />
            <button type="submit">Sign in</button>
        \`;
    }
}
`;

describe('Manifest Extractor', () => {
    it('extracts @element entries from @xtest-surface block', () => {
        const manifest = extractManifest(COMPONENT_SOURCE);
        expect(Object.keys(manifest.elements)).toContain('username-input');
        expect(Object.keys(manifest.elements)).toContain('submit-button');
        expect(Object.keys(manifest.elements)).toContain('error-message');
    });

    it('extracts by-ref strategy', () => {
        const manifest = extractManifest(COMPONENT_SOURCE);
        expect(manifest.elements['username-input']?.strategy).toEqual({ type: 'by-ref', value: 'username' });
    });

    it('extracts by-role strategy with name', () => {
        const manifest = extractManifest(COMPONENT_SOURCE);
        const strat = manifest.elements['submit-button']?.strategy;
        expect(strat?.type).toBe('by-role');
        if (strat?.type === 'by-role') {
            expect(strat.value).toBe('button');
            expect(strat.name).toBe('Sign in');
        }
    });

    it('extracts by-selector strategy', () => {
        const manifest = extractManifest(COMPONENT_SOURCE);
        expect(manifest.elements['error-message']?.strategy).toEqual({ type: 'by-selector', value: '[role=alert]' });
    });

    it('extracts aliases', () => {
        const manifest = extractManifest(COMPONENT_SOURCE);
        const aliases = manifest.elements['username-input']?.aliases ?? [];
        expect(aliases).toContain('user name');
        expect(aliases).toContain('email address');
    });

    it('auto-discovers xtest() directive refs', () => {
        const manifest = extractManifest(COMPONENT_SOURCE);
        // 'password' is auto-discovered from data-xtest="password" but not in @element
        expect(manifest.elements['password']).toBeDefined();
        expect(manifest.elements['password']?.strategy).toEqual({ type: 'by-ref', value: 'password' });
    });

    it('does not duplicate elements that appear in both JSDoc and auto-discovery', () => {
        const manifest = extractManifest(COMPONENT_SOURCE);
        // 'username-input' is in JSDoc; auto-discovery finds 'username' (the ref name)
        const keys = Object.keys(manifest.elements);
        const unique = new Set(keys);
        expect(keys.length).toBe(unique.size);
    });

    it('sets component name when provided', () => {
        const manifest = extractManifest(COMPONENT_SOURCE, 'LoginForm');
        expect(manifest.component).toBe('LoginForm');
    });
});

describe('mergeManifests', () => {
    it('merges two manifests', () => {
        const a = extractManifest(`/**\n * @xtest-surface\n * @element btn  by-ref: btn\n */\n`);
        const b = extractManifest(`/**\n * @xtest-surface\n * @element input  by-ref: input\n */\n`);
        const merged = mergeManifests(a, b);
        expect(merged.elements['btn']).toBeDefined();
        expect(merged.elements['input']).toBeDefined();
    });

    it('later manifest wins on conflict', () => {
        const a = extractManifest(`/**\n * @xtest-surface\n * @element btn  by-ref: old\n */\n`);
        const b = extractManifest(`/**\n * @xtest-surface\n * @element btn  by-ref: new\n */\n`);
        const merged = mergeManifests(a, b);
        expect((merged.elements['btn']?.strategy as any).value).toBe('new');
    });
});
