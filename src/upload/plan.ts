import { CliError, ExitCode } from '../errors.js';
import type { UploadUrlResponse } from '../types.js';

export interface PartRef {
  partNumber: number;
  etag: string;
}

export interface UploadPlan {
  uploadId: string;
  partSize: number;
  partCount: number;
  /** Parts the storage already holds, by part number. */
  done: Map<number, PartRef>;
  /** Presigned URL for every part still missing, by part number. */
  pending: Map<number, string>;
  /** Epoch ms after which the URLs should be renewed, when known. */
  urlsExpireAt?: number | undefined;
}

export function partCountFor(sizeBytes: number, partSize: number): number {
  return Math.max(1, Math.ceil(sizeBytes / partSize));
}

/** Byte range of a 1-based part: `start` inclusive, `length` bytes. */
export function partRange(
  partNumber: number,
  partSize: number,
  sizeBytes: number,
): { start: number; length: number } {
  const start = (partNumber - 1) * partSize;
  return { start, length: Math.max(0, Math.min(partSize, sizeBytes - start)) };
}

/** Same quoting the Hub uses, so complete-upload sees one ETag format. */
export function quoteEtag(etag: string): string {
  const trimmed = etag.trim();
  return trimmed.startsWith('"') ? trimmed : `"${trimmed}"`;
}

function inconsistent(): CliError {
  return new CliError(
    'upload.planInconsistent',
    {},
    { exitCode: ExitCode.NETWORK, code: 'upload_plan_inconsistent' },
  );
}

/**
 * Turns an `upload-url` answer into a plan.
 *
 * The storage view (`uploadedParts`) is authoritative. Local ETags are only
 * used when the API keeps the same upload but does not report the parts it
 * holds; a different `uploadId` always means starting over.
 */
export function buildUploadPlan(
  response: UploadUrlResponse,
  sizeBytes: number,
  options: { now: number; local?: { uploadId: string | null; parts: PartRef[] } },
): UploadPlan {
  const { uploadId, partSize } = response;
  if (typeof uploadId !== 'string' || uploadId.length === 0) throw inconsistent();
  if (!Number.isInteger(partSize) || partSize <= 0) throw inconsistent();
  const partCount = partCountFor(sizeBytes, partSize);
  if (response.partCount !== undefined && response.partCount !== partCount) throw inconsistent();
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= partCount;

  const done = new Map<number, PartRef>();
  if (Array.isArray(response.uploadedParts)) {
    for (const part of response.uploadedParts) {
      if (!inRange(part.partNumber) || !part.etag) continue;
      const expected = partRange(part.partNumber, partSize, sizeBytes).length;
      if (typeof part.sizeBytes === 'number' && part.sizeBytes !== expected) continue;
      done.set(part.partNumber, { partNumber: part.partNumber, etag: quoteEtag(part.etag) });
    }
  } else if (options.local && options.local.uploadId === uploadId) {
    for (const part of options.local.parts) {
      if (inRange(part.partNumber) && part.etag) done.set(part.partNumber, part);
    }
  }

  const pending = new Map<number, string>();
  for (const part of response.parts ?? []) {
    if (!inRange(part.partNumber) || typeof part.url !== 'string') continue;
    if (!done.has(part.partNumber)) pending.set(part.partNumber, part.url);
  }

  for (let n = 1; n <= partCount; n += 1) {
    if (!done.has(n) && !pending.has(n)) throw inconsistent();
  }

  const expiresIn = typeof response.expiresIn === 'number' ? response.expiresIn : undefined;
  return {
    uploadId,
    partSize,
    partCount,
    done,
    pending,
    urlsExpireAt: expiresIn ? options.now + expiresIn * 1000 : undefined,
  };
}

export function bytesDone(plan: UploadPlan, sizeBytes: number): number {
  let total = 0;
  for (const n of plan.done.keys()) total += partRange(n, plan.partSize, sizeBytes).length;
  return total;
}

export function orderedParts(plan: UploadPlan): PartRef[] {
  return [...plan.done.values()].sort((a, b) => a.partNumber - b.partNumber);
}
