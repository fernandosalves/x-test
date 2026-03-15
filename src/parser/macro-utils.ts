/**
 * Helpers for macro placeholder encoding (string values) used during parsing/execution.
 */

const MACRO_STRING_PREFIX = '__xtest_macro_param__:';

export function encodeMacroStringParam(param: string): string {
    return `${MACRO_STRING_PREFIX}${param}`;
}

export function decodeMacroStringParam(value: string): string | null {
    return value.startsWith(MACRO_STRING_PREFIX)
        ? value.slice(MACRO_STRING_PREFIX.length)
        : null;
}
