import type { TSESTree } from "@typescript-eslint/types";

// Minimal type representing an eslint-scope reference
export interface ScopeReference {
  identifier: TSESTree.Identifier;
  from: Scope;
}

// Minimal type representing an eslint-scope variable
export interface ScopeVariable {
  name: string;
  defs: unknown[];
  references: ScopeReference[];
}

// Minimal type representing an eslint-scope scope
export interface Scope {
  type:
    | "global"
    | "module"
    | "function"
    | "class"
    | "block"
    | "switch"
    | "with"
    | "catch"
    | "for";
  block: TSESTree.Node;
  parent: Scope | null;
  upper: Scope | null;
  variables: ScopeVariable[];
  through: ScopeReference[];
  childScopes: Scope[];
}

export interface RuleOptions {
  allowInUseClient?: boolean;
}
