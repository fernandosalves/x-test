/**
 * xtest — Resolver
 *
 * Maps an ElementRef from the AST to a concrete CSS selector using
 * the SurfaceManifest. Implements a priority-ordered resolution chain
 * with fuzzy alias fallback.
 */

import type { ElementRef, ScopeFilter } from '../parser/ast.js';
import type { SurfaceManifest, SurfaceElement, SurfaceScope } from '../manifest/types.js';
import {
    strategyToSelector, inferSelector, editDistance, normalise,
    type ResolvedSelector,
} from './strategies.js';

// ── Resolution result ───────────────────────────────────────────────────────────

export interface ResolutionResult {
    selector: string;
    element: SurfaceElement | null;
    strategy: string;
    confidence: 'exact' | 'alias' | 'fuzzy' | 'inferred' | 'fallback';
    warning?: string;
    needsText?: string;
    scopeChain?: string[];
}

export class ResolutionError extends Error {
    constructor(
        public readonly ref: string,
        public readonly candidates: string[],
    ) {
        super(
            `[xtest] Cannot resolve element "${ref}".\n` +
            (candidates.length
                ? `  Did you mean: ${candidates.map(c => `"${c}"`).join(', ')}?`
                : '  No elements declared in the surface manifest.'),
        );
    }
}

// ── Resolver ────────────────────────────────────────────────────────────────────

export class Resolver {
    private _manifest: SurfaceManifest;
    private _aliasIndex: Map<string, SurfaceElement> = new Map();
    private _scopeCache: Map<string, SurfaceScope> = new Map();

    constructor(manifest: SurfaceManifest) {
        this._manifest = manifest;
        this._buildAliasIndex();
        this._buildScopeCache();
    }

    resolve(ref: ElementRef): ResolutionResult {
        if (ref.kind === 'variable') {
            // Variables are resolved at runtime — return a sentinel
            return {
                selector: `[data-xtest-var="${ref.value}"]`,
                element: null,
                strategy: 'variable',
                confidence: 'fallback',
            };
        }

        const name = ref.value;
        return this.resolveByName(name);
    }

    resolveByName(name: string): ResolutionResult {
        const key = normalise(name);

        // 1. Exact element name match
        const direct = this._manifest.elements[name]
            ?? this._manifest.elements[name.toLowerCase()];
        if (direct) {
            return this._toResult(direct, 'exact');
        }

        // 2. Exact alias match
        const aliased = this._aliasIndex.get(key);
        if (aliased) {
            return this._toResult(aliased, 'alias');
        }

        // 3. Fuzzy alias match (edit distance ≤ 2)
        const fuzzy = this._fuzzyMatch(key);
        if (fuzzy) {
            return {
                ...this._toResult(fuzzy.element, 'fuzzy'),
                warning: `Fuzzy match: "${name}" → "${fuzzy.element.name}" (distance ${fuzzy.distance}). Consider adding an explicit alias.`,
            };
        }

        // 4. Inferred selector (no manifest needed)
        if (Object.keys(this._manifest.elements).length === 0) {
            const inferred = inferSelector(name);
            return {
                selector: inferred.selector,
                element: null,
                strategy: inferred.strategy,
                confidence: 'inferred',
            };
        }

        // 5. Throw with suggestions
        const candidates = this._closestNames(key, 3);
        throw new ResolutionError(name, candidates);
    }

    // ── Private ──────────────────────────────────────────────────────────────────

    private _buildAliasIndex(): void {
        for (const el of Object.values(this._manifest.elements)) {
            // Index the element name itself
            this._aliasIndex.set(normalise(el.name), el);
            // Index each alias
            for (const alias of el.aliases) {
                this._aliasIndex.set(normalise(alias), el);
            }
        }
    }

    private _toResult(el: SurfaceElement, confidence: ResolutionResult['confidence']): ResolutionResult {
        const resolved = el.strategy.type === 'auto'
            ? inferSelector(el.name)
            : strategyToSelector(el.strategy);
        const scoped = this._applyScope(el.scope, resolved.selector);
        return {
            selector: scoped.selector,
            element: el,
            strategy: resolved.strategy,
            confidence,
            ...(resolved.needsText ? { needsText: resolved.needsText } : {}),
            ...(scoped.scopeChain.length ? { scopeChain: scoped.scopeChain } : {}),
        };
    }

    private _fuzzyMatch(key: string): { element: SurfaceElement; distance: number } | null {
        let best: SurfaceElement | null = null;
        let bestDist: number = 3; // threshold

        for (const [aliasKey, el] of this._aliasIndex) {
            const dist = editDistance(key, aliasKey);
            if (dist < bestDist) {
                bestDist = dist;
                best = el;
            }
        }

        return best ? { element: best, distance: bestDist } : null;
    }

    private _closestNames(key: string, n: number): string[] {
        return Object.keys(this._manifest.elements)
            .map(name => ({ name, dist: editDistance(key, normalise(name)) }))
            .sort((a, b) => a.dist - b.dist)
            .slice(0, n)
            .map(e => e.name);
    }

    private _buildScopeCache(): void {
        if (!this._manifest.scopes) return;
        for (const scope of Object.values(this._manifest.scopes)) {
            this._scopeCache.set(scope.name, scope);
        }
    }

    getScopeSelector(name: string, filter?: ScopeFilter): { selector: string; filter?: ScopeFilter } {
        const scope = this._scopeCache.get(name);
        if (!scope) throw new Error(`[xtest] Unknown scope "${name}".`);
        const resolved = scope.strategy.type === 'auto'
            ? inferSelector(scope.name)
            : strategyToSelector(scope.strategy);
        if (filter && filter.target === 'attr') {
            const suffix = filter.operator === 'equals'
                ? `[${filter.attr}="${filter.value}"]`
                : `[${filter.attr}*="${filter.value}"]`;
            return { selector: `${resolved.selector}${suffix}` };
        }
        if (filter && filter.target === 'text') {
            return { selector: resolved.selector, filter };
        }
        return { selector: resolved.selector };
    }

    private _applyScope(scopeName: string | undefined, selector: string): { selector: string; scopeChain: string[] } {
        if (!scopeName) return { selector, scopeChain: [] };
        const chain: string[] = [];
        let current: string | undefined = scopeName;
        const visited = new Set<string>();
        while (current) {
            if (visited.has(current)) break;
            visited.add(current);
            const scope = this._scopeCache.get(current);
            if (!scope) break;
            const resolved = scope.strategy.type === 'auto'
                ? inferSelector(scope.name)
                : strategyToSelector(scope.strategy);
            chain.unshift(resolved.selector);
            current = scope.parent;
        }
        if (chain.length === 0) return { selector, scopeChain: [] };
        const combined = `${chain.join(' ')} ${selector}`.trim();
        return { selector: combined, scopeChain: chain };
    }
}
