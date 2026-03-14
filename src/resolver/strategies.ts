/**
 * xtest — Resolution strategies
 *
 * Each strategy converts a SurfaceElement into a concrete CSS selector
 * that the runner can pass to querySelector / Playwright locator.
 */

import type { ResolutionStrategy } from '../manifest/types.js';

export interface ResolvedSelector {
    selector: string;
    strategy: string;
    needsText?: string;  // for by-text: use textContent matching
}

export function strategyToSelector(s: ResolutionStrategy): ResolvedSelector {
    switch (s.type) {
        case 'by-ref':
            return { selector: `[data-xtest="${s.value}"]`, strategy: 'by-ref' };

        case 'by-selector':
            return { selector: s.value, strategy: 'by-selector' };

        case 'by-aria-label':
            return {
                selector: `[aria-label="${s.value}"], [aria-labelledby]`,
                strategy: 'by-aria-label',
            };

        case 'by-role': {
            const ROLE_NATIVE: Record<string, string> = {
                button: 'button, [role="button"]',
                link: 'a, [role="link"]',
                textbox: 'input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea, [role="textbox"]',
                checkbox: 'input[type="checkbox"], [role="checkbox"]',
                radio: 'input[type="radio"], [role="radio"]',
                combobox: 'select, [role="combobox"]',
                listbox: '[role="listbox"]',
                option: 'option, [role="option"]',
                alert: '[role="alert"], .alert, .error',
                dialog: 'dialog, [role="dialog"]',
                heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
                img: 'img, [role="img"]',
                list: 'ul, ol, [role="list"]',
                listitem: 'li, [role="listitem"]',
            };
            const base = ROLE_NATIVE[s.value] ?? `[role="${s.value}"]`;
            return { selector: base, strategy: 'by-role' };
        }

        case 'by-name':
            return { selector: `[name="${s.value}"]`, strategy: 'by-name' };

        case 'by-placeholder':
            return { selector: `[placeholder="${s.value}"]`, strategy: 'by-placeholder' };

        case 'by-type':
            return { selector: `input[type="${s.value}"]`, strategy: 'by-type' };

        case 'by-text':
            return { selector: '*', strategy: 'by-text', needsText: s.value };

        case 'auto':
            return { selector: '*', strategy: 'auto' };
    }
}

// ── Inference heuristics for 'auto' strategy ────────────────────────────────────

export function inferSelector(name: string): ResolvedSelector {
    const n = name.toLowerCase();

    if (n.includes('password'))
        return { selector: 'input[type="password"]', strategy: 'inferred' };
    if (n.includes('email') || n.includes('username') || n.includes('user-name') || n.includes('login'))
        return { selector: 'input[type="email"], input[type="text"][name*="user"], input[type="text"][name*="email"], input[type="text"]', strategy: 'inferred' };
    if (n.endsWith('-input') || n.endsWith('-field') || n.endsWith('input') || n.endsWith('field'))
        return { selector: 'input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), textarea', strategy: 'inferred' };
    if (n.endsWith('-button') || n.endsWith('-btn') || n === 'submit' || n === 'button')
        return { selector: 'button, [role="button"], input[type="submit"]', strategy: 'inferred' };
    if (n.endsWith('-link') || n.endsWith('link'))
        return { selector: 'a, [role="link"]', strategy: 'inferred' };
    if (n.includes('checkbox') || n.includes('check'))
        return { selector: 'input[type="checkbox"]', strategy: 'inferred' };
    if (n.includes('select') || n.includes('dropdown'))
        return { selector: 'select', strategy: 'inferred' };
    if (n.includes('error') || n.includes('alert') || n.includes('message'))
        return { selector: '[role="alert"], .error, .alert, .message, .error-msg', strategy: 'inferred' };
    if (n.includes('label'))
        return { selector: 'label', strategy: 'inferred' };
    if (n.includes('img') || n.includes('image'))
        return { selector: 'img, [role="img"]', strategy: 'inferred' };

    // Last resort
    return { selector: `[data-xtest="${name}"], #${name}, .${name}`, strategy: 'inferred-fallback' };
}

// ── Edit distance (Levenshtein) for fuzzy alias matching ────────────────────────

export function editDistance(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i]![j] = a[i - 1] === b[j - 1]
                ? dp[i - 1]![j - 1]!
                : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
        }
    }
    return dp[m]![n]!;
}

export function normalise(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}
