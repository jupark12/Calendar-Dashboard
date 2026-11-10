export type Action = (fn: () => Promise<unknown>) => Promise<boolean>;
