/**
 * Rule: no-dom-globals-in-react
 *
 * Flags DOM globals in React function component bodies and SSR-unsafe
 * hook callbacks (useMemo, useCallback, useRef).
 */

import {
  isDOMGlobalName,
  shouldSkipReference,
  isReactFunctionComponent,
  isInsideSSRSafeContext,
  isInsideTypeofGuard,
  hasUseDirective,
  getSourceCode,
} from "../utils";
import type {
  Scope,
  ScopeReference,
  ScopeVariable,
  RuleOptions,
} from "../types";

export const noDomGlobalsInReact = {
  meta: {
    type: "problem" as const,
    docs: {
      description:
        "Disallow use of DOM globals in React component bodies and SSR-unsafe hook callbacks",
      recommended: true,
    },
    messages: {
      reactFC:
        "Use of DOM global '{{name}}' in the render-cycle of a React component. Move it inside useEffect, useLayoutEffect, or a custom hook.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowInUseClient: { type: "boolean", default: false },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context: any, options: [RuleOptions?] | undefined) {
    const opts = (options && options[0]) || {};
    const allowInUseClient = opts.allowInUseClient ?? false;

    return {
      Program() {
        if (allowInUseClient) {
          const sourceCode = getSourceCode(context);
          if (hasUseDirective(sourceCode.ast.body)) return;
        }

        const globalScope: Scope = getSourceCode(context).scopeManager
          ? getSourceCode(context).scopeManager.globalScope
          : getSourceCode(context).getScope(getSourceCode(context).ast);

        const reported = new Set<string>();

        function check(ref: ScopeReference) {
          const node = ref.identifier;
          const key = `${node.range?.[0]}:${node.range?.[1]}`;
          if (reported.has(key)) return;
          if (shouldSkipReference(node)) return;
          // Node.ELEMENT_NODE etc. are just static numeric constants — safe
          if (
            node.parent?.type === "MemberExpression" &&
            node.parent.object === node &&
            node.name === "Node"
          )
            return;
          // Skip references resolved to local/imported variables (e.g. CSS from @dnd-kit/utilities)
          const resolved = (ref as any).resolved;
          if (resolved && resolved.defs?.length > 0) return;
          if (!isDOMGlobalName(node.name)) return;

          // Code guarded by typeof window/navigator !== "undefined" is safe
          if (isInsideTypeofGuard(node)) return;

          const fromScope = ref.from as Scope;
          if (isInsideSSRSafeContext(fromScope)) return;

          if (
            fromScope.type === "function" &&
            isReactFunctionComponent(fromScope)
          ) {
            reported.add(key);
            context.report({
              node,
              messageId: "reactFC",
              data: { name: node.name },
            });
            return;
          }
          if (
            fromScope.type === "function" &&
            isProbablyComponentScope(fromScope)
          ) {
            reported.add(key);
            context.report({
              node,
              messageId: "reactFC",
              data: { name: node.name },
            });
            return;
          }

          // Catch-all: DOM global in a function that's the argument of a
          // CallExpression (e.g. useMemo(() => navigator…), useCallback(…)).
          // This does NOT flag plain function declarations / expressions.
          if (fromScope.type === "function" && isCallbackInCall(fromScope)) {
            reported.add(key);
            context.report({
              node,
              messageId: "reactFC",
              data: { name: node.name },
            });
          }
        }

        function walkScopes(scope: Scope) {
          scope.variables.forEach((v: ScopeVariable) => {
            if (v.defs.length > 0) return;
            if (!isDOMGlobalName(v.name)) return;
            v.references.forEach((ref: ScopeReference) => check(ref));
          });
          scope.through.forEach((ref: ScopeReference) => check(ref));
          scope.childScopes.forEach((child: Scope) => walkScopes(child));
        }

        walkScopes(globalScope);
      },
    };
  },
};

function isProbablyComponentScope(scope: Scope): boolean {
  const block = scope.block as any;
  if (!block) return false;
  let name: string | undefined;
  if (block.type === "FunctionDeclaration") {
    name = block.id?.name;
  } else if (
    block.parent?.type === "VariableDeclarator" &&
    block.parent.id?.type === "Identifier"
  ) {
    name = block.parent.id.name;
  }
  return !!name && name[0] === name[0].toUpperCase();
}

function isCallbackInCall(scope: Scope): boolean {
  const block = scope.block as any;
  return block?.parent?.type === "CallExpression";
}
