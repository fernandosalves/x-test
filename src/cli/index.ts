#!/usr/bin/env node
/**
 * Miura CLI — miura run
 *
 * Usage:
 *   miura run <glob>                         Run .xtest files, auto-discover manifest
 *   miura run <glob> --component <file>      Explicit component source for manifest
 *   miura run <glob> --map <file>            Explicit .xtest-map.ts manifest
 *   miura run <glob> --html <file>           Mount a static HTML file
 *   miura run <glob> --url <url>             Playwright mode against a live URL
 *   miura run <glob> --reporter tap|pretty   Reporter (default: pretty)
 *   miura run <glob> --timeout <ms>          Step timeout (default: 5000)
 */

import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import process from 'node:process';

import { parseXTest } from '../parser/parser.js';
import { extractManifestFromFile, extractManifest, mergeManifests } from '../manifest/extractor.js';
import { defineSurface } from '../manifest/types.js';
import { JSDOMRunner } from '../runner/jsdom-runner.js';
import { Executor } from '../runner/runner.js';
import { formatTAP } from '../reporter/tap.js';
import { formatPretty } from '../reporter/pretty.js';
import type { SurfaceManifest } from '../manifest/types.js';
import type { RunResult } from '../runner/runner.js';

// ── Argument parsing ────────────────────────────────────────────────────────────

interface CliArgs {
    globs:      string[];
    component?: string;
    map?:       string;
    html?:      string;
    url?:       string;
    reporter:   'pretty' | 'tap';
    timeout:    number;
    verbose:    boolean;
    help:       boolean;
}

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = {
        globs:    [],
        reporter: 'pretty',
        timeout:  5000,
        verbose:  false,
        help:     false,
    };

    const rest = argv.slice(2);
    let i = 0;

    if (rest[0] === 'run') i = 1; // skip 'run' subcommand

    while (i < rest.length) {
        const arg = rest[i]!;
        if (arg === '--help' || arg === '-h')           { args.help    = true; }
        else if (arg === '--verbose' || arg === '-v')   { args.verbose = true; }
        else if (arg === '--component' && rest[i + 1] !== undefined) { args.component = rest[++i] as string; }
        else if (arg === '--map'       && rest[i + 1] !== undefined) { args.map       = rest[++i] as string; }
        else if (arg === '--html'      && rest[i + 1] !== undefined) { args.html      = rest[++i] as string; }
        else if (arg === '--url'       && rest[i + 1] !== undefined) { args.url       = rest[++i] as string; }
        else if (arg === '--reporter'  && rest[i + 1] !== undefined) { args.reporter  = rest[++i] as 'pretty' | 'tap'; }
        else if (arg === '--timeout'   && rest[i + 1] !== undefined) { args.timeout   = Number(rest[++i]); }
        else if (!arg.startsWith('--'))                 { args.globs.push(arg); }
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

    if (args.verbose) process.env['MIURA_VERBOSE'] = '1';

    // Resolve .xtest files
    const { readdirSync, statSync } = await import('node:fs');
    const files: string[] = [];

    function findXTests(dir: string): void {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = resolve(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                findXTests(full);
            } else if (entry.isFile() && entry.name.endsWith('.xtest')) {
                files.push(full);
            }
        }
    }

    for (const pattern of args.globs) {
        const abs = resolve(pattern);
        try {
            const stat = statSync(abs);
            if (stat.isDirectory()) { findXTests(abs); }
            else if (abs.endsWith('.xtest')) { files.push(abs); }
        } catch {
            // Pattern may be a glob or relative — walk CWD
            findXTests(process.cwd());
            break;
        }
    }

    if (files.length === 0) {
        console.error('[miura] No .xtest files matched the provided patterns.');
        process.exit(1);
    }

    // Build manifest
    let manifest: SurfaceManifest = { elements: {} };

    if (args.map) {
        const mapModule = await import(resolve(args.map));
        manifest = mapModule.default ?? mapModule;
    } else if (args.component) {
        manifest = await extractManifestFromFile(resolve(args.component));
    }

    // Load HTML for mounting
    let html: string | undefined;
    if (args.html) {
        html = await readFile(resolve(args.html), 'utf8');
    } else if (!args.url) {
        html = `<!DOCTYPE html><html><body></body></html>`;
    }

    // Run each file
    const allResults: RunResult[] = [];

    for (const file of files) {
        const source   = await readFile(file, 'utf8');
        const ast      = parseXTest(source, file);

        // Try to auto-discover manifest from co-located component
        if (Object.keys(manifest.elements).length === 0) {
            const autoFile = file.replace(/\.xtest$/, '.ts');
            try {
                const autoManifest = await extractManifestFromFile(autoFile);
                manifest = autoManifest;
            } catch {
                // No co-located component — proceed with empty manifest (inference mode)
            }
        }

        const runner   = new JSDOMRunner({ timeout: args.timeout });
        const executor = new Executor(runner, manifest);

        const result   = await executor.runFile(ast, html);
        allResults.push(result);

        await runner.teardown();
    }

    // Aggregate results
    const combined: RunResult = {
        passed:    allResults.every(r => r.passed),
        suites:    allResults.flatMap(r => r.suites),
        total:     allResults.reduce((s, r) => s + r.total, 0),
        totalPass: allResults.reduce((s, r) => s + r.totalPass, 0),
        totalFail: allResults.reduce((s, r) => s + r.totalFail, 0),
        duration:  allResults.reduce((s, r) => s + r.duration, 0),
    };

    // Report
    const output = args.reporter === 'tap'
        ? formatTAP(combined)
        : formatPretty(combined);

    console.log(output);
    process.exit(combined.passed ? 0 : 1);
}

function printHelp(): void {
    console.log(`
  ${'\x1b[1m'}miura\x1b[0m — Plain-language component testing

  \x1b[1mUsage:\x1b[0m
    miura run <glob> [options]

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
    miura run "**/*.xtest"
    miura run login.xtest --component ./login-form.ts
    miura run login.xtest --html ./index.html --reporter tap
`);
}

main().catch(err => {
    console.error('[miura] Fatal error:', err);
    process.exit(1);
});
