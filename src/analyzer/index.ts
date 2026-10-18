// @bladecp/cli/analyzer: the backup analyzer core. It runs the same in Node
// and in a browser (no Node module, no network): give it the raw bytes of a
// cPanel backup and a gunzip, and it returns the report. Ready-made sources:
// @bladecp/cli/analyzer/node (a file path) and @bladecp/cli/analyzer/web (a
// File or Blob, for a Web Worker).

export { CAPABILITIES, type Capabilities } from './capabilities.js';
export {
  type AnalyzeOptions,
  type AnalyzeProgress,
  type AnalyzeSource,
  analyze,
  MAX_BACKUP_BYTES,
  phpVersionOf,
  RULES,
  SITE_WORK_VOLUME_BYTES,
} from './core/analyze.js';
export type { EngineErrorCode } from './core/errors.js';
export {
  type DestinationLike,
  preferredPrice,
  recommend,
  requirements,
} from './core/recommend.js';
export * from './core/report.js';
export type { StreamFailure } from './core/source.js';
