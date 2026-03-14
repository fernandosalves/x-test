import type { Meta } from '@storybook/html';
import { parseXTest } from '../src/parser/parser.js';
import { Lexer } from '../src/parser/lexer.js';
import type { XTestFile, SuiteNode, ScenarioNode, Step } from '../src/parser/ast.js';

const BASE = `
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; }
.demo { display: grid; grid-template-columns: 1fr 1fr; min-height: 100vh; }
.pane { display: flex; flex-direction: column; border-right: 1px solid #e2e8f0; }
.pane:last-child { border-right: none; }
.pane-header { background: #0f172a; color: #94a3b8; font-family: monospace; font-size: .75rem; padding: .45rem .9rem; display: flex; align-items: center; justify-content: space-between; }
.pane-header strong { color: #e2e8f0; }
.pane-header .badge { font-size: .65rem; font-weight: 700; padding: .1rem .45rem; border-radius: 3px; text-transform: uppercase; letter-spacing: .06em; }
.badge-blue   { background: #1d4ed8; color: white; }
.badge-green  { background: #15803d; color: white; }
.badge-red    { background: #b91c1c; color: white; }
.badge-violet { background: #6d28d9; color: white; }
.editor { flex: 1; font-family: monospace; font-size: .82rem; padding: .9rem 1rem; border: none; outline: none; background: #0f172a; color: #e2e8f0; resize: none; line-height: 1.7; tab-size: 2; }
.output { flex: 1; overflow: auto; padding: .75rem 1rem; background: #0f172a; }
.tree { font-family: monospace; font-size: .75rem; line-height: 1.8; }
.tree .suite-name { color: #c084fc; font-weight: bold; }
.tree .scenario-name { color: #86efac; }
.tree .step-action { color: #7dd3fc; }
.tree .step-element { color: #fbbf24; }
.tree .step-value  { color: #f9a8d4; }
.tree .step-assert { color: #fb923c; }
.tree .dim { color: #475569; }
.tree .indent-1 { padding-left: 1.2rem; }
.tree .indent-2 { padding-left: 2.4rem; }
.tree .indent-3 { padding-left: 3.6rem; }
.error-box { background: #7f1d1d; color: #fca5a5; font-family: monospace; font-size: .78rem; padding: .75rem 1rem; border-radius: 6px; margin: .75rem; white-space: pre-wrap; }
.token-list { font-family: monospace; font-size: .73rem; line-height: 1.75; }
.tok { display: inline-block; margin: .1rem .15rem; padding: .05rem .35rem; border-radius: 3px; cursor: default; }
.tok-SUITE, .tok-SCENARIO, .tok-GIVEN, .tok-SETUP, .tok-TEARDOWN { background: #581c87; color: #e9d5ff; }
.tok-TYPE, .tok-CLICK, .tok-SELECT, .tok-CLEAR, .tok-HOVER, .tok-SCROLL, .tok-WAIT, .tok-NAVIGATE, .tok-RELOAD, .tok-PRESS, .tok-STORE, .tok-CHECK { background: #1e3a5f; color: #93c5fd; }
.tok-STRING { background: #14532d; color: #86efac; }
.tok-IDENT  { background: #1c1917; color: #d6d3d1; border: 1px solid #292524; }
.tok-VARIABLE { background: #78350f; color: #fde68a; }
.tok-NUMBER   { background: #164e63; color: #a5f3fc; }
.tok-INDENT   { background: #1e1b4b; color: #818cf8; }
.tok-DEDENT   { background: #1e1b4b; color: #6366f1; }
.tok-EOF      { background: #1c1917; color: #57534e; }
.tok-IS, .tok-NOT, .tok-CONTAINS, .tok-HAS, .tok-EQUALS, .tok-MATCHES, .tok-VISIBLE, .tok-HIDDEN, .tok-ABSENT, .tok-PRESENT, .tok-ENABLED, .tok-DISABLED { background: #3b0764; color: #d8b4fe; }
.tok-INTO, .tok-IN, .tok-FOR, .tok-TO, .tok-AS, .tok-ON, .tok-PAGE, .tok-MS, .tok-VALUE, .tok-TEXT, .tok-FOCUS_KW { background: #0c4a6e; color: #7dd3fc; }
`;

const DEFAULT_XTEST = `suite UserLogin

  scenario "Successful login"
    type "ada@example.com" into username-input
    type "hunter2"         into password-input
    click submit-button
    check error-message is absent
    check dashboard     is visible

  scenario "Wrong password"
    type "ada@example.com" into username-input
    type "wrong"           into password-input
    click submit-button
    check error-message is visible
    check error-message contains "Invalid credentials"

  scenario "Store and assert"
    type "ada@example.com" into username-input
    store username-input value as $email
    check $email equals "ada@example.com"
`;

// ── Story 1 — DSL Live Editor ──────────────────────────────────────────────────

export function DSLPlayground(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<style>${BASE}</style>`;

    const demo = document.createElement('div');
    demo.className = 'demo';
    demo.style.cssText = 'grid-template-columns: 1fr 1fr 1fr';
    wrap.appendChild(demo);

    // Left pane — editor
    const editorPane = document.createElement('div');
    editorPane.className = 'pane';
    editorPane.innerHTML = `
        <div class="pane-header"><strong>.xtest source</strong><span class="badge badge-blue">editable</span></div>
        <textarea class="editor" id="xtest-editor" spellcheck="false">${DEFAULT_XTEST}</textarea>
    `;

    // Middle pane — AST
    const astPane = document.createElement('div');
    astPane.className = 'pane';
    astPane.innerHTML = `
        <div class="pane-header"><strong>AST (parsed)</strong><span class="badge badge-green">live</span></div>
        <div class="output" id="ast-output"></div>
    `;

    // Right pane — token stream
    const tokenPane = document.createElement('div');
    tokenPane.className = 'pane';
    tokenPane.innerHTML = `
        <div class="pane-header"><strong>Token stream</strong><span class="badge badge-violet">lexer</span></div>
        <div class="output" id="token-output"></div>
    `;

    demo.appendChild(editorPane);
    demo.appendChild(astPane);
    demo.appendChild(tokenPane);

    const editor = wrap.querySelector<HTMLTextAreaElement>('#xtest-editor')!;
    const astOut = wrap.querySelector<HTMLElement>('#ast-output')!;
    const tokOut = wrap.querySelector<HTMLElement>('#token-output')!;

    function renderAST(file: XTestFile): void {
        const lines: string[] = [];
        for (const suite of file.suites) {
            lines.push(`<div class="tree"><span class="dim">suite </span><span class="suite-name">${suite.name}</span></div>`);
            for (const scenario of suite.scenarios) {
                lines.push(`<div class="tree indent-1"><span class="dim">scenario </span><span class="scenario-name">"${scenario.description}"</span></div>`);
                for (const step of [...scenario.given, ...scenario.steps]) {
                    lines.push(renderStep(step));
                }
            }
        }
        astOut.innerHTML = lines.join('');
    }

    function renderStep(step: Step): string {
        const s = step as any;
        if (step.kind === 'action') {
            const el = s.element ? `<span class="step-element">${s.element.value}</span>` : '';
            const val = s.value ? ` <span class="step-value">"${s.value}"</span>` : s.url ? ` <span class="step-value">"${s.url}"</span>` : s.key ? ` <span class="step-value">"${s.key}"</span>` : s.ms ? ` <span class="step-value">${s.ms}ms</span>` : '';
            return `<div class="tree indent-2"><span class="step-action">${s.action}</span>${val}${el ? ' <span class="dim">→</span> ' + el : ''}</div>`;
        }
        if (step.kind === 'assert-element') {
            const neg = s.negated ? '<span class="step-assert">not </span>' : '';
            return `<div class="tree indent-2"><span class="dim">check </span><span class="step-element">${s.element.value}</span> <span class="dim">│</span> ${neg}<span class="step-assert">${JSON.stringify(s.assertion.op).replace(/"/g, '')}</span>${s.assertion.state ? ' <span class="step-value">' + s.assertion.state + '</span>' : s.assertion.value ? ' <span class="step-value">"' + s.assertion.value + '"</span>' : ''}</div>`;
        }
        if (step.kind === 'assert-variable') {
            return `<div class="tree indent-2"><span class="dim">check </span><span class="step-value">$${s.variable}</span> <span class="step-assert">${s.op}</span> <span class="step-value">"${s.value}"</span></div>`;
        }
        if (step.kind === 'store') {
            return `<div class="tree indent-2"><span class="step-action">store</span> <span class="step-element">${s.element.value}</span> <span class="dim">→</span> <span class="step-value">$${s.variable}</span></div>`;
        }
        return '';
    }

    function renderTokens(source: string): void {
        const tokens = new Lexer(source).tokenize();
        const html = tokens.map((t: any) => {
            const label = t.type === 'STRING' ? `"${t.value}"` : t.type === 'VARIABLE' ? `$${t.value}` : t.value || t.type;
            return `<span class="tok tok-${t.type}" title="${t.type} @ ${t.line}:${t.column}">${escHtml(label)}</span>`;
        }).join(' ');
        tokOut.innerHTML = `<div class="token-list">${html}</div>`;
    }

    function escHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function update(): void {
        const src = editor.value;
        try {
            const ast = parseXTest(src);
            renderAST(ast);
        } catch (e) {
            astOut.innerHTML = `<div class="error-box">${escHtml(String(e))}</div>`;
        }
        renderTokens(src);
    }

    editor.addEventListener('input', () => update());
    update();

    return wrap;
}
DSLPlayground.storyName = '1 · DSL Live Playground — edit .xtest, see AST + tokens';

// ── Meta ───────────────────────────────────────────────────────────────────────

const meta: Meta = {
    title: 'xtest/01 · DSL Playground',
    parameters: {
        docs: {
            description: {
                component: `
**xtest DSL** — Edit the \`.xtest\` source in the left pane.
The AST (middle) and token stream (right) update live.

The DSL grammar is indentation-sensitive:
- \`suite\` → top-level container
- \`scenario\` → one test case
- \`type / click / select / clear / press / wait\` → actions
- \`check\` → assertions
- \`store ... as $var\` → capture values
                `,
            },
        },
    },
};

export default meta;
