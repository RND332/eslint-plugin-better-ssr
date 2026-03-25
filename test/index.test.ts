import { RuleTester } from "eslint";
import * as globals from "globals";
import { noDomGlobalsInModuleScope } from "../src/rules/no-dom-globals-in-module-scope";
import { noDomGlobalsInReact } from "../src/rules/no-dom-globals-in-react";

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    parser: require("@typescript-eslint/parser"),
    parserOptions: { ecmaFeatures: { jsx: true } },
    globals: { ...globals.browser, ...globals.node, ...globals.es2021 },
  },
});

// =========================================================================
// no-dom-globals-in-module-scope
// =========================================================================

tester.run("no-dom-globals-in-module-scope", noDomGlobalsInModuleScope as any, {
  valid: [
    { code: `function getPixelRatio() { return devicePixelRatio; }` },
    { code: `const getPixelRatio = () => devicePixelRatio;` },
    { code: `const isRetina = () => devicePixelRatio >= 2;` },
    { code: `const isWindowAvailable = typeof window !== "undefined";` },
    {
      code: `export type GenericProps = { icon?: React.SVGAttributes<SVGSymbolElement> };`,
    },
    {
      code: `function createNode() { return new AnalyserNode(context, options); }`,
    },
    // Imported names that match browser globals should not be flagged
    {
      code: `import { CSS } from '@dnd-kit/utilities';\nconst style = { transform: CSS.Transform.toString(transform) };`,
    },
    // Static DOM constants (Node.ELEMENT_NODE, etc.) are safe — just numbers
    {
      code: `const ELEMENT = Node.ELEMENT_NODE;`,
    },
    {
      code: `const isElement = (n: Node) => n.nodeType === Node.ELEMENT_NODE;`,
    },
  ],
  invalid: [
    {
      code: `const isTouch = useMemo(() => navigator.maxTouchPoints > 0, []);`,
      errors: [{ messageId: "moduleScope" }],
    },
    {
      code: `const px = devicePixelRatio;`,
      errors: [{ messageId: "moduleScope" }],
    },
    {
      code: `const retina = devicePixelRatio > 2;`,
      errors: [{ messageId: "moduleScope" }],
    },
    {
      code: `const dimensions = [screenX];`,
      errors: [{ messageId: "moduleScope" }],
    },
    {
      code: `const offsets = { x: pageXOffset };`,
      errors: [{ messageId: "moduleScope" }],
    },
    {
      code: `const tb = window.toolbar;`,
      errors: [{ messageId: "moduleScope" }],
    },
  ],
});

console.log("✅ no-dom-globals-in-module-scope passed");

// =========================================================================
// no-dom-globals-in-react — valid cases
// =========================================================================

tester.run("no-dom-globals-in-react-valid", noDomGlobalsInReact as any, {
  valid: [
    {
      code: `const Header = () => {
        useEffect(() => { document.title = "Otto"; }, []);
        return <div />;
      };`,
    },
    {
      code: `const Header = () => {
        useEffect(() => { window.addEventListener('resize', () => {}); }, []);
        return <div />;
      };`,
    },
    {
      code: `const Header = () => {
        useLayoutEffect(() => { document.title = "Otto"; }, []);
        return <div />;
      };`,
    },
    {
      code: `function useDevicePixelRatio() {
        if (typeof window !== 'undefined') { return window.devicePixelRatio; }
        return 1;
      }`,
    },
    {
      code: `const useLocalStorage = () => {
        const [value, setValue] = useState(() => localStorage.getItem('key'));
        return [value, setValue];
      };`,
    },
    {
      code: `function useTitle(title) {
        useEffect(() => { document.title = title; }, [title]);
      }`,
    },
    {
      code: `const Header = React.forwardRef(function (props, ref) {
        useEffect(() => { window.addEventListener('resize', () => {}); }, []);
        return <div {...props} ref={ref} />;
      });`,
    },
    {
      code: `const Header = () => {
        useEffect(() => { window.addEventListener('resize', () => {}); }, []);
        return true ? <div /> : <div />;
      };`,
    },
    // typeof guard inside useMemo — safe
    {
      code: `const isTouchDevice = useMemo(() => {
        if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
        return 'ontouchstart' in globalThis || navigator.maxTouchPoints > 0;
      }, []);`,
    },
    // typeof guard with !== in component body
    {
      code: `const Header = () => {
        if (typeof window !== 'undefined') {
          const w = window.innerWidth;
          return <div data-width={w} />;
        }
        return <div />;
      };`,
    },
    // typeof guard with ternary
    {
      code: `const width = typeof window !== 'undefined' ? window.innerWidth : 0;`,
    },
    // typeof guard with &&
    {
      code: `const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;`,
    },
    // globalThis-based guard (unicorn/prefer-global-this pattern)
    {
      code: `const isTouchDevice = useMemo(() => {
        if (typeof globalThis === 'undefined') return false;
        return 'ontouchstart' in globalThis;
      }, []);`,
    },
    // globalThis guard with window
    {
      code: `const isTouchDevice = useMemo(() => {
        if (typeof globalThis === 'undefined' || typeof window === 'undefined') return false;
        return 'ontouchstart' in globalThis || navigator.maxTouchPoints > 0;
      }, []);`,
    },
    // typeof guard in useCallback
    {
      code: `const Header = () => {
        const getSize = useCallback(() => {
          if (typeof window === 'undefined') return { w: 0, h: 0 };
          return { w: window.innerWidth, h: window.innerHeight };
        }, []);
        return <div />;
      };`,
    },
    // Imported CSS from library should not be flagged (false positive fix)
    {
      code: `import { CSS } from '@dnd-kit/utilities';
const Sortable = () => {
  const style = { transform: CSS.Transform.toString(transform) };
  return <li style={style} />;
};`,
    },
    // Node.ELEMENT_NODE is a static constant — safe in component body
    {
      code: `const useIsElement = () => {
        const check = useCallback((n: Node) => n.nodeType === Node.ELEMENT_NODE, []);
        return check;
      };`,
    },
    {
      code: `"use client";
const isTouch = navigator.maxTouchPoints > 0;
export default isTouch;`,
      options: [{ allowInUseClient: true }],
    },
    {
      code: `"use server";
const width = window.innerWidth;
export default width;`,
      options: [{ allowInUseClient: true }],
    },
    {
      code: `function getPixelRatio() { return devicePixelRatio; }`,
    },
  ],
  invalid: [],
});

console.log("✅ no-dom-globals-in-react valid cases passed");

// =========================================================================
// no-dom-globals-in-react — invalid cases
// =========================================================================

tester.run("no-dom-globals-in-react-invalid", noDomGlobalsInReact as any, {
  valid: [],
  invalid: [
    {
      code: `const isTouch = useMemo(() => navigator.maxTouchPoints > 0, []);`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = () => {
        document.title = "Otto";
        return <div />;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = () => {
        const width = window.innerWidth;
        return <div style={{ width }} />;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = () => {
        window.addEventListener('resize', () => {});
        return <div />;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
    // typeof guard that does NOT return early — still unsafe
    {
      code: `const Header = () => {
        if (typeof window !== 'undefined') {
          console.log('client');
        }
        return <div data-w={window.innerWidth} />;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = () => {
        document.title = "Otto";
        return <><div>Header</div></>;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = () => {
        const handleClick = useCallback(() => { window.alert('clicked'); }, []);
        return <button onClick={handleClick}>Click</button>;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = () => {
        const ref = useRef(document.createElement('div'));
        return <div ref={ref} />;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = function ({url}) {
        const href = url + window.location.hash;
        return <>{href}</>;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `function Header({url}) {
        const href = url + window.location.hash;
        return <>{href}</>;
      }`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `function Header({url}) {
        const href = url + window.location.hash;
        return null;
      }`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = React.forwardRef(function (props, ref) {
        const href = url + window.location.hash;
        return <div {...props} ref={ref}>{href}</div>;
      });`,
      errors: [{ messageId: "reactFC" }],
    },
    {
      code: `const Header = () => {
        document.title = "Otto";
        return true ? <div /> : <div />;
      };`,
      errors: [{ messageId: "reactFC" }],
    },
  ],
});

console.log("✅ no-dom-globals-in-react invalid cases passed");

// =========================================================================
// "use client" without allowInUseClient — should still flag
// =========================================================================

tester.run(
  "no-dom-globals-in-react use-client no option",
  noDomGlobalsInReact as any,
  {
    valid: [],
    invalid: [
      {
        code: `"use client";
const Header = () => {
  const touch = navigator.maxTouchPoints > 0;
  return <div data-touch={touch} />;
};
export default Header;`,
        errors: [{ messageId: "reactFC" }],
      },
    ],
  },
);

console.log("✅ All tests passed!");
