import { browser as browserGlobals, node as nodeGlobals } from "globals";
import type { TSESTree } from "@typescript-eslint/types";
import type { Scope } from "./types";

// ---------------------------------------------------------------------------
// DOM global detection
// ---------------------------------------------------------------------------

/**
 * Returns true if `name` is a browser global that does NOT exist in Node.js.
 * This catches window, document, navigator, location, screen, etc.
 * Globals present in both environments (fetch, URL, console, …) are excluded.
 */
export function isDOMGlobalName(name: string): boolean {
  return name in browserGlobals && !(name in nodeGlobals);
}

// ---------------------------------------------------------------------------
// JSX / return-value helpers
// ---------------------------------------------------------------------------

function isJSXElementOrFragment(node: TSESTree.Node | null): boolean {
  if (!node) return false;
  return node.type === "JSXElement" || node.type === "JSXFragment";
}

function isReturnValueNull(node: TSESTree.Node | null): boolean {
  return (
    node !== null &&
    node.type === "Literal" &&
    (node as TSESTree.Literal).value === null
  );
}

/**
 * Inspect a function scope and return true if it contains a top-level
 * `return <jsx /> | return null | return condition ? <jsx /> : <jsx />`.
 */
export function isReturnValueJSXOrNull(scope: Scope): boolean {
  const block = scope.block as
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
    | undefined;
  if (!block) return false;

  // For arrow functions with expression body: `() => <div />`
  if (
    block.type === "ArrowFunctionExpression" &&
    block.body.type !== "BlockStatement"
  ) {
    return isJSXElementOrFragment(block.body);
  }

  const body = (block as { body?: TSESTree.BlockStatement }).body;
  if (!body?.body) return false;

  return body.body.some((stmt) => {
    if (stmt.type !== "ReturnStatement") return false;
    const arg = stmt.argument;
    if (!arg) return false;

    if (isJSXElementOrFragment(arg) || isReturnValueNull(arg)) return true;

    if (
      arg.type === "ConditionalExpression" &&
      (isJSXElementOrFragment(arg.consequent) ||
        isReturnValueNull(arg.consequent)) &&
      (isJSXElementOrFragment(arg.alternate) ||
        isReturnValueNull(arg.alternate))
    ) {
      return true;
    }

    return false;
  });
}

// ---------------------------------------------------------------------------
// Naming helpers
// ---------------------------------------------------------------------------

export function isFirstLetterCapitalized(
  name: string | undefined | null,
): boolean {
  return !!name && name[0] === name[0].toUpperCase();
}

// ---------------------------------------------------------------------------
// React component detection
// ---------------------------------------------------------------------------

function isReactForwardRef(node: TSESTree.Node): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "React" &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "forwardRef"
  );
}

/**
 * Return true if `scope` belongs to a React function component.
 * Detection: PascalCase name + returns JSX | null, OR is inside React.forwardRef.
 */
export function isReactFunctionComponent(scope: Scope): boolean {
  const block = scope.block;
  if (!block) return false;

  switch (block.type) {
    case "FunctionDeclaration":
      return (
        isFirstLetterCapitalized(block.id?.name) &&
        isReturnValueJSXOrNull(scope)
      );

    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      const parent = block.parent;
      if (
        parent?.type === "VariableDeclarator" &&
        parent.id.type === "Identifier"
      ) {
        return (
          isFirstLetterCapitalized(parent.id.name) &&
          isReturnValueJSXOrNull(scope)
        );
      }
      if (parent && isReactForwardRef(parent)) {
        return true;
      }
      return false;
    }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Scope helpers
// ---------------------------------------------------------------------------

/**
 * Walk up the function-scope chain from `scope` and return true if the
 * reference is inside an SSR-safe context:
 *
 *  1. Any function whose name starts with `use` is treated as a custom
 *     hook and is safe by convention.
 *  2. The known SSR-unsafe hooks (`useMemo`, `useCallback`, `useRef`) are
 *     *excluded* from rule 1 — their callbacks execute during render on
 *     the server and must not access DOM globals.
 *  3. If a reference is inside an unsafe hook callback, we keep walking up.
 *     If an ancestor function is a safe hook, we accept it (e.g. a custom
 *     hook that wraps `useEffect` → `useMemo` is fine because the effect
 *     only runs on the client).
 */
export function isInsideSSRSafeContext(scope: Scope): boolean {
  const UNSAFE_HOOKS = new Set(["useMemo", "useCallback", "useRef"]);

  let current: Scope | null = scope;

  while (current) {
    if (current.type === "function") {
      const fnName = getFunctionName(current);

      if (fnName?.startsWith("use")) {
        const block = current.block as any;
        const callExpr = block?.parent;
        if (
          callExpr?.type === "CallExpression" &&
          callExpr.callee.type === "Identifier" &&
          UNSAFE_HOOKS.has(callExpr.callee.name)
        ) {
          current = current.upper;
          continue;
        }

        return true;
      }
    }

    current = current.upper;
  }

  return false;
}

/**
 * Extract the function name from a function scope.
 */
function getFunctionName(scope: Scope): string | undefined {
  const block = scope.block;
  if (!block) return undefined;

  switch (block.type) {
    case "FunctionDeclaration":
      return block.id?.name;
    case "FunctionExpression":
    case "ArrowFunctionExpression": {
      const parent = block.parent;
      if (
        parent?.type === "VariableDeclarator" &&
        parent.id.type === "Identifier"
      ) {
        return parent.id.name;
      }
      if (
        parent?.type === "CallExpression" &&
        parent.callee.type === "Identifier"
      ) {
        return parent.callee.name;
      }
      if (parent?.type === "Property" && parent.key.type === "Identifier") {
        return parent.key.name;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Reference-reporting helpers
// ---------------------------------------------------------------------------

/**
 * Should this reference be skipped (e.g. `typeof window`, TS types)?
 */
export function shouldSkipReference(node: TSESTree.Identifier): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // typeof window !== "undefined"
  if (parent.type === "UnaryExpression" && parent.operator === "typeof")
    return true;

  // TypeScript type references  (e.g. React.SVGAttributes<SVGSymbolElement>)
  if (
    parent.type === "TSTypeReference" ||
    parent.type === "TSInterfaceHeritage"
  )
    return true;

  return false;
}

/**
 * Walk up the AST from `node` and return true if it is protected by a
 * typeof guard that checks for the existence of a browser global.
 *
 * Handles two patterns:
 *
 * 1. Inline guard (node is inside the guarded branch):
 *    if (typeof window !== "undefined") { <node> }
 *    typeof window !== "undefined" ? <node> : fallback
 *
 * 2. Early-return guard (node is after the guard in the function body):
 *    () => {
 *      if (typeof window === "undefined") return false;
 *      return <node>;   ← safe because guard already returned on server
 *    }
 */
export function isInsideTypeofGuard(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;

  while (current?.parent) {
    const parent: TSESTree.Node = current.parent;

    // if (typeof window !== "undefined") { <node> }
    if (parent.type === "IfStatement") {
      if (
        current === parent.consequent &&
        parent.test &&
        hasTypeofBrowserCheck(parent.test)
      ) {
        return true;
      }
    }

    // typeof window !== "undefined" ? <node> : fallback
    if (parent.type === "ConditionalExpression") {
      if (current === parent.consequent && hasTypeofBrowserCheck(parent.test)) {
        return true;
      }
    }

    // typeof window !== "undefined" && <node>
    if (parent.type === "LogicalExpression" && parent.operator === "&&") {
      if (current === parent.right && hasTypeofBrowserCheck(parent.left)) {
        return true;
      }
    }

    // Early-return guard at the start of a function body:
    // () => { if (typeof window === 'undefined') return false; ...<node> }
    if (
      (parent.type === "FunctionExpression" ||
        parent.type === "ArrowFunctionExpression" ||
        parent.type === "FunctionDeclaration") &&
      parent.body?.type === "BlockStatement"
    ) {
      if (hasEarlyTypeofReturnGuard(parent.body.body)) {
        return true;
      }
    }

    current = parent;
  }

  return false;
}

/**
 * Return true if the first statement in a function body is an if-statement
 * with a typeof browser check that returns early ( bail-out for SSR ).
 *
 * Pattern: if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
 */
function hasEarlyTypeofReturnGuard(
  statements: TSESTree.Statement[],
): boolean {
  if (statements.length === 0) return false;
  const first = statements[0];

  if (first.type !== "IfStatement" || !first.test) return false;

  // All parts of the condition must be typeof-browser checks
  if (!allPartsAreTypeofChecks(first.test)) return false;

  // The consequent must be a return statement (or a block with one)
  if (first.consequent.type === "ReturnStatement") return true;
  if (
    first.consequent.type === "BlockStatement" &&
    first.consequent.body.length > 0 &&
    first.consequent.body[0].type === "ReturnStatement"
  ) {
    return true;
  }

  return false;
}

/**
 * Return true if the expression is entirely made up of typeof browser checks.
 * For compound expressions (&& / ||), ALL parts must be typeof checks.
 */
function allPartsAreTypeofChecks(node: TSESTree.Node): boolean {
  if (node.type === "LogicalExpression") {
    return (
      allPartsAreTypeofChecks(node.left) &&
      allPartsAreTypeofChecks(node.right)
    );
  }
  return isTypeofBrowserComparison(node);
}

/**
 * Return true if `node` is a single comparison like
 * `typeof window === "undefined"` or `"undefined" !== typeof navigator`.
 */
function isTypeofBrowserComparison(node: TSESTree.Node): boolean {
  if (node.type !== "BinaryExpression") return false;
  if (
    node.operator !== "!==" &&
    node.operator !== "!=" &&
    node.operator !== "===" &&
    node.operator !== "=="
  ) {
    return false;
  }

  const BROWSER_GLOBALS = [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "screen",
    "localStorage",
    "sessionStorage",
    "globalThis",
  ];

  // typeof window !== "undefined"
  if (
    node.left.type === "UnaryExpression" &&
    node.left.operator === "typeof" &&
    node.left.argument.type === "Identifier" &&
    BROWSER_GLOBALS.includes(node.left.argument.name) &&
    node.right.type === "Literal" &&
    node.right.value === "undefined"
  ) {
    return true;
  }

  // "undefined" !== typeof window
  if (
    node.right.type === "UnaryExpression" &&
    node.right.operator === "typeof" &&
    node.right.argument.type === "Identifier" &&
    BROWSER_GLOBALS.includes(node.right.argument.name) &&
    node.left.type === "Literal" &&
    node.left.value === "undefined"
  ) {
    return true;
  }

  return false;
}

/**
 * Used by the inline guard check (IfStatement / ConditionalExpression / &&)
 * to see if a single expression node contains at least one typeof browser check.
 */
function hasTypeofBrowserCheck(node: TSESTree.Node): boolean {
  if (isTypeofBrowserComparison(node)) return true;
  if (node.type === "LogicalExpression") {
    return hasTypeofBrowserCheck(node.left) || hasTypeofBrowserCheck(node.right);
  }
  return false;
}

// ---------------------------------------------------------------------------
// "use client" / "use server" directive detection
// ---------------------------------------------------------------------------

/**
 * Return true if the file starts with a "use client" or "use server" directive.
 */
export function hasUseDirective(body: TSESTree.ProgramStatement[]): boolean {
  if (body.length === 0) return false;

  const first = body[0];
  if (
    first.type === "ExpressionStatement" &&
    first.expression.type === "Literal" &&
    typeof first.expression.value === "string" &&
    (first.expression.value === "use client" ||
      first.expression.value === "use server")
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// ESLint API compatibility helpers (ESLint 8 ↔ 9)
// ---------------------------------------------------------------------------

/**
 * Get the SourceCode object across ESLint versions.
 */
export function getSourceCode(context: any): any {
  return context.sourceCode ?? context.getSourceCode();
}

/**
 * Get the filename across ESLint versions.
 */
export function getFilename(context: any): string {
  return context.filename ?? context.getFilename();
}
