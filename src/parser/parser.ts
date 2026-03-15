/**
 * xtest — Parser
 *
 * Consumes the token stream from the Lexer and produces a typed XTestFile AST.
 */

import { Lexer } from './lexer.js';
import type { Token, TokenType } from './lexer.js';
import type {
    XTestFile, SuiteNode, ScenarioNode, Step,
    ActionStep, AssertStep, StoreStep,
    ElementRef, AssertionKind, VisibilityState, InputState,
    TypeAction, ClickAction, SelectAction, ClearAction,
    HoverAction, ScrollAction, WaitForAction, WaitMsAction,
    NavigateAction, ReloadAction, PressAction, FocusAction,
    BlurAction, FillAction,
    LoadComponentStep, ApplyFixtureStep,
    RegisterSpyStep, ResetSpyStep, AssertSpyStep, SpyAssertionKind,
    TakeScreenshotStep, CheckA11yStep, A11yViolation,
    MockRequestStep, AssertRequestStep, RequestAssertionKind, RequestCall, AwaitFunctionStep,
    AssertElementStep, AssertVariableStep,
    Loc, ScopeFilter,
} from './ast.js';

export class ParseError extends Error {
    constructor(message: string, public readonly loc: Loc) {
        super(`[xtest] Parse error at ${loc.file ?? '<input>'}:${loc.line}:${loc.column} — ${message}`);
    }
}

export class Parser {
    private _tokens: Token[];
    private _pos: number = 0;
    private _file?: string;

    constructor(tokens: Token[], file?: string) {
        this._tokens = tokens;
        if (file !== undefined) this._file = file;
    }

    parse(): XTestFile {
        const suites: SuiteNode[] = [];
        while (!this._at('EOF')) {
            this._skipNewlines();
            if (this._at('EOF')) break;
            if (this._at('SUITE')) { suites.push(this._parseSuite(false, false)); }
            else if (this._at('XSUITE')) { suites.push(this._parseSuite(true, false)); }
            else if (this._at('ONLY')) {
                this._advance();
                if (this._at('SUITE')) { suites.push(this._parseSuite(false, true)); }
                else this._advance();
            } else {
                this._advance();
            }
        }
        const result: XTestFile = { suites };
        if (this._file !== undefined) result.file = this._file;
        return result;
    }

    // ── Suite ─────────────────────────────────────────────────────────────────

    private _parseSuite(skipped = false, focused = false): SuiteNode {
        const loc = this._loc();
        if (skipped) this._expect('XSUITE');
        else this._expect('SUITE');
        const name = this._expectIdent('suite name');

        this._skipNewlines();
        this._expect('INDENT');

        let setup: Step[] = [];
        let teardown: Step[] = [];
        let beforeEach: Step[] = [];
        let afterEach: Step[] = [];
        const scenarios: ScenarioNode[] = [];

        while (!this._at('DEDENT') && !this._at('EOF')) {
            this._skipNewlines();
            if (this._at('SETUP')) {
                this._advance();
                this._skipNewlines();
                this._expect('INDENT');
                setup = this._parseSteps();
                this._tryExpect('DEDENT');
            } else if (this._at('TEARDOWN')) {
                this._advance();
                this._skipNewlines();
                this._expect('INDENT');
                teardown = this._parseSteps();
                this._tryExpect('DEDENT');
            } else if (this._at('BEFORE_EACH')) {
                this._advance();
                this._skipNewlines();
                this._expect('INDENT');
                beforeEach = this._parseSteps();
                this._tryExpect('DEDENT');
            } else if (this._at('AFTER_EACH')) {
                this._advance();
                this._skipNewlines();
                this._expect('INDENT');
                afterEach = this._parseSteps();
                this._tryExpect('DEDENT');
            } else if (this._at('SCENARIO')) { scenarios.push(this._parseScenario(false, false)); }
            else if (this._at('XSCENARIO')) { scenarios.push(this._parseScenario(true, false)); }
            else if (this._at('ONLY')) {
                this._advance();
                if (this._at('SCENARIO')) { scenarios.push(this._parseScenario(false, true)); }
                else this._advance();
            } else {
                this._advance();
            }
        }

        this._tryExpect('DEDENT');
        return { kind: 'suite', name, setup, teardown, beforeEach, afterEach, scenarios, skipped, focused, loc };
    }

    // ── Scenario ──────────────────────────────────────────────────────────────

    private _parseScenario(skipped = false, focused = false): ScenarioNode {
        const loc = this._loc();
        if (skipped) this._expect('XSCENARIO');
        else this._expect('SCENARIO');
        const description = this._expectString('scenario description');

        this._skipNewlines();
        this._expect('INDENT');

        let given: Step[] = [];
        let steps: Step[] = [];

        if (this._at('GIVEN')) {
            this._advance();
            this._skipNewlines();
            this._expect('INDENT');
            given = this._parseSteps();
            this._tryExpect('DEDENT');
        }

        steps = this._parseSteps();
        this._tryExpect('DEDENT');

        return { kind: 'scenario', description, given, steps, skipped, focused, loc };
    }

    // ── Steps ─────────────────────────────────────────────────────────────────

    private _parseSteps(): Step[] {
        const steps: Step[] = [];
        while (!this._at('DEDENT') && !this._at('EOF')) {
            this._skipNewlines();
            if (this._at('DEDENT') || this._at('EOF')) break;
            const step = this._parseStep();
            if (step) steps.push(step);
        }
        return steps;
    }

    private _parseStep(): Step | null {
        const tok = this._peek();
        if (!tok) return null;

        switch (tok.type) {
            case 'TYPE': return this._parseTypeStep();
            case 'CLICK': return this._parseClickStep('click');
            case 'SELECT': return this._parseSelectStep();
            case 'CLEAR': return this._parseClearStep();
            case 'HOVER': return this._parseHoverStep();
            case 'SCROLL': return this._parseScrollStep();
            case 'WAIT': return this._parseWaitStep();
            case 'NAVIGATE': return this._parseNavigateStep();
            case 'RELOAD': return this._parseReloadStep();
            case 'PRESS': return this._parsePressStep();
            case 'CHECK': return this._parseCheckStep();
            case 'STORE': return this._parseStoreStep();
            case 'WITHIN': return this._parseWithinStep();
            case 'FOCUS_KW': return this._parseFocusStep();
            case 'COMPONENT': return this._parseLoadComponentStep();
            case 'FIXTURE': return this._parseApplyFixtureStep();
            case 'REGISTER': return this._parseRegisterSpyStep();
            case 'RESET': return this._parseResetSpyStep();
            case 'BLUR': return this._parseBlurStep();
            case 'FILL': return this._parseFillStep();
            case 'TAKE': return this._parseTakeScreenshotStep();
            case 'MOCK': return this._parseMockRequestStep();
            case 'IDENT':
                // Handle "double-click" and "right-click" as IDENT tokens
                if (tok.value.toLowerCase() === 'double-click') return this._parseClickStep('double-click');
                if (tok.value.toLowerCase() === 'right-click') return this._parseClickStep('right-click');
                this._advance();
                return null;
            default:
                this._advance();
                return null;
        }
    }

    // ── Action steps ──────────────────────────────────────────────────────────

    private _parseTypeStep(): Step {
        const loc = this._loc();
        this._expect('TYPE');
        const value = this._expectString('"text to type"');
        this._expect('INTO');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'type', element, value, loc } as TypeAction & { kind: 'action' };
    }

    private _parseClickStep(action: 'click' | 'double-click' | 'right-click'): Step {
        const loc = this._loc();
        this._advance(); // consume click/double-click/right-click
        const element = this._parseElementRef();
        return { kind: 'action', action, element, loc } as ClickAction & { kind: 'action' };
    }

    private _parseSelectStep(): Step {
        const loc = this._loc();
        this._expect('SELECT');
        let by: 'label' | 'value' = 'label';
        if (this._at('VALUE')) { this._advance(); by = 'value'; }
        const value = this._expectString('"option text or value"');
        this._tryExpect('IN');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'select', element, value, by, loc } as SelectAction & { kind: 'action' };
    }

    private _parseClearStep(): Step {
        const loc = this._loc();
        this._expect('CLEAR');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'clear', element, loc } as ClearAction & { kind: 'action' };
    }

    private _parseHoverStep(): Step {
        const loc = this._loc();
        this._expect('HOVER');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'hover', element, loc } as HoverAction & { kind: 'action' };
    }

    private _parseScrollStep(): Step {
        const loc = this._loc();
        this._expect('SCROLL');
        this._tryExpect('TO');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'scroll-to', element, loc } as ScrollAction & { kind: 'action' };
    }

    private _parseWaitStep(): Step {
        const loc = this._loc();
        this._expect('WAIT');
        if (this._at('NUMBER')) {
            const ms = Number(this._advance().value);
            this._tryExpect('MS');
            return { kind: 'action', action: 'wait-ms', ms, loc } as WaitMsAction & { kind: 'action' };
        }
        this._tryExpect('FOR');
        // wait for function "name" [N ms]
        if (this._at('FUNCTION_KW')) {
            this._advance();
            const name = this._expectString('"function name"');
            let timeoutMs = 5000;
            if (this._at('NUMBER')) {
                timeoutMs = Number(this._advance().value);
                this._tryExpect('MS');
            }
            return { kind: 'await-function', name, timeoutMs, loc } satisfies AwaitFunctionStep;
        }
        const element = this._parseElementRef();
        // optional inline timeout: wait for submit-button 3000 ms
        let timeoutMs: number | undefined;
        if (this._at('NUMBER')) {
            timeoutMs = Number(this._advance().value);
            this._tryExpect('MS');
        }
        return { kind: 'action', action: 'wait-for', element, ...(timeoutMs !== undefined ? { timeoutMs } : {}), loc } as WaitForAction & { kind: 'action' };
    }

    private _parseNavigateStep(): Step {
        const loc = this._loc();
        this._expect('NAVIGATE');
        this._tryExpect('TO');
        const url = this._expectString('"URL"');
        return { kind: 'action', action: 'navigate', url, loc } as NavigateAction & { kind: 'action' };
    }

    private _parseReloadStep(): Step {
        const loc = this._loc();
        this._expect('RELOAD');
        this._tryExpect('PAGE');
        return { kind: 'action', action: 'reload', loc } as ReloadAction & { kind: 'action' };
    }

    private _parsePressStep(): Step {
        const loc = this._loc();
        this._expect('PRESS');
        const key = this._expectString('"key name"');
        return { kind: 'action', action: 'press', key, loc } as PressAction & { kind: 'action' };
    }

    // ── Check step ────────────────────────────────────────────────────────────

    private _parseCheckStep(): Step {
        const loc = this._loc();
        this._expect('CHECK');

        // check page has no a11y violations
        if (this._at('PAGE')) {
            return this._parseCheckA11yStep(loc);
        }

        // check request "METHOD url" was made / was called N times / ...
        if (this._at('REQUEST')) {
            return this._parseAssertRequestStep(loc);
        }

        // check spy "name" ...
        if (this._at('SPY')) {
            this._advance();
            const spyName = this._expectString('"spy name"');
            let assertion: SpyAssertionKind;
            if (this._at('LAST')) {
                this._advance();
                this._expect('RETURNED_KW');
                const value = this._expectString('"expected return value"');
                assertion = { op: 'last-returned', value };
            } else {
                assertion = this._parseSpyAssertion();
            }
            return { kind: 'assert-spy', spyName, assertion, loc } satisfies AssertSpyStep;
        }

        // check $var [not] equals/matches "..."
        if (this._at('VARIABLE')) {
            const variable = this._advance().value;
            const negated = this._at('NOT') ? (this._advance(), true) : false;
            const op = this._at('EQUALS') ? (this._advance(), 'equals' as const)
                : (this._expect('MATCHES'), 'matches' as const);
            const value = this._expectString('"expected value"');
            return { kind: 'assert-variable', variable, op, value, negated, loc } satisfies AssertVariableStep;
        }

        const element = this._parseElementRef();

        // check <element> has no a11y violations
        if (this._at('HAS') && this._peekAt(1)?.type === 'NOT' && this._peekAt(2)?.type === 'A11Y') {
            this._advance(); // HAS
            this._advance(); // NOT
            this._advance(); // A11Y
            this._tryExpect('VIOLATIONS');
            return { kind: 'check-a11y', selector: element.value, loc } satisfies CheckA11yStep;
        }

        const negated = this._at('NOT') ? (this._advance(), true) : false;

        // "is not" — negation as two tokens
        const assertion = this._parseAssertion(negated);
        return { kind: 'assert-element', element, assertion, negated, loc } satisfies AssertElementStep;
    }

    private _parseAssertion(negated: boolean): AssertionKind {
        if (this._at('IS')) {
            this._advance();
            // "is not" — second negation token
            const actualNegated = this._at('NOT') ? (this._advance(), true) : negated;
            return this._parseStateAssertion();
        }
        if (this._at('CONTAINS')) {
            this._advance();
            const value = this._expectString('"text"');
            return { op: 'contains', value };
        }
        if (this._at('HAS')) {
            this._advance();
            if (this._at('VALUE')) {
                this._advance();
                const value = this._expectString('"expected value"');
                return { op: 'has-value', value };
            }
            if (this._at('TEXT')) {
                this._advance();
                const value = this._expectString('"expected text"');
                return { op: 'has-text', value };
            }
            if (this._at('FOCUS_KW')) {
                this._advance();
                return { op: 'has-focus' };
            }
            if (this._at('CLASS')) {
                this._advance();
                const value = this._expectString('"class name"');
                return { op: 'has-class', value };
            }
            if (this._at('COUNT')) {
                this._advance();
                if (!this._at('NUMBER')) throw new ParseError('Expected number after "count"', this._loc());
                const count = Number(this._advance().value);
                return { op: 'has-count', count };
            }
            if (this._at('PROP')) {
                this._advance();
                const name = this._expectString('"prop name"');
                this._expect('EQUALS');
                const value = this._expectString('"prop value"');
                return { op: 'has-prop', name, value };
            }
            if (this._at('ARIA')) {
                this._advance();
                const name = this._expectString('"aria attribute name"');
                const value = this._expectString('"expected value"');
                return { op: 'has-aria', name, value };
            }
            if (this._at('ROLE_KW')) {
                this._advance();
                const role = this._expectString('"role name"');
                return { op: 'has-role', role };
            }
            if (this._at('ACCESSIBLE')) {
                this._advance();
                this._tryExpect('NAME_KW');
                const value = this._expectString('"accessible name"');
                return { op: 'has-accessible-name', value };
            }
            if (this._at('ALT')) {
                this._advance();
                const value = this._expectString('"alt text"');
                return { op: 'has-alt', value };
            }
            if (this._at('ATTR')) {
                this._advance();
                const name = this._expectString('"attr name"');
                // check X has attr "name" equals "value"
                if (this._at('EQUALS')) {
                    this._advance();
                    const value = this._expectString('"attr value"');
                    return { op: 'has-attr', name, value };
                }
                // check X has attr "name" is present / is absent
                if (this._at('IS')) {
                    this._advance();
                    const state = this._at('ABSENT')
                        ? (this._advance(), 'absent' as const)
                        : (this._tryExpect('PRESENT'), 'present' as const);
                    return { op: 'has-attr', name, state };
                }
                // bare: check X has attr "name"  →  presence check
                return { op: 'has-attr', name, state: 'present' };
            }
        }
        if (this._at('MATCHES')) {
            this._advance();
            const pattern = this._expectString('"pattern"');
            return { op: 'matches', pattern };
        }
        throw new ParseError('Expected assertion keyword (is, contains, has, matches)', this._loc());
    }

    private _parseStateAssertion(): AssertionKind {
        const VISIBILITY: Record<string, VisibilityState> = {
            VISIBLE: 'visible', HIDDEN: 'hidden', ABSENT: 'absent', PRESENT: 'present',
        };
        const INPUT_STATE: Record<string, InputState> = {
            ENABLED: 'enabled', DISABLED: 'disabled', CHECKED: 'checked',
            UNCHECKED: 'unchecked', READONLY: 'readonly', FOCUS_KW: 'focused', FOCUSABLE: 'focusable',
        };

        const tok = this._peek();
        if (!tok) throw new ParseError('Expected state keyword', this._loc());

        if (tok.type in VISIBILITY) {
            this._advance();
            return { op: 'is-visibility', state: VISIBILITY[tok.type] as VisibilityState };
        }
        if (tok.type in INPUT_STATE) {
            this._advance();
            return { op: 'is-input-state', state: INPUT_STATE[tok.type] as InputState };
        }
        if (tok.type === 'EMPTY') {
            this._advance();
            return { op: 'is-empty' };
        }
        throw new ParseError(`Unknown state keyword: "${tok.value}"`, this._loc());
    }

    // ── Store step ────────────────────────────────────────────────────────────

    private _parseStoreStep(): Step {
        const loc = this._loc();
        this._expect('STORE');
        const element = this._parseElementRef();
        const capture: 'text' | 'value' = this._at('VALUE')
            ? (this._advance(), 'value')
            : (this._tryExpect('TEXT'), 'text');
        this._expect('AS');
        const variable = this._advance().value; // VARIABLE token
        return { kind: 'store', element, capture, variable, loc } satisfies StoreStep;
    }

    // ── Within step ───────────────────────────────────────────────────────────

    private _parseWithinStep(): Step {
        const loc = this._loc();
        this._expect('WITHIN');
        const root = this._parseElementRef();
        const scopes: { name: string; qualifier: number; filter?: ScopeFilter }[] = [];
        while ((this._at('IDENT') || this._peekAt(0)?.type === 'COLON')) {
            let scopeName: string;
            if (this._at('IDENT')) {
                scopeName = this._advance().value;
            } else if (this._at('COLON')) {
                if (root.kind !== 'name') throw new ParseError('Unnamed scope qualifier requires a named root element', this._loc());
                scopeName = root.value;
            } else {
                break;
            }

            let filter: ScopeFilter | undefined;
            if (this._at('LBRACKET')) {
                filter = this._parseScopeFilter();
            }

            let qualifier = 1;
            if (this._at('COLON')) {
                this._advance();
                if (!this._at('NUMBER')) throw new ParseError('Expected numeric scope qualifier after ":"', this._loc());
                qualifier = Number(this._advance().value);
                if (Number.isNaN(qualifier) || qualifier < 1) throw new ParseError('Scope qualifier must be a positive integer', this._loc());
            }

            scopes.push({ name: scopeName, qualifier, ...(filter ? { filter } : {}) });
        }
        this._skipNewlines();
        this._expect('INDENT');
        const steps = this._parseSteps();
        this._tryExpect('DEDENT');
        return scopes.length > 0
            ? { kind: 'within', root, scopes, steps, loc }
            : { kind: 'within', root, steps, loc };
    }

    private _parseScopeFilter(): ScopeFilter {
        this._expect('LBRACKET');
        if (!this._at('IDENT')) throw new ParseError('Expected attribute name or "text" inside scope filter', this._loc());
        const nameToken = this._advance().value;
        const isText = nameToken.toLowerCase() === 'text';
        const target: ScopeFilter['target'] = isText ? 'text' : 'attr';
        const attr = isText ? undefined : nameToken;

        let operator: ScopeFilter['operator'];
        if (this._at('TILDE_EQUAL')) {
            operator = 'contains';
            this._advance();
        } else if (this._at('EQUAL_SIGN')) {
            operator = 'equals';
            this._advance();
        } else {
            throw new ParseError('Expected = or ~= in scope filter', this._loc());
        }

        const value = this._expectString('"filter value"');
        this._expect('RBRACKET');

        if (target === 'attr' && !attr) throw new ParseError('Attribute filters require a name', this._loc());
        return target === 'attr'
            ? { target: 'attr', attr: attr!, operator, value }
            : { target: 'text', operator, value };
    }

    // ── Focus step ────────────────────────────────────────────────────────────

    private _parseFocusStep(): Step {
        const loc = this._loc();
        this._expect('FOCUS_KW');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'focus', element, loc } as FocusAction & { kind: 'action' };
    }

    // ── Network mock step ────────────────────────────────────────────────────

    private _parseMockRequestStep(): Step {
        const loc = this._loc();
        this._expect('MOCK');
        // HTTP method — comes through as IDENT (GET, POST, PUT, PATCH, DELETE)
        if (!this._at('IDENT')) throw new ParseError('Expected HTTP method (GET, POST, PUT, …)', loc);
        const method = this._advance().value.toUpperCase();
        const url = this._expectString('"url"');
        let status = 200;
        let body: string | undefined;
        // optional modifiers: "with status N" and/or "with delay N ms" in any order
        let delayMs: number | undefined;
        while (this._at('WITH_KW') || this._at('DELAY') || (this._at('IDENT') && this._peek()!.value === 'status')) {
            if (this._at('WITH_KW')) {
                this._advance();
                if (this._at('DELAY')) {
                    this._advance();
                    if (!this._at('NUMBER')) throw new ParseError('Expected delay in ms', this._loc());
                    delayMs = Number(this._advance().value);
                    this._tryExpect('MS');
                    continue;
                }
                // "with status N"
                if (this._at('IDENT') && this._peek()!.value === 'status') this._advance();
                if (!this._at('NUMBER')) throw new ParseError('Expected status code', this._loc());
                status = Number(this._advance().value);
            } else if (this._at('DELAY')) {
                this._advance();
                if (!this._at('NUMBER')) throw new ParseError('Expected delay in ms', this._loc());
                delayMs = Number(this._advance().value);
                this._tryExpect('MS');
            }
        }
        // optional: returning "body"
        if (this._at('RETURNING')) {
            this._advance();
            body = this._expectString('"response body"');
        }
        return { kind: 'mock-request', method, url, status, body, delayMs, loc } satisfies MockRequestStep;
    }

    private _parseAssertRequestStep(loc: Loc): Step {
        this._expect('REQUEST');
        // "METHOD url" as a single string, e.g. "GET /api/users"
        const raw = this._expectString('"METHOD url"');
        const [method, ...rest] = raw.trim().split(/\s+/);
        const url = rest.join(' ');
        if (!method || !url) throw new ParseError('Expected "METHOD url" e.g. "GET /api/users"', loc);

        let assertion: RequestAssertionKind;
        if (this._at('WAS')) {
            this._advance();
            if (this._at('NOT') || this._at('NEVER_KW')) {
                this._advance();
                this._tryExpect('CALLED');
                assertion = { op: 'was-not-made' };
            } else if (this._at('CALLED')) {
                this._advance();
                if (this._at('ONCE')) {
                    this._advance();
                    assertion = { op: 'was-made-times', count: 1 };
                } else if (this._at('NUMBER')) {
                    const count = Number(this._advance().value);
                    this._tryExpect('TIMES');
                    assertion = { op: 'was-made-times', count };
                } else if (this._at('WITH_KW')) {
                    this._advance();
                    const body = this._expectString('"expected request body"');
                    assertion = { op: 'was-made-with', body };
                } else {
                    assertion = { op: 'was-made-times', count: 1 };
                }
            } else if (this._at('MADE')) {
                this._advance();
                assertion = { op: 'was-made' };
            } else {
                assertion = { op: 'was-made' };
            }
        } else {
            throw new ParseError('Expected "was made", "was called", "was not made"', this._loc());
        }
        return { kind: 'assert-request', method: method.toUpperCase(), url, assertion, loc } satisfies AssertRequestStep;
    }

    // ── A11y check step ────────────────────────────────────────────────────

    private _parseCheckA11yStep(loc: Loc): Step {
        let selector: string | undefined;
        if (this._at('PAGE')) {
            this._advance(); // consume 'page'
        } else {
            // It's an element ref — resolve to name string for later
            const ref = this._parseElementRef();
            selector = ref.value;
        }
        this._expect('HAS');
        this._expect('NOT'); // 'no' is tokenized as NOT
        this._expect('A11Y');
        this._tryExpect('VIOLATIONS');
        return { kind: 'check-a11y', selector, loc } satisfies CheckA11yStep;
    }

    // ── Blur / Fill steps ──────────────────────────────────────────────────

    private _parseBlurStep(): Step {
        const loc = this._loc();
        this._expect('BLUR');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'blur', element, loc } as BlurAction & { kind: 'action' };
    }

    private _parseFillStep(): Step {
        const loc = this._loc();
        this._expect('FILL');
        const value = this._expectString('"text to fill"');
        this._expect('INTO');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'fill', element, value, loc } as FillAction & { kind: 'action' };
    }

    // ── Screenshot step ──────────────────────────────────────────────────

    private _parseTakeScreenshotStep(): Step {
        const loc = this._loc();
        this._expect('TAKE');
        this._expect('SCREENSHOT');
        const name = this._at('STRING') ? this._advance().value : undefined;
        return { kind: 'take-screenshot', name, loc } satisfies TakeScreenshotStep;
    }

    // ── Spy steps ──────────────────────────────────────────────────────────────

    private _parseRegisterSpyStep(): Step {
        const loc = this._loc();
        this._expect('REGISTER');
        this._expect('SPY');
        const name = this._expectString('"spy name"');
        let returnValue: string | undefined;
        if (this._at('RETURNING')) {
            this._advance();
            returnValue = this._expectString('"return value"');
        }
        return { kind: 'register-spy', name, returnValue, loc } satisfies RegisterSpyStep;
    }

    private _parseResetSpyStep(): Step {
        const loc = this._loc();
        this._expect('RESET');
        this._expect('SPY');
        const name = this._expectString('"spy name"');
        return { kind: 'reset-spy', name, loc } satisfies ResetSpyStep;
    }

    private _parseSpyAssertion(): SpyAssertionKind {
        this._expect('WAS');
        // was not called
        if (this._at('NOT') || this._at('NEVER_KW')) {
            this._advance();
            this._tryExpect('CALLED');
            return { op: 'was-not-called' };
        }
        this._expect('CALLED');
        // was called once
        if (this._at('ONCE')) {
            this._advance();
            return { op: 'was-called-times', count: 1 };
        }
        // was called N times
        if (this._at('NUMBER')) {
            const count = Number(this._advance().value);
            this._tryExpect('TIMES');
            return { op: 'was-called-times', count };
        }
        // was called with "arg1" "arg2" ...
        if (this._at('WITH_KW')) {
            this._advance();
            const args: string[] = [];
            while (this._at('STRING')) {
                args.push(this._advance().value);
            }
            return { op: 'was-called-with', args };
        }
        // bare: was called (at least once)
        return { op: 'was-called' };
    }

    // ── Given special steps ───────────────────────────────────────────────────

    private _parseLoadComponentStep(): Step {
        const loc = this._loc();
        this._expect('COMPONENT');
        const name = this._expectIdent('component name');
        this._tryExpect('IS');
        this._tryExpect('LOADED');
        return { kind: 'load-component', name, loc } satisfies LoadComponentStep;
    }

    private _parseApplyFixtureStep(): Step {
        const loc = this._loc();
        this._expect('FIXTURE');
        const name = this._expectString('"fixture name"');
        this._tryExpect('IS');
        this._tryExpect('APPLIED');
        return { kind: 'apply-fixture', name, loc } satisfies ApplyFixtureStep;
    }

    // ── Element reference ─────────────────────────────────────────────────────

    private _parseElementRef(): ElementRef {
        const tok = this._peek();
        if (!tok) throw new ParseError('Expected element reference', this._loc());
        const loc = this._loc();

        if (tok.type === 'STRING') {
            this._advance();
            return { kind: 'quoted', value: tok.value, loc };
        }
        if (tok.type === 'VARIABLE') {
            this._advance();
            return { kind: 'variable', value: tok.value, loc };
        }

        // Bare kebab-case ident — consume words connected by hyphens
        let name = this._advance().value;
        // Peek ahead: if next token is also an ident/keyword on the same line,
        // stitch it as part of the element name (handles "submit button" without quotes)
        while (this._peek()?.value === '-') {
            this._advance(); // consume hyphen
            const next = this._peek();
            if (next && next.type !== 'NEWLINE' && next.type !== 'INDENT' && next.type !== 'DEDENT') {
                name += '-' + this._advance().value;
            } else break;
        }

        return { kind: 'name', value: name, loc };
    }

    // ── Token utilities ───────────────────────────────────────────────────────

    private _peek(): Token | undefined {
        return this._tokens[this._pos];
    }

    private _peekAt(offset: number): Token | undefined {
        return this._tokens[this._pos + offset];
    }

    private _advance(): Token {
        const tok = this._tokens[this._pos];
        if (!tok) throw new ParseError('Unexpected end of file', { line: 0, column: 0 });
        this._pos++;
        return tok;
    }

    private _at(type: TokenType): boolean {
        return this._tokens[this._pos]?.type === type;
    }

    private _expect(type: TokenType): Token {
        if (!this._at(type)) {
            const got = this._peek();
            throw new ParseError(
                `Expected ${type} but got ${got?.type ?? 'EOF'} ("${got?.value ?? ''}")`,
                this._loc(),
            );
        }
        return this._advance();
    }

    private _tryExpect(type: TokenType): Token | null {
        if (this._at(type)) return this._advance();
        return null;
    }

    private _expectString(hint: string): string {
        if (!this._at('STRING')) {
            throw new ParseError(`Expected string (${hint}) but got ${this._peek()?.type}`, this._loc());
        }
        return this._advance().value;
    }

    private _expectIdent(hint: string): string {
        const tok = this._peek();
        if (!tok || (tok.type !== 'IDENT' && tok.type !== 'STRING')) {
            throw new ParseError(`Expected identifier (${hint})`, this._loc());
        }
        return this._advance().value;
    }

    private _skipNewlines(): void {
        while (this._at('NEWLINE')) this._advance();
    }

    private _loc(): Loc {
        const tok = this._peek();
        const loc: Loc = { line: tok?.line ?? 0, column: tok?.column ?? 0 };
        if (this._file !== undefined) loc.file = this._file;
        return loc;
    }
}

// ── Convenience function ───────────────────────────────────────────────────────

export function parseXTest(source: string, file?: string): XTestFile {
    const tokens = new Lexer(source, file).tokenize();
    return new Parser(tokens, file).parse();
}
