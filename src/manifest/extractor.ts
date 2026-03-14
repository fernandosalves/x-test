/**
 * xtest — Manifest Extractor
 *
 * Reads component source files and extracts @xtest-surface blocks from JSDoc
 * comments. Also auto-discovers elements annotated with the xtest() directive
 * via data-xtest attributes in template strings.
 */

import type { SurfaceManifest, SurfaceElement, ResolutionStrategy, SurfaceScope } from './types.js';

// ── Main extractor ──────────────────────────────────────────────────────────────

/**
 * Extract a SurfaceManifest from a component source string.
 * Reads @xtest-surface JSDoc blocks and data-xtest refs in template literals.
 */
interface ParsedBlock {
    elements: SurfaceElement[];
    scopes: SurfaceScope[];
}

export function extractManifest(source: string, componentName?: string): SurfaceManifest {
    const elements: Record<string, SurfaceElement> = {};
    const scopes: Record<string, SurfaceScope> = {};

    // 1. Parse @xtest-surface JSDoc blocks
    const jsdocBlocks = extractFromJSDoc(source);
    for (const block of jsdocBlocks) {
        for (const el of block.elements) {
            elements[el.name] = el;
        }
        for (const scope of block.scopes) {
            scopes[scope.name] = scope;
            if (!(scope.name in elements)) {
                elements[scope.name] = { name: scope.name, strategy: scope.strategy, aliases: [] };
            }
        }
    }

    // 2. Auto-discover xtest() directive refs in template strings
    const refElements = extractFromXtestRefs(source);
    for (const el of refElements) {
        if (!(el.name in elements)) {
            elements[el.name] = el;
        }
    }

    const manifest: SurfaceManifest = { elements };
    if (Object.keys(scopes).length > 0) manifest.scopes = scopes;
    if (componentName !== undefined) manifest.component = componentName;
    return manifest;
}

// ── JSDoc block extraction ──────────────────────────────────────────────────────

const XTEST_SURFACE_BLOCK = /\/\*\*[\s\S]*?@xtest-surface[\s\S]*?\*\//g;

function extractFromJSDoc(source: string): ParsedBlock[] {
    const blocks: ParsedBlock[] = [];
    for (const [block] of source.matchAll(XTEST_SURFACE_BLOCK)) {
        blocks.push(parseXtestBlock(block));
    }
    return blocks;
}

function parseXtestBlock(block: string): ParsedBlock {
    const lines = block
        .split('\n')
        .map(l => l.replace(/^\s*\*\s?/, '').trim())
        .filter(Boolean);

    const elements: SurfaceElement[] = [];
    const scopes: SurfaceScope[] = [];
    let current: SurfaceElement | null = null;

    for (const line of lines) {
        // @element username-input   by-ref: username
        const elementMatch = line.match(/^@element\s+([\w-]+)\s*(.*)?$/);
        if (elementMatch) {
            if (current) elements.push(current);
            const name = elementMatch[1]!;
            let stratStr = (elementMatch[2] ?? '').trim();
            let inlineScope: string | undefined;
            stratStr = stratStr.replace(/@scope\s+([\w-]+)/, (_, scopeName: string) => {
                inlineScope = scopeName;
                return '';
            }).trim();
            const strategy = parseStrategy(stratStr);
            current = { name, strategy, aliases: [], ...(inlineScope ? { scope: inlineScope } : {}) };
            continue;
        }

        // @alias "alias1", "alias2"
        const aliasMatch = line.match(/^@alias\s+(.+)$/);
        if (aliasMatch && current) {
            const raw = aliasMatch[1]!;
            const aliases = [...raw.matchAll(/"([^"]+)"/g)].map(m => m[1]!.toLowerCase());
            current.aliases.push(...aliases);
            continue;
        }

        // @scope definitions or assignments
        const scopeMatch = line.match(/^@scope\s+([\w-]+)(?:\s+(.*))?$/);
        if (scopeMatch) {
            const [, scopeName, rest] = scopeMatch;
            if (rest && rest.trim()) {
                const strategy = parseStrategy(rest.trim());
                scopes.push({ name: scopeName!, strategy });
                continue;
            }
            if (current) {
                current.scope = scopeName!;
            }
            continue;
        }
    }

    if (current) elements.push(current);
    return { elements, scopes };
}

function parseStrategy(str: string): ResolutionStrategy {
    if (!str) return { type: 'auto' };

    const m = str.match(/^([\w-]+):\s*"?([^"\s]+)"?\s*(?:name:\s*"([^"]+)")?/);
    if (!m) return { type: 'auto' };

    const [, type, value, name] = m;

    switch (type) {
        case 'by-ref': return { type: 'by-ref', value: value! };
        case 'by-selector': return { type: 'by-selector', value: value! };
        case 'by-aria-label': return { type: 'by-aria-label', value: value! };
        case 'by-role':
            return name
                ? { type: 'by-role', value: value!, name }
                : { type: 'by-role', value: value! };
        case 'by-name': return { type: 'by-name', value: value! };
        case 'by-placeholder': return { type: 'by-placeholder', value: value! };
        case 'by-type': return { type: 'by-type', value: value! };
        case 'by-text': return { type: 'by-text', value: value! };
        default: return { type: 'auto' };
    }
}

// ── xtest() directive auto-discovery ───────────────────────────────────────────

// Matches: xtest('name') or xtest("name")
const XTEST_REF = /xtest\(['"]([^'"]+)['"]\)/g;
// Matches: data-xtest="name" (in HTML strings)
const DATA_XTEST = /data-xtest="([^"]+)"/g;

function extractFromXtestRefs(source: string): SurfaceElement[] {
    const names = new Set<string>();
    const elements: SurfaceElement[] = [];

    for (const [, name] of source.matchAll(XTEST_REF)) {
        if (name) names.add(name);
    }
    for (const [, name] of source.matchAll(DATA_XTEST)) {
        if (name) names.add(name);
    }

    for (const name of names) {
        elements.push({
            name,
            strategy: { type: 'by-ref', value: name },
            aliases: [],
        });
    }

    return elements;
}

// ── File-based extraction ───────────────────────────────────────────────────────

/**
 * Extract a manifest from a file path (Node.js only).
 * Reads the file and delegates to extractManifest().
 */
export async function extractManifestFromFile(filePath: string): Promise<SurfaceManifest> {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(filePath, 'utf8');

    // Infer component name from file name
    const baseName = filePath.split('/').pop()?.replace(/\.(ts|js|tsx|jsx|html)$/, '');
    return extractManifest(source, baseName);
}

/**
 * Merge multiple manifests (e.g. component + its sub-components).
 * Later manifests override earlier ones for conflicting element names.
 */
export function mergeManifests(...manifests: SurfaceManifest[]): SurfaceManifest {
    const elements: Record<string, SurfaceElement> = {};
    for (const m of manifests) {
        Object.assign(elements, m.elements);
    }
    return { elements };
}
