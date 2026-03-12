/**
 * Miura — Parser
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
    NavigateAction, ReloadAction, PressAction,
    AssertElementStep, AssertVariableStep,
    Loc,
} from './ast.js';

export class ParseError extends Error {
    constructor(message: string, public readonly loc: Loc) {
        super(`[miura] Parse error at ${loc.file ?? '<input>'}:${loc.line}:${loc.column} — ${message}`);
    }
}

export class Parser {
    private _tokens: Token[];
    private _pos:    number = 0;
    private _file?:  string;

    constructor(tokens: Token[], file?: string) {
        this._tokens = tokens;
        if (file !== undefined) this._file = file;
    }

    parse(): XTestFile {
        const suites: SuiteNode[] = [];
        while (!this._at('EOF')) {
            this._skipNewlines();
            if (this._at('EOF')) break;
            if (this._at('SUITE')) {
                suites.push(this._parseSuite());
            } else {
                this._advance(); // skip unexpected tokens at file level
            }
        }
        const result: XTestFile = { suites };
        if (this._file !== undefined) result.file = this._file;
        return result;
    }

    // ── Suite ─────────────────────────────────────────────────────────────────

    private _parseSuite(): SuiteNode {
        const loc  = this._loc();
        this._expect('SUITE');
        const name = this._expectIdent('suite name');

        this._skipNewlines();
        this._expect('INDENT');

        let setup:    Step[] = [];
        let teardown: Step[] = [];
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
            } else if (this._at('SCENARIO')) {
                scenarios.push(this._parseScenario());
            } else {
                this._advance();
            }
        }

        this._tryExpect('DEDENT');
        return { kind: 'suite', name, setup, teardown, scenarios, loc };
    }

    // ── Scenario ──────────────────────────────────────────────────────────────

    private _parseScenario(): ScenarioNode {
        const loc = this._loc();
        this._expect('SCENARIO');
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

        return { kind: 'scenario', description, given, steps, loc };
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
            case 'TYPE':     return this._parseTypeStep();
            case 'CLICK':    return this._parseClickStep('click');
            case 'SELECT':   return this._parseSelectStep();
            case 'CLEAR':    return this._parseClearStep();
            case 'HOVER':    return this._parseHoverStep();
            case 'SCROLL':   return this._parseScrollStep();
            case 'WAIT':     return this._parseWaitStep();
            case 'NAVIGATE': return this._parseNavigateStep();
            case 'RELOAD':   return this._parseReloadStep();
            case 'PRESS':    return this._parsePressStep();
            case 'CHECK':    return this._parseCheckStep();
            case 'STORE':    return this._parseStoreStep();
            case 'IDENT':
                // Handle "double-click" and "right-click" as IDENT tokens
                if (tok.value.toLowerCase() === 'double-click') return this._parseClickStep('double-click');
                if (tok.value.toLowerCase() === 'right-click')  return this._parseClickStep('right-click');
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
        const value   = this._expectString('"text to type"');
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
        const value   = this._expectString('"option to select"');
        this._expect('IN');
        const element = this._parseElementRef();
        return { kind: 'action', action: 'select', element, value, loc } as SelectAction & { kind: 'action' };
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
        const element = this._parseElementRef();
        return { kind: 'action', action: 'wait-for', element, loc } as WaitForAction & { kind: 'action' };
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

        // check $var equals/matches "..."
        if (this._at('VARIABLE')) {
            const variable = this._advance().value;
            const op = this._at('EQUALS') ? (this._advance(), 'equals' as const)
                                          : (this._expect('MATCHES'), 'matches' as const);
            const value = this._expectString('"expected value"');
            return { kind: 'assert-variable', variable, op, value, loc } satisfies AssertVariableStep;
        }

        const element = this._parseElementRef();
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
            if (this._at('FOCUS_KW')) {
                this._advance();
                return { op: 'has-focus' };
            }
            if (this._at('CLASS')) {
                this._advance();
                const value = this._expectString('"class name"');
                return { op: 'has-class', value };
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
            UNCHECKED: 'unchecked', READONLY: 'readonly', FOCUS_KW: 'focused',
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
