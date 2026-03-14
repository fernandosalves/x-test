/**
 * xtest — Lexer
 *
 * Converts a raw .xtest file string into a flat token stream.
 * Indentation-sensitive: emits INDENT / DEDENT tokens.
 */

// ── Token types ─────────────────────────────────────────────────────────────────

export type TokenType =
    | 'SUITE' | 'SCENARIO' | 'XSCENARIO' | 'XSUITE' | 'ONLY'
    | 'GIVEN' | 'SETUP' | 'TEARDOWN' | 'WITHIN'
    | 'BEFORE_EACH' | 'AFTER_EACH'
    | 'TYPE' | 'CLICK' | 'DOUBLE_CLICK' | 'RIGHT_CLICK'
    | 'SELECT' | 'CLEAR' | 'HOVER' | 'SCROLL' | 'WAIT'
    | 'NAVIGATE' | 'RELOAD' | 'PRESS' | 'STORE' | 'CHECK'
    | 'COMPONENT' | 'LOADED' | 'FIXTURE' | 'APPLIED'
    | 'SPY' | 'REGISTER' | 'WAS' | 'CALLED' | 'RETURNED_KW' | 'TIMES' | 'ONCE' | 'WITH_KW' | 'NEVER_KW' | 'RETURNING' | 'LAST'
    | 'BLUR' | 'FILL' | 'RESET' | 'EMPTY' | 'ARIA' | 'ROLE_KW' | 'SCREENSHOT' | 'TAKE'
    | 'FOCUSABLE' | 'ACCESSIBLE' | 'NAME_KW' | 'ALT' | 'A11Y' | 'VIOLATIONS'
    | 'MOCK' | 'REQUEST' | 'MADE' | 'DELAY' | 'FUNCTION_KW'
    | 'INTO' | 'IN' | 'FOR' | 'TO' | 'AS' | 'ON' | 'PAGE' | 'MS'
    | 'IS' | 'NOT' | 'CONTAINS' | 'HAS' | 'EQUALS' | 'MATCHES'
    | 'VALUE' | 'TEXT' | 'CLASS' | 'FOCUS' | 'FOCUS_KW'
    | 'PROP' | 'ATTR' | 'COUNT'
    | 'VISIBLE' | 'HIDDEN' | 'ABSENT' | 'PRESENT'
    | 'ENABLED' | 'DISABLED' | 'CHECKED' | 'UNCHECKED' | 'READONLY'
    | 'DOUBLE_CLICK_KW' | 'RIGHT_CLICK_KW'
    | 'STRING'
    | 'NUMBER'
    | 'IDENT'
    | 'VARIABLE'
    | 'COLON'
    | 'INDENT'
    | 'DEDENT'
    | 'NEWLINE'
    | 'EOF';

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    column: number;
}

// ── Keyword map ─────────────────────────────────────────────────────────────────

const KEYWORDS: Record<string, TokenType> = {
    suite: 'SUITE',
    scenario: 'SCENARIO',
    xscenario: 'XSCENARIO',
    xsuite: 'XSUITE',
    only: 'ONLY',
    given: 'GIVEN',
    setup: 'SETUP',
    teardown: 'TEARDOWN',
    within: 'WITHIN',
    beforeeach: 'BEFORE_EACH',
    'before-each': 'BEFORE_EACH',
    aftereach: 'AFTER_EACH',
    'after-each': 'AFTER_EACH',
    type: 'TYPE',
    click: 'CLICK',
    select: 'SELECT',
    clear: 'CLEAR',
    hover: 'HOVER',
    scroll: 'SCROLL',
    wait: 'WAIT',
    navigate: 'NAVIGATE',
    reload: 'RELOAD',
    press: 'PRESS',
    store: 'STORE',
    check: 'CHECK',
    into: 'INTO',
    in: 'IN',
    for: 'FOR',
    to: 'TO',
    as: 'AS',
    on: 'ON',
    page: 'PAGE',
    ms: 'MS',
    is: 'IS',
    not: 'NOT',
    no: 'NOT',
    contains: 'CONTAINS',
    has: 'HAS',
    equals: 'EQUALS',
    matches: 'MATCHES',
    value: 'VALUE',
    text: 'TEXT',
    prop: 'PROP',
    attr: 'ATTR',
    count: 'COUNT',
    component: 'COMPONENT',
    loaded: 'LOADED',
    fixture: 'FIXTURE',
    applied: 'APPLIED',
    mock: 'MOCK',
    request: 'REQUEST',
    made: 'MADE',
    delay: 'DELAY',
    function: 'FUNCTION_KW',
    focusable: 'FOCUSABLE',
    accessible: 'ACCESSIBLE',
    name: 'NAME_KW',
    alt: 'ALT',
    a11y: 'A11Y',
    violations: 'VIOLATIONS',
    blur: 'BLUR',
    fill: 'FILL',
    reset: 'RESET',
    empty: 'EMPTY',
    aria: 'ARIA',
    role: 'ROLE_KW',
    screenshot: 'SCREENSHOT',
    take: 'TAKE',
    spy: 'SPY',
    register: 'REGISTER',
    was: 'WAS',
    called: 'CALLED',
    returned: 'RETURNED_KW',
    returning: 'RETURNING',
    times: 'TIMES',
    once: 'ONCE',
    with: 'WITH_KW',
    never: 'NEVER_KW',
    last: 'LAST',
    class: 'CLASS',
    focus: 'FOCUS_KW',
    focused: 'FOCUS_KW',
    visible: 'VISIBLE',
    hidden: 'HIDDEN',
    absent: 'ABSENT',
    present: 'PRESENT',
    enabled: 'ENABLED',
    disabled: 'DISABLED',
    checked: 'CHECKED',
    unchecked: 'UNCHECKED',
    readonly: 'READONLY',
};

// ── Lexer ───────────────────────────────────────────────────────────────────────

export class Lexer {
    private _src: string;
    private _pos: number = 0;
    private _line: number = 1;
    private _col: number = 1;
    private _file?: string;
    private _indents: number[] = [0];
    private _pending: Token[] = [];

    constructor(source: string, file?: string) {
        this._src = source;
        if (file !== undefined) this._file = file;
    }

    tokenize(): Token[] {
        const tokens: Token[] = [];

        while (this._pos < this._src.length) {
            this._skipComments();
            if (this._pos >= this._src.length) break;

            const rawCh = this._src[this._pos]!;

            // Blank line
            if (rawCh === '\n' || rawCh === '\r') {
                this._advance();
                if (rawCh === '\r' && this._src[this._pos] === '\n') this._advance();
                this._line++;
                this._col = 1;
                // Don't emit NEWLINE for blank lines — handle indentation on next content line
                continue;
            }

            // Beginning of a content line — handle indentation
            if (this._col === 1) {
                const indentTokens = this._handleIndent();
                tokens.push(...indentTokens);
                if (this._pos >= this._src.length) break;
            }

            // Re-read ch AFTER _handleIndent() may have advanced past leading spaces
            const ch = this._src[this._pos]!;
            const startLine = this._line;
            const startCol = this._col;

            // String literal
            if (ch === '"') {
                tokens.push(this._readString(startLine, startCol));
                continue;
            }

            // Number
            if (ch >= '0' && ch <= '9') {
                tokens.push(this._readNumber(startLine, startCol));
                continue;
            }

            // Variable $name
            if (ch === '$') {
                tokens.push(this._readVariable(startLine, startCol));
                continue;
            }

            if (ch === ':') {
                this._advance();
                tokens.push({ type: 'COLON', value: ':', line: startLine, column: startCol });
                continue;
            }

            // Word (keyword or ident)
            if (this._isAlpha(ch) || ch === '-' || ch === '_') {
                tokens.push(this._readWord(startLine, startCol));
                continue;
            }

            // Whitespace between tokens on same line
            if (ch === ' ' || ch === '\t') {
                this._advance();
                continue;
            }

            // Unknown — skip
            this._advance();
        }

        // Flush remaining dedents
        while (this._indents.length > 1) {
            this._indents.pop();
            tokens.push({ type: 'DEDENT', value: '', line: this._line, column: this._col });
        }

        tokens.push({ type: 'EOF', value: '', line: this._line, column: this._col });
        return tokens;
    }

    // ── Private helpers ─────────────────────────────────────────────────────────

    private _handleIndent(): Token[] {
        const tokens: Token[] = [];
        let spaces = 0;

        while (this._pos < this._src.length) {
            const ch = this._src[this._pos];
            if (ch === ' ') { spaces++; this._advance(); }
            else if (ch === '\t') { spaces += 2; this._advance(); } // treat tab as 2 spaces
            else break;
        }

        // Skip blank lines
        const ch = this._src[this._pos];
        if (!ch || ch === '\n' || ch === '\r' || ch === '#') return tokens;

        const current = this._indents.at(-1) ?? 0;

        if (spaces > current) {
            this._indents.push(spaces);
            tokens.push({ type: 'INDENT', value: String(spaces), line: this._line, column: 1 });
        } else if (spaces < current) {
            while ((this._indents.at(-1) ?? 0) > spaces) {
                this._indents.pop();
                tokens.push({ type: 'DEDENT', value: String(spaces), line: this._line, column: 1 });
            }
        }

        return tokens;
    }

    private _readString(line: number, col: number): Token {
        this._advance(); // skip opening "
        let value = '';
        while (this._pos < this._src.length && this._src[this._pos] !== '"') {
            if (this._src[this._pos] === '\\') {
                this._advance();
                const escaped = this._src[this._pos];
                if (escaped !== undefined) value += escaped;
            } else {
                value += this._src[this._pos];
            }
            this._advance();
        }
        this._advance(); // skip closing "
        return { type: 'STRING', value, line, column: col };
    }

    private _readNumber(line: number, col: number): Token {
        let value = '';
        while (this._pos < this._src.length && this._src[this._pos]! >= '0' && this._src[this._pos]! <= '9') {
            value += this._src[this._pos];
            this._advance();
        }
        return { type: 'NUMBER', value, line, column: col };
    }

    private _readVariable(line: number, col: number): Token {
        this._advance(); // skip $
        let name = '';
        while (this._pos < this._src.length && this._isAlphaNum(this._src[this._pos]!)) {
            name += this._src[this._pos];
            this._advance();
        }
        return { type: 'VARIABLE', value: name, line, column: col };
    }

    private _readWord(line: number, col: number): Token {
        let word = '';
        while (this._pos < this._src.length) {
            const ch = this._src[this._pos]!;
            if (this._isAlphaNum(ch) || ch === '-' || ch === '_') {
                word += ch;
                this._advance();
            } else break;
        }

        // Handle multi-word keywords: "double-click", "right-click", "scroll-to"
        const lower = word.toLowerCase();
        const type = KEYWORDS[lower] ?? 'IDENT';
        return { type, value: word, line, column: col };
    }

    private _skipComments(): void {
        // Inline comments (#) after content on same line
        while (this._pos < this._src.length) {
            // Skip spaces
            const ch = this._src[this._pos];
            if (!ch) break;
            if (ch === '#') {
                while (this._pos < this._src.length && this._src[this._pos] !== '\n') {
                    this._advance();
                }
                break;
            }
            break;
        }
    }

    private _advance(): void {
        this._pos++;
        this._col++;
    }

    private _isAlpha(ch: string): boolean {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
    }

    private _isAlphaNum(ch: string): boolean {
        return this._isAlpha(ch) || (ch >= '0' && ch <= '9');
    }
}
