/**
 * xtest — Surface Manifest types
 *
 * A SurfaceManifest is the resolved representation of an @xtest-surface
 * JSDoc block — a map from semantic element names to DOM resolution strategies.
 */

// ── Resolution strategies ───────────────────────────────────────────────────────

export type ResolutionStrategy =
    | { type: 'by-ref'; value: string }
    | { type: 'by-selector'; value: string }
    | { type: 'by-aria-label'; value: string }
    | { type: 'by-role'; value: string; name?: string }
    | { type: 'by-name'; value: string }
    | { type: 'by-placeholder'; value: string }
    | { type: 'by-type'; value: string }
    | { type: 'by-text'; value: string }
    | { type: 'auto' };

// ── Surface element entry ───────────────────────────────────────────────────────

export interface SurfaceElement {
    /** Canonical semantic name (kebab-case). */
    name: string;
    /** How to locate the element in the DOM. */
    strategy: ResolutionStrategy;
    /** Additional natural-language aliases. */
    aliases: string[];
    /** Optional scope constraint. */
    scope?: string;
}

export interface SurfaceScope {
    name: string;
    strategy: ResolutionStrategy;
    parent?: string;
}

// ── Surface manifest ────────────────────────────────────────────────────────────

export interface SurfaceManifest {
    /** Source component name (from @xtest-surface tag or class name). */
    component?: string;
    /** All declared elements, keyed by canonical name. */
    elements: Record<string, SurfaceElement>;
    /** Optional scope definitions keyed by scope name. */
    scopes?: Record<string, SurfaceScope>;
}

// ── defineSurface() — programmatic manifest ─────────────────────────────────────

export type SurfaceDefinition = Record<string, Omit<SurfaceElement, 'name'>>;

type ScopeDefinition = ResolutionStrategy | { strategy: ResolutionStrategy; parent?: string };

export function defineSurface(
    component: string,
    def: SurfaceDefinition,
    opts: { scopes?: Record<string, ScopeDefinition> } = {},
): SurfaceManifest {
    const elements: Record<string, SurfaceElement> = {};
    for (const [name, entry] of Object.entries(def)) {
        elements[name] = { name, ...entry };
    }
    const scopes = opts.scopes
        ? Object.fromEntries(Object.entries(opts.scopes).map(([name, entry]) => {
            if ('type' in entry) {
                return [name, { name, strategy: entry } satisfies SurfaceScope];
            }
            return [name, { name, strategy: entry.strategy, ...(entry.parent ? { parent: entry.parent } : {}) } satisfies SurfaceScope];
        }))
        : undefined;
    if (scopes) {
        for (const [name, scope] of Object.entries(scopes)) {
            if (!(name in elements)) {
                elements[name] = { name, strategy: scope.strategy, aliases: [] };
            }
        }
    }
    return scopes ? { component, elements, scopes } : { component, elements };
}
