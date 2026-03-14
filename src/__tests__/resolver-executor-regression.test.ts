import { describe, it, expect } from 'vitest';
import { Resolver } from '../resolver/resolver.js';
import { defineSurface } from '../manifest/types.js';
import { parseXTest } from '../parser/parser.js';
import { Executor } from '../runner/runner.js';
import { JSDOMRunner } from '../runner/jsdom-runner.js';

const MANIFEST = defineSurface('CTA', {
    'cta-button': {
        strategy: { type: 'by-text', value: 'Join now' },
        aliases:  ['join button', 'primary cta'],
    },
});

const HTML = `<!DOCTYPE html><html><body>
    <button>Other action</button>
    <button>Join now</button>
</body></html>`;

describe('Resolver — by-text strategy regression', () => {
    it('includes needsText for by-text elements', () => {
        const resolver = new Resolver(MANIFEST);
        const result = resolver.resolveByName('cta-button');
        expect(result.selector).toBe('*');
        expect(result.needsText).toBe('Join now');
        expect(result.strategy).toBe('by-text');
    });
});

describe('Executor — contains assertion with by-text manifests', () => {
    it('passes when button with matching text exists even if not first element', async () => {
        const runner = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const src = `suite CTA\n  scenario "happy"\n    check cta-button contains "Join"\n`;
        const result = await executor.runFile(parseXTest(src), HTML);
        await runner.teardown();

        expect(result.passed).toBe(true);
        expect(result.suites[0]?.scenarios[0]?.passed).toBe(true);
    });

    it('fails when the expected text is missing', async () => {
        const runner = new JSDOMRunner();
        const executor = new Executor(runner, MANIFEST);
        const src = `suite CTA\n  scenario "sad"\n    check cta-button contains "Sign up"\n`;
        const result = await executor.runFile(parseXTest(src), HTML);
        await runner.teardown();

        expect(result.passed).toBe(false);
        const scenario = result.suites[0]?.scenarios[0];
        expect(scenario?.passed).toBe(false);
        expect(scenario?.steps[0]?.error).toMatch(/contains "Sign up"/);
    });
});
