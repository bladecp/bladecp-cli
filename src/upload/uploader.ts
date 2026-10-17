import type { Sleep } from '../api.js';
import { CliError, ExitCode, InterruptedError } from '../errors.js';
import type { UploadUrlResponse } from '../types.js';
import {
  buildUploadPlan,
  bytesDone,
  orderedParts,
  type PartRef,
  partRange,
  type UploadPlan,
} from './plan.js';
import { PartUploadError, type PutPart } from './put.js';

export interface UploadCallbacks {
  /** Asks the API for upload URLs (always with `resume: true`). */
  requestUrls(): Promise<UploadUrlResponse>;
  /** A new plan was adopted (first one, or a restarted upload). */
  onPlan(plan: UploadPlan): Promise<void>;
  /** A part finished; persist progress. */
  onPartDone(plan: UploadPlan): Promise<void>;
  onProgress(uploadedBytes: number, totalBytes: number): void;
  onRetry?(partNumber: number, nextAttempt: number, delayMs: number): void;
}

export interface UploadOptions {
  filePath: string;
  sizeBytes: number;
  local?: { uploadId: string | null; parts: PartRef[] };
  concurrency?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  putPart: PutPart;
  sleep: Sleep;
  now(): number;
  random(): number;
  signal: AbortSignal;
}

/** Thrown inside a run when the API replaced the multipart upload. */
class UploadRestart extends Error {
  constructor(readonly plan: UploadPlan) {
    super('upload restarted');
  }
}

const URL_RENEW_MARGIN_MS = 5 * 60 * 1000;
const MAX_RESTARTS = 2;
const MAX_URL_REFRESHES_PER_PART = 3;

/**
 * Uploads every missing part with limited concurrency. Each part is retried
 * with exponential backoff and jitter; expired URLs are renewed through the
 * API without losing the parts already stored.
 */
export async function uploadBackup(
  options: UploadOptions,
  callbacks: UploadCallbacks,
): Promise<{
  uploadId: string;
  parts: PartRef[];
}> {
  const { sizeBytes, signal } = options;
  let plan = buildUploadPlan(await callbacks.requestUrls(), sizeBytes, {
    now: options.now(),
    local: options.local,
  });
  await callbacks.onPlan(plan);

  for (let restarts = 0; ; restarts += 1) {
    try {
      await runPlan(plan, options, callbacks);
      break;
    } catch (error) {
      if (error instanceof UploadRestart && restarts < MAX_RESTARTS) {
        plan = error.plan;
        await callbacks.onPlan(plan);
        continue;
      }
      if (error instanceof UploadRestart) {
        throw new CliError(
          'upload.restartLoop',
          {},
          { exitCode: ExitCode.NETWORK, code: 'upload_restarted' },
        );
      }
      throw error;
    }
  }
  if (signal.aborted) throw new InterruptedError();
  callbacks.onProgress(sizeBytes, sizeBytes);
  return { uploadId: plan.uploadId, parts: orderedParts(plan) };
}

async function runPlan(
  plan: UploadPlan,
  options: UploadOptions,
  callbacks: UploadCallbacks,
): Promise<void> {
  const { sizeBytes, filePath } = options;
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;

  const run = new AbortController();
  const onOuterAbort = () => run.abort();
  options.signal.addEventListener('abort', onOuterAbort, { once: true });

  const inflight = new Map<number, number>();
  const report = () => {
    let sending = 0;
    for (const bytes of inflight.values()) sending += bytes;
    callbacks.onProgress(Math.min(sizeBytes, bytesDone(plan, sizeBytes) + sending), sizeBytes);
  };
  report();

  // Single-flight URL renewal shared by all workers.
  let refreshing: Promise<void> | null = null;
  const refreshUrls = () => {
    if (!refreshing) {
      refreshing = (async () => {
        const next = buildUploadPlan(await callbacks.requestUrls(), sizeBytes, {
          now: options.now(),
        });
        if (next.uploadId !== plan.uploadId) throw new UploadRestart(next);
        for (const [n, ref] of next.done) {
          if (!plan.done.has(n)) plan.done.set(n, ref);
          plan.pending.delete(n);
        }
        for (const [n, url] of next.pending) {
          if (!plan.done.has(n)) plan.pending.set(n, url);
        }
        plan.urlsExpireAt = next.urlsExpireAt;
      })().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  };

  const queue = [...plan.pending.keys()].sort((a, b) => a - b);

  const uploadOne = async (partNumber: number) => {
    const { start, length } = partRange(partNumber, plan.partSize, sizeBytes);
    let urlRefreshes = 0;
    for (let attempt = 1; ; attempt += 1) {
      if (run.signal.aborted) throw new InterruptedError();
      if (plan.done.has(partNumber)) return;
      if (plan.urlsExpireAt && options.now() > plan.urlsExpireAt - URL_RENEW_MARGIN_MS) {
        await refreshUrls();
        if (plan.done.has(partNumber)) return;
      }
      const url = plan.pending.get(partNumber);
      if (!url)
        throw new CliError(
          'upload.planInconsistent',
          {},
          { exitCode: ExitCode.NETWORK, code: 'upload_plan_inconsistent' },
        );
      inflight.set(partNumber, 0);
      try {
        const etag = await options.putPart({
          url,
          filePath,
          start,
          length,
          signal: run.signal,
          onBytes: (bytes) => {
            inflight.set(partNumber, (inflight.get(partNumber) ?? 0) + bytes);
            report();
          },
        });
        inflight.delete(partNumber);
        plan.done.set(partNumber, { partNumber, etag });
        plan.pending.delete(partNumber);
        report();
        await callbacks.onPartDone(plan);
        return;
      } catch (error) {
        inflight.delete(partNumber);
        report();
        if (run.signal.aborted || error instanceof InterruptedError) throw new InterruptedError();
        if (!(error instanceof PartUploadError)) throw error;
        if (error.urlExpired && urlRefreshes < MAX_URL_REFRESHES_PER_PART) {
          urlRefreshes += 1;
          await refreshUrls();
          // A renewal is not a failed attempt.
          attempt -= 1;
          continue;
        }
        if (!error.retryable || attempt >= maxAttempts) {
          throw new CliError(
            'upload.partFailed',
            { part: partNumber, attempts: attempt, reason: error.message },
            {
              exitCode: ExitCode.NETWORK,
              code: 'upload_failed',
              hint: { key: 'hint.rerunToResume' },
            },
          );
        }
        const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        const delay = Math.round(backoff * (0.5 + options.random() / 2));
        callbacks.onRetry?.(partNumber, attempt + 1, delay);
        await options.sleep(delay, run.signal);
      }
    }
  };

  let firstError: unknown;
  const worker = async () => {
    for (;;) {
      if (firstError !== undefined) return;
      const next = queue.shift();
      if (next === undefined) return;
      try {
        await uploadOne(next);
      } catch (error) {
        if (firstError === undefined) {
          firstError = error;
          // Stop the other parts; their bytes are not wasted, the storage
          // keeps every finished part for the next run.
          run.abort();
        }
        return;
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  } finally {
    options.signal.removeEventListener('abort', onOuterAbort);
  }
  if (firstError !== undefined) {
    if (options.signal.aborted) throw new InterruptedError();
    throw firstError;
  }
}
