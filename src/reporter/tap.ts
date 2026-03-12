/**
 * Miura — TAP v13 Reporter
 * Compatible with all CI systems (GitHub Actions, CircleCI, Jest, etc.)
 */

import type { RunResult, SuiteResult, ScenarioResult } from '../runner/runner.js';

export function formatTAP(result: RunResult): string {
    const lines: string[] = [];
    let testNum = 0;

    lines.push('TAP version 13');

    for (const suite of result.suites) {
        lines.push(`# Suite: ${suite.name}`);
        for (const scenario of suite.scenarios) {
            testNum++;
            if (scenario.passed) {
                lines.push(`ok ${testNum} - ${scenario.description}`);
            } else {
                lines.push(`not ok ${testNum} - ${scenario.description}`);
                const failedStep = scenario.steps.find(s => !s.passed);
                if (failedStep) {
                    lines.push('  ---');
                    lines.push(`  message: '${failedStep.error?.replace(/'/g, "\\'") ?? 'Unknown error'}'`);
                    lines.push(`  step: '${failedStep.step}'`);
                    lines.push(`  duration: ${failedStep.duration}ms`);
                    lines.push('  ...');
                }
            }
            // Sub-step diagnostics
            for (const step of scenario.steps) {
                const icon = step.passed ? '✓' : '✗';
                lines.push(`  # ${icon} ${step.step} (${step.duration}ms)`);
                if (step.warning) lines.push(`  # ⚠ ${step.warning}`);
            }
        }
    }

    lines.push(`1..${testNum}`);
    lines.push(`# tests ${testNum}`);
    lines.push(`# pass  ${result.totalPass}`);
    lines.push(`# fail  ${result.totalFail}`);
    lines.push(`# time  ${result.duration}ms`);

    return lines.join('\n');
}
