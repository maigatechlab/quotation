// Vitest global setup — Story 1.1 (T2).
// Intentionally minimal for the init story. Add jsdom polyfills / global mocks
// (e.g. matchMedia, IntersectionObserver) here as future stories need them.

// Story 1.4: enable React's act() environment for hook tests
// See: https://reactjs.org/blog/2022/03/08/react-18-upgrade-guide.html#configuring-your-testing-environment
;(globalThis as Record<string, unknown>)["IS_REACT_ACT_ENVIRONMENT"] = true

export {};
