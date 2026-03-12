/**
 * Network mock / request assertion tests.
 *
 * DSL:
 *   mock GET "/api/users" returning "{ \"users\": [] }"
 *   mock POST "/api/login" with status 401 returning "{ \"error\": \"Unauthorized\" }"
 *   check request "GET /api/users" was made
 *   check request "GET /api/users" was not made
 *   check request "POST /api/login" was called once
 *   check request "POST /api/login" was called 2 times
 *   check request "POST /api/login" was called with "ada@example.com"
 */
import { describe, it, expect } from 'vitest';
import { parseXTest } from '../parser/parser.js';

const MANIFEST = {
    elements: {
        'load-btn':   { name: 'load-btn',   strategy: { type: 'by-ref' as const, value: 'load-btn'   }, aliases: [] },
        'login-btn':  { name: 'login-btn',  strategy: { type: 'by-ref' as const, value: 'login-btn'  }, aliases: [] },
        'email-input':{ name: 'email-input',strategy: { type: 'by-ref' as const, value: 'email-input'}, aliases: [] },
        'result':     { name: 'result',     strategy: { type: 'by-ref' as const, value: 'result'     }, aliases: [] },
    },
};

// HTML where clicking load-btn calls fetch('/api/users') and renders the result
const FETCH_HTML = `<!DOCTYPE html><html><body>
  <button data-xtest="load-btn" onclick="
    fetch('/api/users')
      .then(r => r.json())
      .then(d => { document.querySelector('[data-xtest=result]').textContent = JSON.stringify(d); });
  ">Load</button>
  <div data-xtest="result"></div>
</body></html>`;

// HTML that calls fetch POST on button click with a JSON body
const LOGIN_HTML = `<!DOCTYPE html><html><body>
  <input data-xtest="email-input" type="email" />
  <button data-xtest="login-btn" onclick="
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.querySelector('[data-xtest=email-input]').value })
    });
  ">Login</button>
</body></html>`;

// ── 1. Parser tests ───────────────────────────────────────────────────────────

describe('Parser — mock request step', () => {
    it('parses basic GET mock', () => {
        const src = `suite S\n  scenario "t"\n    mock GET "/api/users" returning "[]"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('mock-request');
        expect(step.method).toBe('GET');
        expect(step.url).toBe('/api/users');
        expect(step.status).toBe(200);
        expect(step.body).toBe('[]');
    });

    it('parses mock with custom status', () => {
        const src = `suite S\n  scenario "t"\n    mock POST "/api/login" with status 401 returning "{ \\"error\\": \\"Unauthorized\\" }"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.status).toBe(401);
        expect(step.method).toBe('POST');
    });

    it('parses mock without body', () => {
        const src = `suite S\n  scenario "t"\n    mock DELETE "/api/item" with status 204\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.status).toBe(204);
        expect(step.body).toBeUndefined();
    });
});

describe('Parser — check request assertions', () => {
    const parse = (assertion: string) => {
        const src = `suite S\n  scenario "t"\n    check request "GET /api/users" ${assertion}\n`;
        return parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
    };

    it('was made', () => expect(parse('was made').assertion).toMatchObject({ op: 'was-made' }));
    it('was not made', () => expect(parse('was not made').assertion).toMatchObject({ op: 'was-not-made' }));
    it('was called once', () => expect(parse('was called once').assertion).toMatchObject({ op: 'was-made-times', count: 1 }));
    it('was called 3 times', () => expect(parse('was called 3 times').assertion).toMatchObject({ op: 'was-made-times', count: 3 }));
    it('was called with body', () =>
        expect(parse('was called with "ada@test.com"').assertion).toMatchObject({ op: 'was-made-with', body: 'ada@test.com' }));

    it('stores method and url correctly', () => {
        const step = parse('was made');
        expect(step.method).toBe('GET');
        expect(step.url).toBe('/api/users');
    });
});

// ── 2. Executor — fetch interception ─────────────────────────────────────────

describe('Executor — mock GET, check response is used', () => {
    it('mocked response is served to the page', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock GET "/api/users" returning "{ \\"users\\": [\\"Ada\\"] }"`,
            `    click load-btn`,
            `    wait 50 ms`,
            `    check result contains "Ada"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

describe('Executor — check request was made', () => {
    it('PASSES after fetch is triggered', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock GET "/api/users" returning "[]"`,
            `    click load-btn`,
            `    check request "GET /api/users" was made`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS when request was never made', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock GET "/api/users" returning "[]"`,
            `    check request "GET /api/users" was made`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — check request was not made', () => {
    it('PASSES when request was never triggered', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock GET "/api/users" returning "[]"`,
            `    check request "GET /api/users" was not made`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS after fetch is triggered', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock GET "/api/users" returning "[]"`,
            `    click load-btn`,
            `    check request "GET /api/users" was not made`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(false);
    });
});

describe('Executor — call count assertions', () => {
    it('was called once — PASSES after single click', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock GET "/api/users" returning "[]"`,
            `    click load-btn`,
            `    check request "GET /api/users" was called once`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('was called 2 times — PASSES after two clicks', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock GET "/api/users" returning "[]"`,
            `    click load-btn`,
            `    click load-btn`,
            `    check request "GET /api/users" was called 2 times`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

describe('Executor — mock with error status', () => {
    it('serves 401 response from mock', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const HTML_STATUS = `<!DOCTYPE html><html><body>
          <button data-xtest="login-btn" onclick="
            fetch('/api/login', { method: 'POST', body: '{}' })
              .then(r => {
                document.querySelector('[data-xtest=result]').textContent = r.status;
              });
          ">Login</button>
          <div data-xtest="result"></div>
        </body></html>`;
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock POST "/api/login" with status 401 returning "{ \\"error\\": \\"Unauthorized\\" }"`,
            `    click login-btn`,
            `    check result contains "401"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML_STATUS);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

describe('Executor — mocks auto-reset between scenarios', () => {
    it('mocks from scenario 1 do not bleed into scenario 2', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "s1"`,
            `    mock GET "/api/users" returning "[]"`,
            `    click load-btn`,
            `    check request "GET /api/users" was called once`,
            `  scenario "s2"`,
            `    mock GET "/api/users" returning "[]"`,
            `    check request "GET /api/users" was not made`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});
