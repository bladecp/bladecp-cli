import { describe, expect, it } from 'vitest';

import { CliError } from '../src/errors.js';
import type { UploadUrlResponse } from '../src/types.js';
import { buildUploadPlan, partCountFor, partRange, quoteEtag } from '../src/upload/plan.js';
import { PartUploadError, type PutPartInput } from '../src/upload/put.js';
import { uploadBackup } from '../src/upload/uploader.js';

const urls = (uploadId: string, numbers: number[]) =>
  numbers.map((partNumber) => ({
    partNumber,
    url: `https://storage.example.com/${uploadId}/${partNumber}`,
  }));

describe('upload planning', () => {
  it('splits the file into parts of the size the API chose', () => {
    expect(partCountFor(250, 100)).toBe(3);
    expect(partCountFor(1, 100)).toBe(1);
    expect(partRange(3, 100, 250)).toEqual({ start: 200, length: 50 });
    expect(partRange(1, 100, 250)).toEqual({ start: 0, length: 100 });
  });

  it('quotes ETags the same way the Hub does', () => {
    expect(quoteEtag('abc')).toBe('"abc"');
    expect(quoteEtag('"abc"')).toBe('"abc"');
  });

  it('trusts uploadedParts from the API and only keeps URLs for missing parts', () => {
    const plan = buildUploadPlan(
      {
        uploadId: 'u1',
        partSize: 100,
        parts: urls('u1', [2, 3]),
        uploadedParts: [{ partNumber: 1, etag: 'e1', sizeBytes: 100 }],
        expiresIn: 3600,
      },
      250,
      { now: 1000 },
    );
    expect([...plan.done.keys()]).toEqual([1]);
    expect(plan.done.get(1)?.etag).toBe('"e1"');
    expect([...plan.pending.keys()]).toEqual([2, 3]);
    expect(plan.urlsExpireAt).toBe(1000 + 3_600_000);
  });

  it('ignores an uploaded part whose size does not match and re-sends it', () => {
    const plan = buildUploadPlan(
      {
        uploadId: 'u1',
        partSize: 100,
        parts: urls('u1', [1, 2, 3]),
        uploadedParts: [{ partNumber: 1, etag: 'e1', sizeBytes: 7 }],
      },
      250,
      { now: 0 },
    );
    expect(plan.done.size).toBe(0);
    expect(plan.pending.size).toBe(3);
  });

  it('uses local ETags only for the same upload when the API does not list parts', () => {
    const same = buildUploadPlan({ uploadId: 'u1', partSize: 100, parts: urls('u1', [3]) }, 250, {
      now: 0,
      local: {
        uploadId: 'u1',
        parts: [
          { partNumber: 1, etag: '"a"' },
          { partNumber: 2, etag: '"b"' },
        ],
      },
    });
    expect([...same.done.keys()]).toEqual([1, 2]);

    const other = buildUploadPlan(
      { uploadId: 'u2', partSize: 100, parts: urls('u2', [1, 2, 3]) },
      250,
      {
        now: 0,
        local: { uploadId: 'u1', parts: [{ partNumber: 1, etag: '"a"' }] },
      },
    );
    expect(other.done.size).toBe(0);
  });

  it('refuses a plan whose partCount disagrees with partSize', () => {
    expect(() =>
      buildUploadPlan(
        { uploadId: 'u1', partSize: 100, partCount: 2, parts: urls('u1', [1, 2, 3]) },
        250,
        {
          now: 0,
        },
      ),
    ).toThrow(CliError);
    const ok = buildUploadPlan(
      { uploadId: 'u1', partSize: 100, partCount: 3, parts: urls('u1', [1, 2, 3]) },
      250,
      { now: 0 },
    );
    expect(ok.partCount).toBe(3);
  });

  it('refuses a plan that leaves a part without a URL', () => {
    expect(() =>
      buildUploadPlan({ uploadId: 'u1', partSize: 100, parts: urls('u1', [1, 2]) }, 250, {
        now: 0,
      }),
    ).toThrow(CliError);
    expect(() =>
      buildUploadPlan({ uploadId: '', partSize: 100, parts: [] }, 10, { now: 0 }),
    ).toThrow(CliError);
  });
});

function harness(responses: UploadUrlResponse[], put: (input: PutPartInput) => Promise<string>) {
  const calls = { requestUrls: 0, plans: [] as string[], sleeps: [] as number[] };
  const run = () =>
    uploadBackup(
      {
        filePath: '/dev/null',
        sizeBytes: 250,
        concurrency: 2,
        maxAttempts: 3,
        baseDelayMs: 100,
        putPart: put,
        sleep: async (ms) => {
          calls.sleeps.push(ms);
        },
        now: () => 0,
        random: () => 1,
        signal: new AbortController().signal,
      },
      {
        requestUrls: async () => {
          const next = responses[Math.min(calls.requestUrls, responses.length - 1)]!;
          calls.requestUrls += 1;
          return next;
        },
        onPlan: async (plan) => {
          calls.plans.push(plan.uploadId);
        },
        onPartDone: async () => undefined,
        onProgress: () => undefined,
      },
    );
  return { run, calls };
}

describe('uploader', () => {
  it('never runs more parts at once than the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const { run } = harness(
      [{ uploadId: 'u1', partSize: 50, parts: urls('u1', [1, 2, 3, 4, 5]) }],
      async (input) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        input.onBytes(10);
        active -= 1;
        return `"etag-${input.start}"`;
      },
    );
    const result = await run();
    expect(peak).toBe(2);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('retries a part with exponential backoff and gives up after maxAttempts', async () => {
    const { run, calls } = harness(
      [{ uploadId: 'u1', partSize: 250, parts: urls('u1', [1]) }],
      async () => {
        throw new PartUploadError('HTTP 500', 500, true);
      },
    );
    await expect(run()).rejects.toMatchObject({
      key: 'upload.partFailed',
      vars: { part: 1, attempts: 3 },
    });
    expect(calls.sleeps).toEqual([100, 200]);
  });

  it('does not retry a part the storage rejected for good', async () => {
    let attempts = 0;
    const { run, calls } = harness(
      [{ uploadId: 'u1', partSize: 250, parts: urls('u1', [1]) }],
      async () => {
        attempts += 1;
        throw new PartUploadError('HTTP 400', 400, false);
      },
    );
    await expect(run()).rejects.toBeInstanceOf(CliError);
    expect(attempts).toBe(1);
    expect(calls.sleeps).toEqual([]);
  });

  it('renews URLs when one expires, without counting it as a failed attempt', async () => {
    const seen: string[] = [];
    const { run, calls } = harness(
      [
        { uploadId: 'u1', partSize: 250, parts: urls('u1', [1]) },
        {
          uploadId: 'u1',
          partSize: 250,
          parts: [{ partNumber: 1, url: 'https://storage.example.com/fresh/1' }],
          uploadedParts: [],
        },
      ],
      async (input) => {
        seen.push(input.url);
        if (seen.length === 1) throw new PartUploadError('HTTP 403', 403, false, true);
        return '"ok"';
      },
    );
    await run();
    expect(seen).toEqual([
      'https://storage.example.com/u1/1',
      'https://storage.example.com/fresh/1',
    ]);
    expect(calls.requestUrls).toBe(2);
    expect(calls.sleeps).toEqual([]);
  });

  it('starts over when the API replaced the upload', async () => {
    let first = true;
    const { run, calls } = harness(
      [
        { uploadId: 'u1', partSize: 250, parts: urls('u1', [1]) },
        { uploadId: 'u2', partSize: 250, parts: urls('u2', [1]), uploadedParts: [] },
      ],
      async (input) => {
        if (first) {
          first = false;
          throw new PartUploadError('HTTP 403', 403, false, true);
        }
        return `"${input.url.split('/')[3]}"`;
      },
    );
    const result = await run();
    expect(calls.plans).toEqual(['u1', 'u2']);
    expect(result.uploadId).toBe('u2');
    expect(result.parts).toEqual([{ partNumber: 1, etag: '"u2"' }]);
  });
});
