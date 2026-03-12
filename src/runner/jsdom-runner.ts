/**
 * Miura — JSDOM Runner
 *
 * Executes test steps against a JSDOM environment. No browser process required.
 * Fast and deterministic — ideal for unit-testing components in CI.
 */

import { JSDOM } from 'jsdom';
import type { MiuraRunner } from './runner.js';

export class JSDOMRunner implements MiuraRunner {
    private _dom:        JSDOM | null = null;
    private _document:   Document | null = null;
    private _window:     (Window & typeof globalThis) | null = null;
    private _timeout:    number;
    private _scopeStack: Element[] = [];

    constructor(opts: { timeout?: number } = {}) {
        this._timeout = opts.timeout ?? 5000;
    }

    async mount(html: string): Promise<void> {
        this._dom = new JSDOM(html, {
            runScripts:          'dangerously',
            resources:           'usable',
            pretendToBeVisual:   true,
            url:                 'http://localhost',
        });
        this._document = this._dom.window.document;
        this._window   = this._dom.window as unknown as Window & typeof globalThis;
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
        el.dispatchEvent(new this._window!.Event('input',  { bubbles: true }));
        el.dispatchEvent(new this._window!.Event('change', { bubbles: true }));
    }

    async clear(selector: string): Promise<void> {
        const el = this._find(selector) as HTMLInputElement;
        el.value = '';
        el.dispatchEvent(new this._window!.Event('input',  { bubbles: true }));
        el.dispatchEvent(new this._window!.Event('change', { bubbles: true }));
    }

    async select(selector: string, optionText: string): Promise<void> {
        const el = this._find(selector) as HTMLSelectElement;
        const option = Array.from(el.options).find(o => o.text === optionText || o.value === optionText);
        if (!option) throw new Error(`Option "${optionText}" not found in ${selector}`);
        el.value = option.value;
        el.dispatchEvent(new this._window!.Event('change', { bubbles: true }));
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
            bubbles:    true,
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

    async pushScope(selector: string): Promise<void> {
        const root = this._find(selector);
        this._scopeStack.push(root);
    }

    async popScope(): Promise<void> {
        this._scopeStack.pop();
    }

    async teardown(): Promise<void> {
        this._scopeStack = [];
        this._dom?.window.close();
        this._dom      = null;
        this._document = null;
        this._window   = null;
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private _find(selector: string): Element {
        if (!this._document) throw new Error('[miura] Runner not mounted — call mount() first');

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
        throw new Error(`[miura] Element not found: "${selector}"${this._scopeStack.length > 0 ? ` within scope` : ''}`);
    }

    private _tick(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
