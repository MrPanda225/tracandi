/**
 * React Router v7 behaviours adopted now (state updates in transitions, relative paths inside splat routes): the
 * application and its tests run the same way, without the upgrade warnings.
 */
export const ROUTER_FUTURE = { v7_startTransition: true, v7_relativeSplatPath: true } as const;
