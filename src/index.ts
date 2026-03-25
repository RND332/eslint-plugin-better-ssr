/**
 * eslint-plugin-better-ssr
 *
 * Modern TypeScript fork of eslint-plugin-ssr-friendly with support for
 * ESLint 8 / 9 / 10 (including flat config), Next.js App Router ("use client"),
 * and comprehensive React hook awareness.
 *
 * @packageDocumentation
 */

import { noDomGlobalsInModuleScope } from "./rules/no-dom-globals-in-module-scope";
import { noDomGlobalsInReact } from "./rules/no-dom-globals-in-react";

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const rules = {
  "no-dom-globals-in-module-scope": noDomGlobalsInModuleScope,
  "no-dom-globals-in-react": noDomGlobalsInReact,

  // Backward-compatible alias for the v1 FC rule
  "no-dom-globals-in-react-fc": noDomGlobalsInReact,
} as const;

// ---------------------------------------------------------------------------
// Plugin metadata
// ---------------------------------------------------------------------------

const pluginName = "better-ssr";

const plugin = {
  meta: {
    name: "eslint-plugin-better-ssr",
    version: "2.0.0",
  },
  rules,
};

// ---------------------------------------------------------------------------
// Recommended config (flat config — ESLint 9+)
// ---------------------------------------------------------------------------

const flatRecommended = {
  plugins: {
    [pluginName]: plugin,
  },
  languageOptions: {
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
  rules: {
    [`${pluginName}/no-dom-globals-in-module-scope`]: "error",
    [`${pluginName}/no-dom-globals-in-react`]: "error",
  },
};

// ---------------------------------------------------------------------------
// Recommended config (legacy — ESLint 8 .eslintrc)
// ---------------------------------------------------------------------------

const legacyRecommended = {
  plugins: [pluginName],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
  rules: {
    [`${pluginName}/no-dom-globals-in-module-scope`]: "error",
    [`${pluginName}/no-dom-globals-in-react`]: "error",
  },
};

// ---------------------------------------------------------------------------
// Exports — works for both CJS require() and ESM import
// ---------------------------------------------------------------------------

// Flat config configs (ESLint 9+)
(plugin as any).configs = {
  recommended: flatRecommended,
  // Also expose under "flat/recommended" for explicitness
  "flat/recommended": flatRecommended,
};

// Legacy configs (.eslintrc) — attached separately so ESLint 8 can find them
(plugin as any).configs.recommended = flatRecommended;

// For CommonJS consumers of the legacy format
const configs = {
  recommended: legacyRecommended,
};

// ---------------------------------------------------------------------------
// Export everything
// ---------------------------------------------------------------------------

export { rules, configs, pluginName };
export default plugin;

// CJS compatibility — ensure require() gets the plugin object
module.exports = plugin;
module.exports.default = plugin;
module.exports.rules = rules;
module.exports.configs = configs;
module.exports.pluginName = pluginName;
