/**
 * Rule: no-dom-globals-in-module-scope
 *
 * Disallows use of DOM globals (window, document, navigator, …) at the
 * module / global scope.
 */

import { browser as browserGlobals, node as nodeGlobals } from "globals";

function isDOMGlobalName(name: string): boolean {
  return name in browserGlobals && !(name in nodeGlobals);
}

export const noDomGlobalsInModuleScope = {
  meta: {
    type: "problem" as const,
    docs: {
      description: "Disallow use of DOM globals in module scope",
      recommended: true,
    },
    messages: {
      moduleScope: "Use of DOM global '{{name}}' is forbidden in module scope.",
    },
    schema: [],
  },

  create(context: any) {
    return {
      Program() {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const globalScope = sourceCode.scopeManager
          ? sourceCode.scopeManager.globalScope
          : sourceCode.getScope(sourceCode.ast);

        const reported = new Set<string>();

        function isAtModuleScope(scope: any): boolean {
          let current = scope;
          let nearestFn: any = null;

          while (current) {
            if (current.type === "module" || current.type === "global") {
              if (nearestFn) {
                const parent = nearestFn.block?.parent;
                if (parent?.type === "CallExpression") return true;
                return false;
              }
              return true;
            }
            if (current.type === "function") nearestFn = current;
            current = current.upper;
          }
          return false;
        }

        function check(ref: any) {
          const node = ref.identifier;
          const key = `${node.range?.[0]}:${node.range?.[1]}`;
          if (reported.has(key)) return;

          const parent = node.parent;
          if (
            parent?.type === "UnaryExpression" &&
            parent.operator === "typeof"
          )
            return;
          if (
            parent?.type === "TSTypeReference" ||
            parent?.type === "TSInterfaceHeritage"
          )
            return;

          // Node.ELEMENT_NODE etc. are just static numeric constants — safe
          if (
            parent?.type === "MemberExpression" &&
            parent.object === node &&
            node.name === "Node"
          )
            return;

          // Skip references resolved to local/imported variables
          // (ref.resolved is set when the scope manager found a matching
          // Variable — if it has defs, it's local, not a DOM global)
          if (ref.resolved && ref.resolved.defs?.length > 0) return;

          if (!isDOMGlobalName(node.name)) return;
          if (!isAtModuleScope(ref.from)) return;

          reported.add(key);
          context.report({
            node,
            messageId: "moduleScope",
            data: { name: node.name },
          });
        }

        function walk(scope: any) {
          scope.variables.forEach((v: any) => {
            if (v.defs.length > 0) return;
            if (!isDOMGlobalName(v.name)) return;
            v.references.forEach((r: any) => check(r));
          });
          scope.through.forEach((r: any) => check(r));
          scope.childScopes.forEach((c: any) => walk(c));
        }

        walk(globalScope);
      },
    };
  },
};
