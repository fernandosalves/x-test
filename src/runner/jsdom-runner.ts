/**
 * xtest — JSDOM Runner
 *
 * Executes test steps against a JSDOM environment. No browser process required.
 * Fast and deterministic — ideal for unit-testing components in CI.
 */

import { JSDOM } from 'jsdom';
import type { xtestRunner, } from './runner.js';
import type { SpyCall, ScopeFilter } from '../parser/ast.js';

export class JSDOMRunner implements xtestRunner {
    private _dom: JSDOM | null = null;
    private _document: Document | null = null;
    private _window: (Window & typeof globalThis) | null = null;
    private _timeout: number;
    private _scopeStack: Element[] = [];
    private _spyRegistry: Map<string, SpyCall[]> = new Map();
    private _mockRegistry: Map<string, { status: number; body: string | undefined; delayMs?: number }> = new Map();
    private _requestLog: Map<string, { method: string; url: string; body: string }[]> = new Map();

    constructor(opts: { timeout?: number } = {}) {
        this._timeout = opts.timeout ?? 5000;
    }

    private _setupFetchInterceptor(): void {
        if (!this._window) return;
        const self = this;
        (this._window as any).fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
            const method = ((init?.method ?? (input instanceof Request ? input.method : 'GET'))).toUpperCase();
            const body = typeof init?.body === 'string' ? init.body : '';
            const key = `${method} ${url}`;

            // Record the call
            const log = self._requestLog.get(key) ?? [];
            log.push({ method, url, body });
            self._requestLog.set(key, log);

            // Serve mock if registered
            const mock = self._mockRegistry.get(key);
            if (mock) {
                if (mock.delayMs) {
                    await new Promise(r => setTimeout(r, mock.delayMs));
                }
                return new Response(mock.body ?? '', {
                    status: mock.status,
                    headers: { 'Content-Type': 'application/json' },
                }) as unknown as globalThis.Response;
            }
            throw new Error(`[xtest] No mock registered for ${key}. Register with: mock ${method} "${url}" returning "..."`);
        };
    }

    async mount(html: string): Promise<void> {
        this._dom = new JSDOM(html, {
            runScripts: 'dangerously',
            resources: 'usable',
            pretendToBeVisual: true,
            url: 'http://localhost',
        });
        this._document = this._dom.window.document;
        this._document.write(html);
        this._document.close();
        this._window = this._dom.window as unknown as Window & typeof globalThis;
        this._setupFetchInterceptor();
    }

    async navigate(url: string): Promise<void> {
        // In JSDOM, re-mount a blank page (no real navigation)
        await this.mount(`<!DOCTYPE html><html><body></body></html>`);
    }

    async reload(): Promise<void> {
        // no-op in JSDOM
    }

    async click(selector: string, opts?: { double?: boolean; right?: boolean }): Promise<void> {
        const el = this._find(selector);
        const eventType = opts?.double ? 'dblclick' : opts?.right ? 'contextmenu' : 'click';
        el.dispatchEvent(new this._window!.MouseEvent(eventType, { bubbles: true, cancelable: true }));
    }

    async type(selector: string, text: string): Promise<void> {
        const el = this._find(selector) as HTMLInputElement;
        el.focus?.();
        el.value = text;
        el.dispatchEvent(new this._window!.Event('input', { bubbles: true }));
        el.dispatchEvent(new this._window!.Event('change', { bubbles: true }));
    }

    async clear(selector: string): Promise<void> {
        const el = this._find(selector) as HTMLInputElement;
        el.value = '';
        el.dispatchEvent(new this._window!.Event('input', { bubbles: true }));
        el.dispatchEvent(new this._window!.Event('change', { bubbles: true }));
    }

    async select(selector: string, option: string, by: 'label' | 'value' = 'label'): Promise<void> {
        const el = this._find(selector) as HTMLSelectElement;
        const opt = Array.from(el.options).find(o =>
            by === 'value' ? o.value === option : o.textContent?.trim() === option
        );
        if (!opt) throw new Error(`[xtest] Option ${by}="${option}" not found in ${selector}`);
        el.value = opt.value;
        el.dispatchEvent(new (this._window!.Event)('change', { bubbles: true }));
    }

    async hover(selector: string): Promise<void> {
        const el = this._find(selector);
        el.dispatchEvent(new this._window!.MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new this._window!.MouseEvent('mouseenter', { bubbles: true }));
    }

    async scrollTo(selector: string): Promise<void> {
        // no-op in JSDOM (no layout engine)
    }

    async waitFor(selector: string, timeoutMs?: number): Promise<void> {
        const limit = timeoutMs ?? this._timeout;
        const start = Date.now();
        while (Date.now() - start < limit) {
            if (this._document?.querySelector(selector)) return;
            await this._tick(50);
        }
        throw new Error(`waitFor: "${selector}" not found after ${limit}ms`);
    }

    async waitMs(ms: number): Promise<void> {
        await this._tick(ms);
    }

    async press(key: string): Promise<void> {
        const active = this._document?.activeElement ?? this._document?.body;
        if (!active) return;
        const ev = new this._window!.KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
        });
        active.dispatchEvent(ev);
        active.dispatchEvent(new this._window!.KeyboardEvent('keyup', { key, bubbles: true }));
    }

    async getText(selector: string, needsText?: string): Promise<string> {
        if (needsText) {
            // by-text strategy: find element whose text contains the value
            const all = this._document!.querySelectorAll(selector === '*' ? '*' : selector);
            for (const el of all) {
                if (el.textContent?.includes(needsText)) return el.textContent ?? '';
            }
            return '';
        }
        return this._find(selector).textContent?.trim() ?? '';
    }

    async getValue(selector: string): Promise<string> {
        return (this._find(selector) as HTMLInputElement).value ?? '';
    }

    async isVisible(selector: string): Promise<boolean> {
        let el: Element | null;
        try { el = this._find(selector); } catch { return false; }
        const htmlEl = el as HTMLElement;
        if (htmlEl.hidden) return false;
        const style = this._window?.getComputedStyle(htmlEl);
        if (style?.display === 'none' || style?.visibility === 'hidden') return false;
        return true;
    }

    async isPresent(selector: string): Promise<boolean> {
        try { this._find(selector); return true; } catch { return false; }
    }

    async hasFocus(selector: string): Promise<boolean> {
        let el: Element | null;
        try { el = this._find(selector); } catch { return false; }
        return el === this._document?.activeElement;
    }

    async isEnabled(selector: string): Promise<boolean> {
        const el = this._find(selector) as HTMLInputElement | HTMLButtonElement;
        return !el.disabled;
    }

    async isChecked(selector: string): Promise<boolean> {
        return (this._find(selector) as HTMLInputElement).checked ?? false;
    }

    async getProp(selector: string, prop: string): Promise<string> {
        const el = this._find(selector) as any;
        return String(el[prop] ?? '');
    }

    async getAttr(selector: string, attr: string): Promise<string | null> {
        return this._find(selector).getAttribute(attr);
    }

    async registerSpy(name: string, returnValue?: string): Promise<void> {
        const calls: SpyCall[] = [];
        this._spyRegistry.set(name, calls);
        if (this._document?.defaultView) {
            (this._document.defaultView as any)[name] = (...rawArgs: unknown[]) => {
                calls.push({ args: rawArgs.map(String), returnValue });
                return returnValue;
            };
        }
    }

    async getSpyCalls(name: string): Promise<SpyCall[]> {
        return this._spyRegistry.get(name) ?? [];
    }

    async resetAllSpies(): Promise<void> {
        for (const calls of this._spyRegistry.values()) calls.length = 0;
    }

    async blur(selector: string): Promise<void> {
        (this._find(selector) as HTMLElement).blur();
    }

    async fill(selector: string, value: string): Promise<void> {
        const el = this._find(selector) as HTMLInputElement;
        el.value = '';
        el.value = value;
        el.dispatchEvent(new (this._window!.Event)('input', { bubbles: true }));
        el.dispatchEvent(new (this._window!.Event)('change', { bubbles: true }));
    }

    async focus(selector: string): Promise<void> {
        (this._find(selector) as HTMLElement).focus();
    }

    async hasClass(selector: string, className: string): Promise<boolean> {
        return this._find(selector).classList.contains(className);
    }

    async isReadOnly(selector: string): Promise<boolean> {
        return (this._find(selector) as HTMLInputElement).readOnly ?? false;
    }

    async isEmpty(selector: string): Promise<boolean> {
        const el = this._find(selector) as HTMLInputElement;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
            return el.value === '';
        }
        return (el.textContent ?? '').trim() === '';
    }

    async resetSpy(name: string): Promise<void> {
        const calls = this._spyRegistry.get(name);
        if (calls) calls.length = 0;
    }

    async screenshot(_name?: string): Promise<void> {
        // JSDOM has no rendering — screenshot is a no-op
    }

    async mockRequest(method: string, url: string, status: number, body?: string, delayMs?: number): Promise<void> {
        const entry: { status: number; body: string | undefined; delayMs?: number } = { status, body };
        if (delayMs !== undefined) entry.delayMs = delayMs;
        this._mockRegistry.set(`${method.toUpperCase()} ${url}`, entry);
    }

    async getRequestCalls(method: string, url: string): Promise<import('../parser/ast.js').RequestCall[]> {
        return this._requestLog.get(`${method.toUpperCase()} ${url}`) ?? [];
    }

    async clearRequestMocks(): Promise<void> {
        this._mockRegistry.clear();
        this._requestLog.clear();
    }

    async awaitFunction(name: string, timeoutMs: number): Promise<void> {
        if (!this._window) throw new Error(`[xtest] No window — call mount() first`);
        const fn = (this._window as any)[name];
        if (typeof fn !== 'function') throw new Error(`[xtest] window.${name} is not a function`);
        await Promise.race([
            Promise.resolve(fn()),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`[xtest] Timeout waiting for function "${name}" (${timeoutMs}ms)`)), timeoutMs)
            ),
        ]);
    }

    async isFocusable(selector: string): Promise<boolean> {
        return (this._find(selector) as HTMLElement).tabIndex >= 0;
    }

    async getAccessibleName(selector: string): Promise<string> {
        const el = this._find(selector) as HTMLElement;
        const doc = this._document!;
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.trim();
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            const text = labelledBy.split(/\s+/)
                .map(id => doc.getElementById(id)?.textContent?.trim() ?? '')
                .join(' ').trim();
            if (text) return text;
        }
        const alt = el.getAttribute('alt');
        if (alt !== null) return alt.trim();
        const title = el.getAttribute('title');
        if (title) return title.trim();
        return el.textContent?.trim() ?? '';
    }

    async checkA11y(selector?: string): Promise<import('../parser/ast.js').A11yViolation[]> {
        const { default: axe } = await import('axe-core');
        const doc = this._document;
        if (!doc) return [];
        const context = selector ? (doc.querySelector(selector) ?? doc.documentElement) : doc.documentElement;
        const result = await axe.run(context as Element);
        return result.violations.map(v => ({
            id: v.id,
            description: v.description,
            impact: v.impact ?? null,
            nodes: v.nodes.map(n => n.html),
        }));
    }

    async count(selector: string): Promise<number> {
        if (!this._document) return 0;
        const root: Element | Document =
            this._scopeStack.length > 0
                ? this._scopeStack[this._scopeStack.length - 1]!
                : this._document;
        return root.querySelectorAll(selector).length;
    }

    async pushScope(selector: string, opts?: { index?: number; filter?: ScopeFilter }): Promise<void> {
        const index = opts?.index ?? 1;
        if (index < 1) throw new Error('[xtest] Scope qualifier must be >= 1');
        const root = this._findNth(selector, index, opts?.filter);
        this._scopeStack.push(root);
    }

    async popScope(): Promise<void> {
        this._scopeStack.pop();
    }

    async teardown(): Promise<void> {
        this._scopeStack = [];
        this._dom?.window.close();
        this._dom = null;
        this._document = null;
        this._window = null;
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private _find(selector: string): Element {
        if (!this._document) throw new Error('[xtest] Runner not mounted — call mount() first');

        // Root is the active scope element (from within block) or the document
        const root: Element | Document =
            this._scopeStack.length > 0
                ? this._scopeStack[this._scopeStack.length - 1]!
                : this._document;

        // Multi-selector: try each comma-separated selector
        for (const sel of selector.split(',').map(s => s.trim())) {
            const el = root.querySelector(sel);
            if (el) return el;
        }
        throw new Error(`[xtest] Element not found: "${selector}"${this._scopeStack.length > 0 ? ` within scope` : ''}`);
    }

    private _findNth(selector: string, index: number, filter?: ScopeFilter): Element {
        if (!this._document) throw new Error('[xtest] Runner not mounted — call mount() first');
        const root: Element | Document =
            this._scopeStack.length > 0
                ? this._scopeStack[this._scopeStack.length - 1]!
                : this._document;

        let matches = Array.from(root.querySelectorAll(selector));
        if (filter && filter.target === 'text') {
            matches = matches.filter(el => {
                const text = (el.textContent ?? '').trim();
                if (filter.operator === 'equals') return text === filter.value;
                return text.includes(filter.value);
            });
        }
        const target = matches[index - 1];
        if (!target) throw new Error(`[xtest] Scope selector "${selector}" does not have instance #${index}`);
        return target;
    }

    private _tick(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
