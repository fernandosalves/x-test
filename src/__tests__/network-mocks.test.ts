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

// ── 9. Parser — mock with delay ───────────────────────────────────────────────

describe('Parser — mock with delay', () => {
    it('parses "with delay N ms"', () => {
        const src = `suite S\n  scenario "t"\n    mock GET "/api/users" with delay 500 ms returning "[]"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.delayMs).toBe(500);
        expect(step.status).toBe(200);
    });

    it('parses "with status N with delay N"', () => {
        const src = `suite S\n  scenario "t"\n    mock POST "/api/login" with status 401 with delay 200 returning "{}"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.status).toBe(401);
        expect(step.delayMs).toBe(200);
    });

    it('parses delay without ms suffix', () => {
        const src = `suite S\n  scenario "t"\n    mock GET "/api/users" with delay 100 returning "[]"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.delayMs).toBe(100);
    });

    it('delayMs is undefined when not specified', () => {
        const src = `suite S\n  scenario "t"\n    mock GET "/api/users" returning "[]"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.delayMs).toBeUndefined();
    });
});

// ── 10. Parser — wait for function ───────────────────────────────────────────

describe('Parser — wait for function', () => {
    it('parses with default timeout', () => {
        const src = `suite S\n  scenario "t"\n    wait for function "loadData"\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('await-function');
        expect(step.name).toBe('loadData');
        expect(step.timeoutMs).toBe(5000);
    });

    it('parses with explicit timeout', () => {
        const src = `suite S\n  scenario "t"\n    wait for function "initApp" 3000 ms\n`;
        const step = parseXTest(src).suites[0]!.scenarios[0]!.steps[0] as any;
        expect(step.kind).toBe('await-function');
        expect(step.timeoutMs).toBe(3000);
    });
});

// ── 11. Executor — mock with delay ────────────────────────────────────────────

describe('Executor — mock with delay', () => {
    it('still serves the correct response after delay', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    mock GET "/api/users" with delay 80 ms returning "{ \\"users\\": [\\"Ada\\"] }"`,
            `    click load-btn`,
            `    wait 200 ms`,
            `    check result contains "Ada"`,
            `    check request "GET /api/users" was made`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), FETCH_HTML);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });
});

// ── 12. Executor — wait for function ─────────────────────────────────────────

describe('Executor — wait for function', () => {
    it('awaits a global async function', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const HTML_ASYNC = `<!DOCTYPE html><html><body>
          <div data-xtest="result">pending</div>
          <script>
            window.loadData = async function() {
              await new Promise(r => setTimeout(r, 20));
              document.querySelector('[data-xtest=result]').textContent = 'done';
            };
          </script>
        </body></html>`;
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    wait for function "loadData" 2000 ms`,
            `    check result contains "done"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML_ASYNC);
        await runner.teardown();
        expect(r.passed).toBe(true);
    });

    it('FAILS on timeout', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const HTML_SLOW = `<!DOCTYPE html><html><body>
          <script>
            window.slowFn = async function() {
              await new Promise(r => setTimeout(r, 10000));
            };
          </script>
        </body></html>`;
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    wait for function "slowFn" 50 ms`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), HTML_SLOW);
        await runner.teardown();
        expect(r.passed).toBe(false);
        const step = r.suites[0]!.scenarios[0]!.steps[0]!;
        expect(step.error).toMatch(/Timeout/);
    });

    it('FAILS when function does not exist', async () => {
        const { Executor } = await import('../runner/runner.js');
        const { JSDOMRunner } = await import('../runner/jsdom-runner.js');
        const src = [
            `suite S`,
            `  scenario "t"`,
            `    wait for function "nonExistent"`,
        ].join('\n') + '\n';
        const runner = new JSDOMRunner();
        const r = await new Executor(runner, MANIFEST).runFile(parseXTest(src), `<!DOCTYPE html><html><body></body></html>`);
        await runner.teardown();
        expect(r.passed).toBe(false);
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
