import { createReadStream } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { InterruptedError } from '../errors.js';
import { quoteEtag } from './plan.js';

export class PartUploadError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  /** The presigned URL is no longer accepted; ask the API for fresh ones. */
  readonly urlExpired: boolean;

  constructor(message: string, status: number, retryable: boolean, urlExpired = false) {
    super(message);
    this.name = 'PartUploadError';
    this.status = status;
    this.retryable = retryable;
    this.urlExpired = urlExpired;
  }
}

export interface PutPartInput {
  url: string;
  filePath: string;
  start: number;
  length: number;
  signal: AbortSignal;
  /** Called with each chunk size as bytes leave the file. */
  onBytes(bytes: number): void;
  /** Socket inactivity limit. */
  idleTimeoutMs?: number;
}

export type PutPart = (input: PutPartInput) => Promise<string>;

/**
 * Streams one byte range of the backup to a presigned URL with an explicit
 * Content-Length (object storage rejects chunked part uploads) and returns
 * the quoted ETag.
 */
export const putPart: PutPart = (input) => {
  const { url, filePath, start, length, signal, onBytes } = input;
  return new Promise<string>((resolve, reject) => {
    if (signal.aborted) {
      reject(new InterruptedError());
      return;
    }
    const target = new URL(url);
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      target,
      {
        method: 'PUT',
        headers: { 'Content-Length': String(length) },
        signal,
        timeout: input.idleTimeoutMs ?? 120_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          if (chunks.length < 64) chunks.push(chunk);
        });
        res.on('error', (error) => reject(new PartUploadError(error.message, 0, true)));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          const body = Buffer.concat(chunks).toString('utf8').slice(0, 2000);
          if (status >= 200 && status < 300) {
            const etag = res.headers.etag;
            if (typeof etag === 'string' && etag.length > 0) {
              resolve(quoteEtag(etag));
            } else {
              // i18n-exempt: technical reason shown inside a translated message
              reject(new PartUploadError('missing ETag header', status, false));
            }
            return;
          }
          const expired =
            status === 403 ||
            (status === 400 && /expired|AccessDenied|SignatureDoesNotMatch/i.test(body));
          const retryable = status === 408 || status === 429 || status >= 500;
          reject(new PartUploadError(`HTTP ${status}`, status, retryable, expired));
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('socket timeout')));
    req.on('error', (error) => {
      if (signal.aborted) reject(new InterruptedError());
      else reject(new PartUploadError(error.message, 0, true));
    });

    const stream = createReadStream(filePath, {
      start,
      end: start + length - 1,
      highWaterMark: 1024 * 1024,
    });
    stream.on('data', (chunk) => onBytes(chunk.length));
    stream.on('error', (error) => {
      req.destroy(error);
      reject(new PartUploadError(error.message, 0, false));
    });
    stream.pipe(req);
  });
};
