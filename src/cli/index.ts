#!/usr/bin/env node
/**
 * xtest CLI — xtest run
 *
 * Usage:
 *   xtest run   <glob> [options]   Run .xtest files once
 *   xtest watch <glob> [options]   Re-run on every .xtest save
 *
 *   --component <file>   Component source to extract manifest from
 *   --map <file>         Explicit .xtest-map.ts manifest file
 *   --html <file>        Static HTML file to mount (JSDOM mode)
 *   --url <url>          Playwright mode against a live URL
 *   --reporter tap|pretty
 *   --timeout <ms>       Step timeout (default: 5000)
 *   --verbose
 */

import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import process from 'node:process';

import { parseXTest } from '../parser/parser.js';
import { extractManifestFromFile, extractManifest, mergeManifests } from '../manifest/extractor.js';
import { defineSurface } from '../manifest/types.js';
import { JSDOMRunner } from '../runner/jsdom-runner.js';
import { PlaywrightRunner } from '../runner/playwright-runner.js';
import { Executor } from '../runner/runner.js';
import { formatTAP } from '../reporter/tap.js';
import { formatPretty } from '../reporter/pretty.js';
import type { SurfaceManifest } from '../manifest/types.js';
import type { RunResult } from '../runner/runner.js';

// ── Argument parsing ────────────────────────────────────────────────────────────

interface CliArgs {
    subcommand: 'run' | 'watch';
    globs: string[];
    component?: string;
    map?: string;
    html?: string;
    url?: string;
    reporter: 'pretty' | 'tap';
    timeout: number;
    verbose: boolean;
    help: boolean;
}

async function loadPlaywright(): Promise<typeof import('@playwright/test')> {
    try {
        return await import('@playwright/test');
    } catch (err) {
        const hint = err instanceof Error ? err.message : String(err);
        throw new Error(`[@xtest] Playwright mode requires installing @playwright/test (npm install -D @playwright/test). Original error: ${hint}`);
    }
}

function parseArgs(argv: string[]): CliArgs {
    const rest = argv.slice(2);
    let i = 0;

    const subcommand: 'run' | 'watch' =
        rest[0] === 'watch' ? 'watch' : 'run';

    if (rest[0] === 'run' || rest[0] === 'watch') i = 1;

    const args: CliArgs = {
        subcommand,
        globs: [],
        reporter: 'pretty',
        timeout: 5000,
        verbose: false,
        help: false,
    };

    while (i < rest.length) {
        const arg = rest[i]!;
        if (arg === '--help' || arg === '-h') { args.help = true; }
        else if (arg === '--verbose' || arg === '-v') { args.verbose = true; }
        else if (arg === '--component' && rest[i + 1] !== undefined) { args.component = rest[++i] as string; }
        else if (arg === '--map' && rest[i + 1] !== undefined) { args.map = rest[++i] as string; }
        else if (arg === '--html' && rest[i + 1] !== undefined) { args.html = rest[++i] as string; }
        else if (arg === '--url' && rest[i + 1] !== undefined) { args.url = rest[++i] as string; }
        else if (arg === '--reporter' && rest[i + 1] !== undefined) { args.reporter = rest[++i] as 'pretty' | 'tap'; }
        else if (arg === '--timeout' && rest[i + 1] !== undefined) { args.timeout = Number(rest[++i]); }
        else if (!arg.startsWith('--')) { args.globs.push(arg); }
        i++;
    }

    return args;
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const args = parseArgs(process.argv);

    if (args.help || args.globs.length === 0) {
        printHelp();
        process.exit(0);
    }

    if (args.verbose) process.env['xtest_VERBOSE'] = '1';

    const { readdirSync, statSync, watch: fsWatch } = await import('node:fs');

    // ── File discovery ──────────────────────────────────────────────────────
    function findXTests(pattern: string): string[] {
        const found: string[] = [];
        const abs = resolve(pattern);
        try {
            const stat = statSync(abs);
            if (stat.isDirectory()) {
                (function walk(dir: string) {
                    for (const entry of readdirSync(dir, { withFileTypes: true })) {
                        const full = resolve(dir, entry.name);
                        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                            walk(full);
                        } else if (entry.isFile() && entry.name.endsWith('.xtest')) {
                            found.push(full);
                        }
                    }
                })(abs);
            } else if (abs.endsWith('.xtest')) {
                found.push(abs);
            }
        } catch {
            (function walk(dir: string) {
                for (const entry of readdirSync(dir, { withFileTypes: true })) {
                    const full = resolve(dir, entry.name);
                    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        walk(full);
                    } else if (entry.isFile() && entry.name.endsWith('.xtest')) {
                        found.push(full);
                    }
                }
            })(process.cwd());
        }
        return found;
    }

    const files = [...new Set(args.globs.flatMap(findXTests))];

    if (files.length === 0) {
        console.error('[xtest] No .xtest files matched the provided patterns.');
        process.exit(1);
    }

    // ── Manifest + HTML loading ─────────────────────────────────────────────
    async function buildManifest(): Promise<SurfaceManifest> {
        if (args.map) {
            const m = await import(resolve(args.map));
            return m.default ?? m;
        }
        if (args.component) return extractManifestFromFile(resolve(args.component));
        return { elements: {} };
    }

    async function loadHtml(): Promise<string | undefined> {
        if (args.html) return readFile(resolve(args.html), 'utf8');
        if (!args.url) return `<!DOCTYPE html><html><body></body></html>`;
        return undefined;
    }

    // ── Single run ──────────────────────────────────────────────────────────
    async function runOnce(targetFiles: string[]): Promise<boolean> {
        let manifest = await buildManifest();
        const html = args.url ? undefined : await loadHtml();
        const allResults: RunResult[] = [];

        for (const file of targetFiles) {
            const source = await readFile(file, 'utf8');
            const ast = parseXTest(source, file);

            if (Object.keys(manifest.elements).length === 0) {
                const autoFile = file.replace(/\.xtest$/, '.ts');
                try { manifest = await extractManifestFromFile(autoFile); } catch { /* inference mode */ }
            }

            if (args.url) {
                const { chromium } = await loadPlaywright();
                let browser: import('@playwright/test').Browser | undefined;
                let page: import('@playwright/test').Page | undefined;
                try {
                    browser = await chromium.launch();
                    page = await browser.newPage();
                    const runner = new PlaywrightRunner(page, { timeout: args.timeout });
                    if (args.url) await runner.navigate(args.url);
                    const executor = new Executor(runner, manifest);
                    const result = await executor.runFile(ast, undefined);
                    allResults.push(result);
                    await runner.teardown();
                } finally {
                    await page?.close().catch(() => { });
                    await browser?.close().catch(() => { });
                }
            } else {
                const runner = new JSDOMRunner({ timeout: args.timeout });
                const executor = new Executor(runner, manifest);
                const result = await executor.runFile(ast, html);
                allResults.push(result);
                await runner.teardown();
            }
        }

        const combined: RunResult = {
            passed: allResults.every(r => r.passed),
            suites: allResults.flatMap(r => r.suites),
            total: allResults.reduce((s, r) => s + r.total, 0),
            totalPass: allResults.reduce((s, r) => s + r.totalPass, 0),
            totalFail: allResults.reduce((s, r) => s + r.totalFail, 0),
            totalSkipped: allResults.reduce((s, r) => s + r.totalSkipped, 0),
            duration: allResults.reduce((s, r) => s + r.duration, 0),
        };

        const output = args.reporter === 'tap' ? formatTAP(combined) : formatPretty(combined);
        console.log(output);
        return combined.passed;
    }

    // ── Run once mode ───────────────────────────────────────────────────────
    if (args.subcommand === 'run') {
        const passed = await runOnce(files);
        process.exit(passed ? 0 : 1);
        return;
    }

    // ── Watch mode ──────────────────────────────────────────────────────────
    const CLEAR = '\x1Bc';
    const DIM = '\x1b[2m';
    const RESET = '\x1b[0m';
    const CYAN = '\x1b[36m';

    console.log(`${CYAN}xtest watch${RESET}  watching ${files.length} file(s)\u2026  ${DIM}(Ctrl+C to stop)${RESET}\n`);

    await runOnce(files);

    const debounceMap = new Map<string, ReturnType<typeof setTimeout>>();

    function scheduleRun(changedFile: string): void {
        const existing = debounceMap.get(changedFile);
        if (existing) clearTimeout(existing);
        debounceMap.set(changedFile, setTimeout(async () => {
            debounceMap.delete(changedFile);
            process.stdout.write(CLEAR);
            const ts = new Date().toLocaleTimeString();
            console.log(`${CYAN}xtest watch${RESET}  ${DIM}${ts} \u2014 ${changedFile}${RESET}\n`);
            await runOnce([changedFile]);
        }, 120));
    }

    const watchedDirs = new Set<string>();
    const { dirname } = await import('node:path');

    for (const file of files) {
        fsWatch(file, (eventType) => {
            if (eventType === 'change' || eventType === 'rename') scheduleRun(file);
        });

        const dir = dirname(file);
        if (!watchedDirs.has(dir)) {
            watchedDirs.add(dir);
            fsWatch(dir, (_, filename) => {
                if (filename?.endsWith('.xtest')) {
                    const full = resolve(dir, filename);
                    if (!files.includes(full)) {
                        files.push(full);
                        scheduleRun(full);
                    }
                }
            });
        }
    }

    process.stdin.resume();
}

function printHelp(): void {
    console.log(`
  ${'\x1b[1m'}xtest\x1b[0m — Plain-language component testing

  \x1b[1mUsage:\x1b[0m
    xtest run   <glob> [options]    Run .xtest files once
    xtest watch <glob> [options]    Re-run on every .xtest save

  \x1b[1mOptions:\x1b[0m
    --component <file>   Component source to extract manifest from
    --map <file>         Explicit .xtest-map.ts manifest file
    --html <file>        Static HTML file to mount (JSDOM mode)
    --url <url>          Live URL to test against (Playwright mode)
    --reporter <name>    Reporter: pretty (default) | tap
    --timeout <ms>       Step timeout in ms (default: 5000)
    --verbose            Show all steps, not just failures
    --help               Show this help

  \x1b[1mExamples:\x1b[0m
    xtest run   "**/*.xtest"
    xtest watch "**/*.xtest"
    xtest run   login.xtest --component ./login-form.ts
    xtest run   login.xtest --html ./index.html --reporter tap
`);
}

main().catch(err => {
    console.error('[xtest] Fatal error:', err);
    process.exit(1);
});
