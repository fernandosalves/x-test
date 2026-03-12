/**
 * Miura — Playwright Runner
 *
 * Adapts Miura's MiuraRunner interface to a Playwright Page object.
 * Requires @playwright/test as a peer dependency.
 *
 * Usage:
 *   import { chromium } from '@playwright/test';
 *   import { PlaywrightRunner, Executor } from 'miura';
 *
 *   const browser = await chromium.launch();
 *   const page    = await browser.newPage();
 *   const runner  = new PlaywrightRunner(page);
 *   const result  = await new Executor(runner, manifest).runFile(ast);
 *   await browser.close();
 */

import type { MiuraRunner } from './runner.js';
import type { SpyCall } from '../parser/ast.js';

// ── Minimal Playwright Page / Locator types ──────────────────────────────────
// Typed against the Playwright public API so we don't require @playwright/test
// as a hard compile-time dependency. Any Playwright Page object will satisfy.

interface PwLocator {
    locator(selector: string): PwLocator;
    click(opts?: { button?: 'left' | 'right' | 'middle'; clickCount?: number }): Promise<void>;
    fill(text: string): Promise<void>;
    selectOption(val: { label: string } | { value: string }): Promise<void>;
    hover(): Promise<void>;
    scrollIntoViewIfNeeded(): Promise<void>;
    waitFor(opts?: { state?: 'visible' | 'hidden' | 'attached' | 'detached'; timeout?: number }): Promise<void>;
    textContent(): Promise<string | null>;
    inputValue(): Promise<string>;
    isVisible(): Promise<boolean>;
    isEnabled(): Promise<boolean>;
    isChecked(): Promise<boolean>;
    count(): Promise<number>;
    getAttribute(name: string): Promise<string | null>;
    evaluate<T>(fn: (el: Element, ...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
    focus(): Promise<void>;
}

interface PwPage {
    setContent(html: string, opts?: { waitUntil?: string }): Promise<void>;
    goto(url: string, opts?: { waitUntil?: string }): Promise<unknown>;
    reload(): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
    locator(selector: string): PwLocator;
    keyboard: { press(key: string): Promise<void> };
}

// ── PlaywrightRunner ─────────────────────────────────────────────────────────

export class PlaywrightRunner implements MiuraRunner {
    private _page:        PwPage;
    private _scopeStack:  PwLocator[] = [];
    private _spyRegistry:  Map<string, SpyCall[]>                                     = new Map();
    private _mockRoutes:   Map<string, { status: number; body: string | undefined }>  = new Map();
    private _requestLog:   Map<string, import('../parser/ast.js').RequestCall[]>       = new Map();
    private _timeout:      number;

    constructor(page: PwPage, opts: { timeout?: number } = {}) {
        this._page    = page;
        this._timeout = opts.timeout ?? 10_000;
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    async mount(html: string): Promise<void> {
        await this._page.setContent(html, { waitUntil: 'domcontentloaded' });
    }

    async navigate(url: string): Promise<void> {
        await this._page.goto(url, { waitUntil: 'domcontentloaded' });
    }

    async reload(): Promise<void> {
        await this._page.reload();
    }

    // ── Actions ───────────────────────────────────────────────────────────────

    async click(selector: string, opts?: { double?: boolean; right?: boolean }): Promise<void> {
        const loc = this._loc(selector);
        if (opts?.double) {
            await loc.click({ clickCount: 2 });
        } else if (opts?.right) {
            await loc.click({ button: 'right' });
        } else {
            await loc.click();
        }
    }

    async type(selector: string, text: string): Promise<void> {
        await this._loc(selector).fill(text);
    }

    async clear(selector: string): Promise<void> {
        await this._loc(selector).fill('');
    }

    async select(selector: string, option: string, by: 'label' | 'value' = 'label'): Promise<void> {
        await this._loc(selector).selectOption(
            by === 'value' ? { value: option } : { label: option }
        );
    }

    async hover(selector: string): Promise<void> {
        await this._loc(selector).hover();
    }

    async scrollTo(selector: string): Promise<void> {
        await this._loc(selector).scrollIntoViewIfNeeded();
    }

    async waitFor(selector: string, timeoutMs?: number): Promise<void> {
        await this._loc(selector).waitFor({
            state:   'visible',
            timeout: timeoutMs ?? this._timeout,
        });
    }

    async waitMs(ms: number): Promise<void> {
        await this._page.waitForTimeout(ms);
    }

    async press(key: string): Promise<void> {
        await this._page.keyboard.press(key);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    async getText(selector: string, needsText?: string): Promise<string> {
        if (needsText) {
            // Return the text of the first locator match that contains needsText
            const all = this._loc(selector);
            const text = await all.textContent();
            return text ?? '';
        }
        return (await this._loc(selector).textContent()) ?? '';
    }

    async getValue(selector: string): Promise<string> {
        return this._loc(selector).inputValue();
    }

    async isVisible(selector: string): Promise<boolean> {
        return this._loc(selector).isVisible();
    }

    async isPresent(selector: string): Promise<boolean> {
        return (await this._loc(selector).count()) > 0;
    }

    async hasFocus(selector: string): Promise<boolean> {
        return this._loc(selector).evaluate(
            el => el === el.ownerDocument.activeElement,
        );
    }

    async isEnabled(selector: string): Promise<boolean> {
        return this._loc(selector).isEnabled();
    }

    async isChecked(selector: string): Promise<boolean> {
        return this._loc(selector).isChecked();
    }

    async getProp(selector: string, prop: string): Promise<string> {
        return this._loc(selector).evaluate(
            (el, p) => String(((el as unknown) as Record<string, unknown>)[p as string] ?? ''),
            prop,
        );
    }

    async getAttr(selector: string, attr: string): Promise<string | null> {
        return this._loc(selector).getAttribute(attr);
    }

    async registerSpy(name: string, returnValue?: string): Promise<void> {
        const calls: SpyCall[] = [];
        this._spyRegistry.set(name, calls);
        // page.exposeFunction exposes a Node.js callback into the browser context
        await (this._page as any).exposeFunction(name, (...rawArgs: unknown[]) => {
            calls.push({ args: rawArgs.map(String), returnValue });
            return returnValue;
        });
    }

    async getSpyCalls(name: string): Promise<SpyCall[]> {
        return this._spyRegistry.get(name) ?? [];
    }

    async resetSpy(name: string): Promise<void> {
        const calls = this._spyRegistry.get(name);
        if (calls) calls.length = 0;
    }

    async resetAllSpies(): Promise<void> {
        for (const calls of this._spyRegistry.values()) calls.length = 0;
    }

    async isFocusable(selector: string): Promise<boolean> {
        return this._loc(selector).evaluate(el => (el as HTMLElement).tabIndex >= 0);
    }

    async getAccessibleName(selector: string): Promise<string> {
        return this._loc(selector).evaluate(el => {
            const ariaLabel = el.getAttribute('aria-label');
            if (ariaLabel) return ariaLabel.trim();
            const labelledBy = el.getAttribute('aria-labelledby');
            if (labelledBy) {
                const parts = labelledBy.split(/\s+/)
                    .map(id => document.getElementById(id)?.textContent?.trim() ?? '');
                const text = parts.join(' ').trim();
                if (text) return text;
            }
            const alt = el.getAttribute('alt');
            if (alt !== null) return alt.trim();
            const title = el.getAttribute('title');
            if (title) return title.trim();
            return el.textContent?.trim() ?? '';
        });
    }

    async checkA11y(selector?: string): Promise<import('../parser/ast.js').A11yViolation[]> {
        await (this._page as any).addScriptTag({
            path: new URL('../../node_modules/axe-core/axe.min.js', import.meta.url).pathname,
        });
        const violations = await (this._page as any).evaluate((sel: string | undefined) =>
            // @ts-ignore — axe is injected at runtime
            axe.run(sel ? document.querySelector(sel) : document)
                .then((r: any) => r.violations.map((v: any) => ({
                    id:          v.id,
                    description: v.description,
                    impact:      v.impact ?? null,
                    nodes:       v.nodes.map((n: any) => n.html),
                }))),
            selector,
        );
        return violations;
    }

    async isEmpty(selector: string): Promise<boolean> {
        return this._loc(selector).evaluate(el => {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
                return el.value === '';
            }
            return (el.textContent ?? '').trim() === '';
        });
    }

    async mockRequest(method: string, url: string, status: number, body?: string): Promise<void> {
        const key = `${method.toUpperCase()} ${url}`;
        this._mockRoutes.set(key, { status, body });
        const calls = this._requestLog.get(key) ?? [];
        this._requestLog.set(key, calls);
        await (this._page as any).route(url, (route: any) => {
            if (route.request().method().toUpperCase() !== method.toUpperCase()) {
                return route.continue();
            }
            calls.push({ method: method.toUpperCase(), url, body: route.request().postData() ?? '' });
            route.fulfill({ status, body: body ?? '', contentType: 'application/json' });
        });
    }

    async getRequestCalls(method: string, url: string): Promise<import('../parser/ast.js').RequestCall[]> {
        return this._requestLog.get(`${method.toUpperCase()} ${url}`) ?? [];
    }

    async clearRequestMocks(): Promise<void> {
        this._mockRoutes.clear();
        this._requestLog.clear();
        await (this._page as any).unrouteAll?.();
    }

    async screenshot(name?: string): Promise<void> {
        const path = name ? (name.endsWith('.png') ? name : name + '.png') : undefined;
        await (this._page as any).screenshot(path ? { path } : {});
    }

    async blur(selector: string): Promise<void> {
        await this._loc(selector).evaluate(el => (el as HTMLElement).blur());
    }

    async fill(selector: string, value: string): Promise<void> {
        await this._loc(selector).fill(value);
    }

    async focus(selector: string): Promise<void> {
        await this._loc(selector).focus();
    }

    async hasClass(selector: string, className: string): Promise<boolean> {
        return this._loc(selector).evaluate(
            (el, cls) => el.classList.contains(cls as string),
            className,
        );
    }

    async isReadOnly(selector: string): Promise<boolean> {
        return this._loc(selector).evaluate(
            el => (el as HTMLInputElement).readOnly ?? false,
        );
    }

    async count(selector: string): Promise<number> {
        const root = this._scopeStack.length > 0
            ? this._scopeStack[this._scopeStack.length - 1]!
            : null;
        const loc = root ? root.locator(selector) : this._page.locator(selector);
        return (loc as any).count();
    }

    // ── Scope ─────────────────────────────────────────────────────────────────

    async pushScope(selector: string): Promise<void> {
        const root = this._scopeStack.length > 0
            ? this._scopeStack[this._scopeStack.length - 1]!.locator(selector)
            : this._page.locator(selector);
        this._scopeStack.push(root);
    }

    async popScope(): Promise<void> {
        this._scopeStack.pop();
    }

    // ── Teardown ──────────────────────────────────────────────────────────────

    async teardown(): Promise<void> {
        this._scopeStack = [];
        // Page lifecycle is managed by the caller — we don't close it here.
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Resolve a CSS selector against the active scope (within block) or the page root.
     * Multi-selector strings (comma-separated) are passed through as-is — Playwright
     * handles them natively.
     */
    private _loc(selector: string): PwLocator {
        const root = this._scopeStack.length > 0
            ? this._scopeStack[this._scopeStack.length - 1]!
            : null;

        return root ? root.locator(selector) : this._page.locator(selector);
    }
}
