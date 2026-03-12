/**
 * Miura — Public API
 *
 * import { xtest, parseXTest, extractManifest, Resolver, JSDOMRunner, Executor } from 'miura';
 */

export { xtest, xtestDirective, annotate, unannotate, queryXtest, queryAllXtest } from './directive/xtest.js';
export type { XtestProps, XtestDirective } from './directive/xtest.js';

export { parseXTest } from './parser/parser.js';
export { Lexer } from './parser/lexer.js';
export { ParseError } from './parser/parser.js';
export type {
    XTestFile, SuiteNode, ScenarioNode, Step,
    ActionStep, AssertStep, StoreStep, WithinStep,
    LoadComponentStep, ApplyFixtureStep, FocusAction,
    RegisterSpyStep, AssertSpyStep, SpyCall, SpyAssertionKind,
    ElementRef, AssertionKind, Loc,
} from './parser/ast.js';

export { extractManifest, extractManifestFromFile, mergeManifests } from './manifest/extractor.js';
export { defineSurface } from './manifest/types.js';
export type { SurfaceManifest, SurfaceElement, ResolutionStrategy, SurfaceDefinition } from './manifest/types.js';

export { Resolver, ResolutionError } from './resolver/resolver.js';
export type { ResolutionResult } from './resolver/resolver.js';

export { Executor } from './runner/runner.js';
export { JSDOMRunner } from './runner/jsdom-runner.js';
export { PlaywrightRunner } from './runner/playwright-runner.js';
export type { MiuraRunner, RunResult, SuiteResult, ScenarioResult, StepResult } from './runner/runner.js';

export { formatTAP } from './reporter/tap.js';
export { formatPretty } from './reporter/pretty.js';
