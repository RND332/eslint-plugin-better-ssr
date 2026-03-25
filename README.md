# eslint-plugin-better-ssr

Modern TypeScript fork of [eslint-plugin-ssr-friendly](https://github.com/kopiro/eslint-plugin-ssr-friendly) with ESLint 8/9/10, flat config, and Next.js App Router support.

Detects incorrect use of DOM globals (`window`, `document`, `navigator`, etc.) to help you write SSR-safe code that works in both Node.js and the browser.

## Installation

```bash
npm install --save-dev eslint-plugin-better-ssr
```

## Usage

### Flat config (`eslint.config.js`) — ESLint 9+

```js
// eslint.config.js
import betterSsr from "eslint-plugin-better-ssr";

export default [
  betterSsr.configs.recommended,
  // ... your other configs
];
```

### Legacy config (`.eslintrc`) — ESLint 8

```json
{
  "plugins": ["better-ssr"],
  "extends": ["plugin:better-ssr/recommended"]
}
```

## Rules

### `no-dom-globals-in-module-scope`

Disallow use of DOM globals at the module or global scope. Accessing `window`, `document`, `navigator`, etc. during `import` will crash in Node.js.

```js
// ❌ Bad — crashes on the server
const retina = devicePixelRatio > 2;

// ✅ Good — lazy evaluation
const getRetina = () => devicePixelRatio > 2;

// ✅ Good — typeof guard
const width = typeof window !== "undefined" ? window.innerWidth : 0;
```

### `no-dom-globals-in-react`

Disallow use of DOM globals in React component bodies, class constructors, render methods, and SSR-unsafe hook callbacks (`useMemo`, `useCallback`, `useRef`).

DOM globals **are** allowed inside:

- `useEffect` / `useLayoutEffect` callbacks
- Custom hooks (functions starting with `use`)
- Files with `"use client"` directive (opt-in)

```js
// ❌ Bad — runs during SSR
const Header = () => {
  const width = window.innerWidth;
  return <div style={{ width }} />;
};

// ❌ Bad — useMemo runs during SSR
const isTouch = useMemo(() => navigator.maxTouchPoints > 0, []);

// ✅ Good — useEffect only runs on the client
const Header = () => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    setWidth(window.innerWidth);
  }, []);
  return <div style={{ width }} />;
};

// ✅ Good — custom hook
function useDevicePixelRatio() {
  if (typeof window !== "undefined") {
    return window.devicePixelRatio;
  }
  return 1;
}
```

### Options

#### `allowInUseClient`

Type: `boolean` (default: `false`)

When `true`, files starting with a `"use client"` or `"use server"` directive are skipped by `no-dom-globals-in-react`:

```js
// eslint.config.js
import betterSsr from "eslint-plugin-better-ssr";

export default [
  {
    plugins: { "better-ssr": betterSsr },
    rules: {
      "better-ssr/no-dom-globals-in-react": [
        "error",
        { allowInUseClient: true },
      ],
    },
  },
];
```

## Backward Compatibility

The original rule names are preserved as aliases so existing configs continue to work after upgrading:

| Old name (v1)                       | New name (v2)                    |
| ----------------------------------- | -------------------------------- |
| `no-dom-globals-in-module-scope`    | `no-dom-globals-in-module-scope` |
| `no-dom-globals-in-react-fc`        | `no-dom-globals-in-react`        |
| `no-dom-globals-in-react-cc-render` | `no-dom-globals-in-react`        |
| `no-dom-globals-in-constructor`     | `no-dom-globals-in-react`        |

## License

MIT
