/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />
/// <reference types="react/jsx-runtime" />
/// <reference types="react/jsx-dev-runtime" />

import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
  }
}

export {};
