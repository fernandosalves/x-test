import type { Meta } from '@storybook/html';
import { Resolver, ResolutionError } from '../src/resolver/resolver.js';
import { extractManifest } from '../src/manifest/extractor.js';
import { defineSurface } from '../src/manifest/types.js';

const BASE = `
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; }
.demo { max-width: 860px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
.card { border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: white; }
.card-header { background: linear-gradient(135deg,#0f172a,#1e293b); color: white; padding: .65rem 1rem; display: flex; align-items: center; justify-content: space-between; }
.card-header h3 { margin: 0; font-size: .92rem; }
.badge { font-size:.65rem;font-weight:700;padding:.12rem .5rem;border-radius:3px;text-transform:uppercase;letter-spacing:.07em; }
.badge-green  { background: #15803d; }
.badge-blue   { background: #1d4ed8; }
.badge-violet { background: #6d28d9; }
.badge-orange { background: #c2410c; }
.card-body { padding: 1rem 1.2rem; }
.code { background: #0f172a; color: #94a3b8; font-family: monospace; font-size: .78rem; border-radius: 8px; padding: .7rem 1rem; line-height: 1.65; margin-bottom: .75rem; white-space: pre; overflow-x: auto; }
.code .kw  { color: #c084fc; }
.code .fn  { color: #86efac; }
.code .str { color: #f9a8d4; }
.code .cm  { color: #475569; }
.divider { border-top: 1px solid #f1f5f9; margin: .75rem 0; }
.label { font-size: .72rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .07em; margin-bottom: .35rem; }
input[type=text] { border: 1px solid #cbd5e1; border-radius: 6px; padding: .4rem .7rem; font-size: .88rem; width: 100%; font-family: monospace; }
input[type=text]:focus { outline: 2px solid #4f46e5; border-color: transparent; }
.result-row { display: flex; flex-direction: column; gap: .4rem; margin-top: .75rem; }
.result-item { display: flex; align-items: flex-start; gap: .6rem; padding: .5rem .7rem; border-radius: 6px; font-family: monospace; font-size: .78rem; }
.result-item.exact   { background: #f0fdf4; border: 1px solid #86efac; }
.result-item.alias   { background: #eff6ff; border: 1px solid #93c5fd; }
.result-item.fuzzy   { background: #fffbeb; border: 1px solid #fde68a; }
.result-item.inferred{ background: #f5f3ff; border: 1px solid #c4b5fd; }
.result-item.error   { background: #fef2f2; border: 1px solid #fca5a5; }
.result-item.fallback{ background: #f8fafc; border: 1px solid #e2e8f0; color: #94a3b8; }
.conf-badge { font-size: .65rem; font-weight: 700; padding: .1rem .4rem; border-radius: 3px; white-space: nowrap; flex-shrink: 0; }
.conf-exact   { background: #16a34a; color: white; }
.conf-alias   { background: #2563eb; color: white; }
.conf-fuzzy   { background: #d97706; color: white; }
.conf-inferred{ background: #7c3aed; color: white; }
.conf-error   { background: #dc2626; color: white; }
.selector-chip { background: #0f172a; color: #86efac; padding: .1rem .45rem; border-radius: 3px; font-size: .75rem; }
.warning-line  { color: #92400e; font-size: .72rem; margin-top: .2rem; }
.manifest-table { width: 100%; font-size: .78rem; border-collapse: collapse; }
.manifest-table th { text-align: left; padding: .3rem .5rem; font-size: .7rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .06em; border-bottom: 2px solid #e2e8f0; }
.manifest-table td { padding: .35rem .5rem; border-bottom: 1px solid #f1f5f9; font-family: monospace; vertical-align: top; }
.manifest-table tr:last-child td { border-bottom: none; }
.el-name  { color: #0f172a; font-weight: 600; }
.el-strat { color: #4f46e5; }
.el-alias { color: #64748b; font-size: .72rem; }
`;

const DEMO_MANIFEST = defineSurface('LoginForm', {
    'username-input': {
        strategy: { type: 'by-ref', value: 'username' },
        aliases: ['user name', 'email', 'email address', 'login field'],
    },
    'password-input': {
        strategy: { type: 'by-type', value: 'password' },
        aliases: ['password', 'pass', 'secret'],
    },
    'submit-button': {
        strategy: { type: 'by-role', value: 'button', name: 'Sign in' },
        aliases: ['submit', 'login button', 'sign in', 'go'],
    },
    'error-message': {
        strategy: { type: 'by-selector', value: '[role=alert]' },
        aliases: ['error', 'error message', 'alert', 'warning'],
    },
    'dashboard': {
        strategy: { type: 'by-selector', value: 'main[data-page=dashboard]' },
        aliases: ['dashboard', 'home page', 'main page'],
    },
});

// ── Story 1 — Resolver Playground ─────────────────────────────────────────────

export function ResolverPlayground(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<style>${BASE}</style>`;
    const demo = document.createElement('div');
    demo.className = 'demo';
    wrap.appendChild(demo);

    const resolver = new Resolver(DEMO_MANIFEST);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <div class="card-header">
            <h3>Resolver — alias → DOM selector</h3>
            <span class="badge badge-green">live</span>
        </div>
        <div class="card-body">
            <div class="code"><span class="kw">const</span> r = <span class="fn">resolver</span>.resolveByName(<span class="str">"email address"</span>);
<span class="cm">// r.selector    → '[data-xtest="username"]'</span>
<span class="cm">// r.confidence  → 'alias'</span>
<span class="cm">// r.element.name → 'username-input'</span></div>
            <div class="label">Type a name, alias, or fuzzy variant</div>
            <input type="text" id="resolve-input" value="email address" placeholder="e.g. submit, pass, singin, dasboard…" />
            <div class="result-row" id="result-row"></div>
            <div class="divider"></div>
            <div class="label">Try these</div>
            <div id="examples" style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.3rem"></div>
        </div>
    `;
    demo.appendChild(card);

    const examples = [
        'username-input', 'email', 'email address', 'user name',
        'submit-button', 'sign in', 'go', 'login button',
        'error-message', 'alert', 'pass', 'dashboard',
        'singin', 'erorr', 'passwrod', 'completelyrandom',
    ];

    const exContainer = card.querySelector<HTMLElement>('#examples')!;
    examples.forEach(ex => {
        const btn = document.createElement('button');
        btn.textContent = ex;
        btn.style.cssText = 'background:#f1f5f9;border:1px solid #e2e8f0;border-radius:5px;padding:.2rem .55rem;font-size:.78rem;cursor:pointer;font-family:monospace';
        btn.addEventListener('click', () => {
            (card.querySelector('#resolve-input') as HTMLInputElement).value = ex;
            resolve(ex);
        });
        exContainer.appendChild(btn);
    });

    function resolve(name: string): void {
        const resultRow = card.querySelector<HTMLElement>('#result-row')!;
        if (!name.trim()) { resultRow.innerHTML = ''; return; }

        try {
            const r = resolver.resolveByName(name);
            const confClass = r.confidence;
            const stratLabel = r.element
                ? `${r.element.strategy.type}: ${(r.element.strategy as any).value}`
                : r.strategy;
            resultRow.innerHTML = `
                <div class="result-item ${confClass}">
                    <span class="conf-badge conf-${confClass}">${confClass}</span>
                    <div>
                        <div><strong>${r.element?.name ?? '(inferred)'}</strong></div>
                        <div>selector: <span class="selector-chip">${r.selector.length > 60 ? r.selector.slice(0, 60) + '…' : r.selector}</span></div>
                        <div style="color:#64748b;font-size:.72rem">strategy: ${stratLabel}</div>
                        ${r.warning ? `<div class="warning-line">⚠ ${r.warning}</div>` : ''}
                    </div>
                </div>
            `;
        } catch (e) {
            const err = e as ResolutionError;
            resultRow.innerHTML = `
                <div class="result-item error">
                    <span class="conf-badge conf-error">no match</span>
                    <div>
                        <div>${e instanceof Error ? e.message.replace('[xtest] ', '') : String(e)}</div>
                        ${err.candidates?.length ? `<div style="color:#64748b;font-size:.72rem;margin-top:.2rem">Candidates: ${err.candidates.map(c => `"${c}"`).join(', ')}</div>` : ''}
                    </div>
                </div>
            `;
        }
    }

    card.querySelector('#resolve-input')!.addEventListener('input', (e) => {
        resolve((e.target as HTMLInputElement).value);
    });
    resolve('email address');

    // Manifest table
    const manifestCard = document.createElement('div');
    manifestCard.className = 'card';
    manifestCard.innerHTML = `
        <div class="card-header">
            <h3>Active manifest — LoginForm surface</h3>
            <span class="badge badge-violet">5 elements</span>
        </div>
        <div class="card-body">
            <table class="manifest-table">
                <thead><tr><th>Element</th><th>Strategy</th><th>Aliases</th></tr></thead>
                <tbody id="manifest-tbody"></tbody>
            </table>
        </div>
    `;
    demo.appendChild(manifestCard);

    const tbody = manifestCard.querySelector<HTMLElement>('#manifest-tbody')!;
    for (const el of Object.values(DEMO_MANIFEST.elements)) {
        const stratStr = `${el.strategy.type}: ${(el.strategy as any).value ?? ''}${(el.strategy as any).name ? ` name:"${(el.strategy as any).name}"` : ''}`;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="el-name">${el.name}</span></td>
            <td><span class="el-strat">${stratStr}</span></td>
            <td><span class="el-alias">${el.aliases.map(a => `"${a}"`).join(', ') || '—'}</span></td>
        `;
        tbody.appendChild(row);
    }

    return wrap;
}
ResolverPlayground.storyName = '1 · Resolver — alias → DOM selector (live)';

// ── Story 2 — Manifest extractor ──────────────────────────────────────────────

const DEFAULT_COMPONENT = `/**
 * @xtest-surface
 * @element username-input   by-ref: username
 *   @alias  "user name", "email"
 *
 * @element submit-button    by-role: button name: "Sign in"
 *   @alias  "submit", "login"
 *
 * @element error-message    by-selector: .error
 */
class LoginForm extends HTMLElement {
    render() {
        return \`
            <input data-xtest="username" type="text" />
            <button type="submit">Sign in</button>
        \`;
    }
}`;

export function ManifestExtractor(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<style>${BASE}</style>`;
    const demo = document.createElement('div');
    demo.className = 'demo';
    demo.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;max-width:none;padding:1.2rem';
    wrap.appendChild(demo);

    const leftCard = document.createElement('div');
    leftCard.className = 'card';
    leftCard.style.cssText = 'height:calc(100vh - 3rem);display:flex;flex-direction:column';
    leftCard.innerHTML = `
        <div class="card-header">
            <h3>Component source (with @xtest-surface)</h3>
            <span class="badge badge-blue">editable</span>
        </div>
        <textarea id="comp-editor" style="flex:1;font-family:monospace;font-size:.78rem;padding:.9rem 1rem;border:none;outline:none;background:#0f172a;color:#e2e8f0;resize:none;line-height:1.7;tab-size:2" spellcheck="false">${DEFAULT_COMPONENT}</textarea>
    `;

    const rightCard = document.createElement('div');
    rightCard.className = 'card';
    rightCard.style.cssText = 'height:calc(100vh - 3rem);display:flex;flex-direction:column';
    rightCard.innerHTML = `
        <div class="card-header">
            <h3>Extracted SurfaceManifest</h3>
            <span class="badge badge-green">live</span>
        </div>
        <div id="manifest-out" style="flex:1;overflow:auto;padding:.9rem 1rem;background:#0f172a;font-family:monospace;font-size:.78rem;color:#94a3b8;line-height:1.7;white-space:pre"></div>
    `;

    demo.appendChild(leftCard);
    demo.appendChild(rightCard);

    const editor = wrap.querySelector<HTMLTextAreaElement>('#comp-editor')!;
    const out = wrap.querySelector<HTMLElement>('#manifest-out')!;

    function colorize(json: string): string {
        return json
            .replace(/"(type|value|name|aliases|strategy|elements|component)"/g, '<span style="color:#7dd3fc">"$1"</span>')
            .replace(/: "([^"]+)"/g, ': <span style="color:#f9a8d4">"$1"</span>')
            .replace(/: (true|false|null)/g, ': <span style="color:#fb923c">$1</span>')
            .replace(/: (\d+)/g, ': <span style="color:#86efac">$1</span>');
    }

    function update(): void {
        try {
            const manifest = extractManifest(editor.value);
            out.innerHTML = colorize(JSON.stringify(manifest, null, 2));
        } catch (e) {
            out.textContent = String(e);
            out.style.color = '#fca5a5';
        }
    }

    editor.addEventListener('input', update);
    update();

    return wrap;
}
ManifestExtractor.storyName = '2 · Manifest Extractor — live @xtest-surface parsing';

// ── Meta ───────────────────────────────────────────────────────────────────────

const meta: Meta = {
    title: 'xtest/02 · Resolver',
    parameters: {
        docs: {
            description: {
                component: `
**\`Resolver, extractManifest(), defineSurface()\`**

The Resolver maps natural language element references to DOM selectors
using a priority chain: exact name → exact alias → fuzzy match → inference.

Story 1 lets you type any string and see how it resolves.
Story 2 parses a live component source and shows the extracted manifest.
                `,
            },
        },
    },
};

export default meta;
