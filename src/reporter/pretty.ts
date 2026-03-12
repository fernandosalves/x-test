/**
 * Miura — Pretty stdout reporter
 * Coloured, human-readable output for CLI use.
 */

import type { RunResult, SuiteResult, ScenarioResult, StepResult } from '../runner/runner.js';

const C = {
    reset:  '\x1b[0m',
    bold:   '\x1b[1m',
    dim:    '\x1b[2m',
    green:  '\x1b[32m',
    red:    '\x1b[31m',
    yellow: '\x1b[33m',
    cyan:   '\x1b[36m',
    white:  '\x1b[37m',
    gray:   '\x1b[90m',
};

const NO_COLOR = typeof process !== 'undefined' && (process.env['NO_COLOR'] || !process.stdout?.isTTY);

function c(color: keyof typeof C, text: string): string {
    return NO_COLOR ? text : `${C[color]}${text}${C.reset}`;
}

export function formatPretty(result: RunResult): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(c('bold', c('white', 'Miura')));
    lines.push('');

    for (const suite of result.suites) {
        lines.push(c('cyan', `  suite  ${suite.name}`));
        lines.push('');

        for (const scenario of suite.scenarios) {
            const icon   = scenario.passed ? c('green', '  ✓') : c('red', '  ✗');
            const desc   = scenario.passed
                ? c('white', scenario.description)
                : c('bold', c('red', scenario.description));
            const time   = c('gray', `(${scenario.duration}ms)`);
            lines.push(`${icon}  ${desc}  ${time}`);

            if (!scenario.passed || process.env['MIURA_VERBOSE']) {
                for (const step of scenario.steps) {
                    lines.push(formatStep(step, scenario.passed));
                }
            }
        }
        lines.push('');
    }

    // Summary bar
    const passed = result.totalPass;
    const failed = result.totalFail;
    const total  = result.total;
    const bar    = buildBar(passed, total);

    lines.push(bar);
    lines.push('');
    lines.push([
        result.passed ? c('green', c('bold', '  PASS')) : c('red', c('bold', '  FAIL')),
        c('gray', `  ${passed}/${total} scenarios passed`),
        c('gray', `  ${result.duration}ms total`),
    ].join('  '));
    lines.push('');

    return lines.join('\n');
}

function formatStep(step: StepResult, scenarioPassed: boolean): string {
    const prefix = step.passed
        ? c('green', '     ✓  ')
        : c('red',   '     ✗  ');

    const label = step.passed
        ? c('gray', step.step)
        : c('red',  step.step);

    const time = c('gray', `${step.duration}ms`);

    let line = `${prefix}${label}  ${time}`;

    if (step.warning) {
        line += '\n' + c('yellow', `        ⚠  ${step.warning}`);
    }
    if (!step.passed && step.error) {
        line += '\n' + c('red', `        →  ${step.error}`);
    }

    return line;
}

function buildBar(pass: number, total: number): string {
    if (total === 0) return '';
    const width  = 40;
    const filled = Math.round((pass / total) * width);
    const empty  = width - filled;
    const bar    = '█'.repeat(filled) + '░'.repeat(empty);
    const color  = pass === total ? 'green' : pass === 0 ? 'red' : 'yellow';
    return `  ${c(color, bar)}  ${pass}/${total}`;
}
