/**
 * Miura — xtest() directive
 *
 * Framework-agnostic element annotator. In dev, attaches data-xtest="<name>"
 * to the element. In production builds, is a complete no-op with zero footprint.
 *
 * Works as a spread in any template system:
 *
 *   // Lit / Maori
 *   html`<input ${xtest('username')} type="text" />`
 *
 *   // React
 *   <input {...xtest('username')} type="text" />
 *
 *   // Vue
 *   <input v-bind="xtest('username')" type="text" />
 *
 *   // Vanilla DOM
 *   Object.assign(inputEl, xtest('username'))
 */

const IS_DEV = typeof process !== 'undefined'
    ? process.env['NODE_ENV'] !== 'production'
    : typeof globalThis !== 'undefined' && (globalThis as any).__MIURA_DEV__ !== false;

// ── Plain object form (React / Vue / vanilla spread) ───────────────────────────

export type XtestProps = Record<string, string>;

/**
 * Returns `{ 'data-xtest': name }` in dev, `{}` in prod.
 *
 * ```tsx
 * <input {...xtest('username')} type="text" />
 * ```
 */
export function xtest(name: string): XtestProps {
    if (!IS_DEV) return {};
    return { 'data-xtest': name };
}

// ── Lit / Maori directive form ─────────────────────────────────────────────────

/**
 * A Lit-compatible directive object returned by `xtestDirective()`.
 * Attach with the `${...}` spread syntax in tagged template literals.
 *
 * ```ts
 * html`<input ${xtestDirective('username')} type="text" />`
 * ```
 */
export interface XtestDirective {
    /** Used by Lit-style template engines to spread attributes. */
    readonly __litDirective?: true;
    apply(el: Element): void;
}

export function xtestDirective(name: string): XtestDirective {
    return {
        apply(el: Element) {
            if (IS_DEV) {
                el.setAttribute('data-xtest', name);
            }
        },
    };
}

// ── DOM element direct annotation ─────────────────────────────────────────────

/**
 * Annotate a real DOM element directly.
 * Useful in imperative rendering code.
 *
 * ```ts
 * annotate(document.getElementById('username'), 'username-input');
 * ```
 */
export function annotate(el: Element, name: string): void {
    if (IS_DEV) {
        el.setAttribute('data-xtest', name);
    }
}

/**
 * Remove a Miura annotation from an element (e.g. on cleanup).
 */
export function unannotate(el: Element): void {
    el.removeAttribute('data-xtest');
}

/**
 * Query annotated elements from a root.
 */
export function queryXtest(root: Element | Document, name: string): Element | null {
    return root.querySelector(`[data-xtest="${name}"]`);
}

export function queryAllXtest(root: Element | Document, name: string): Element[] {
    return Array.from(root.querySelectorAll(`[data-xtest="${name}"]`));
}
