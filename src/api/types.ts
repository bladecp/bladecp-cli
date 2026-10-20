/** One Customer API operation, as src/api/operations.ts describes it. */
export interface OperationSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path under /api/v1, with `{name}` placeholders. */
  path: string;
  /** API reference group. */
  tag: string;
  summary: string;
  /** Scopes the key needs, when the API reference states them. */
  scopes: readonly string[];
  pathParams: readonly string[];
  query: readonly string[];
  requiredQuery: readonly string[];
  /** The operation takes a JSON body. */
  body: boolean;
  /** The operation accepts an Idempotency-Key header. */
  idempotent: boolean;
  /** Answers without a key. */
  public: boolean;
}

/**
 * How the CLI reaches an operation: a command of its own, or only the generic
 * `bladecp api` (with the reason).
 */
export type Coverage =
  | { command: string }
  | {
      /**
       * `machine`: a step of an integration between systems (the WHMCS module,
       * federation, sign-in exchanges), not something a person runs.
       * `advanced`: a low-level form of something a command already does.
       * `probe`: a connectivity check.
       */
      api: 'machine' | 'advanced' | 'probe';
    };
