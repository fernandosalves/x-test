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

// ── Surface manifest ────────────────────────────────────────────────────────────

export interface SurfaceManifest {
    /** Source component name (from @xtest-surface tag or class name). */
    component?: string;
    /** All declared elements, keyed by canonical name. */
    elements: Record<string, SurfaceElement>;
}

// ── defineSurface() — programmatic manifest ─────────────────────────────────────

export type SurfaceDefinition = Record<string, Omit<SurfaceElement, 'name'>>;

export function defineSurface(component: string, def: SurfaceDefinition): SurfaceManifest {
    const elements: Record<string, SurfaceElement> = {};
    for (const [name, entry] of Object.entries(def)) {
        elements[name] = { name, ...entry };
    }
    return { component, elements };
}
