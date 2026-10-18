// The WordPress Multisite table scanner of the migration parser, ported one to
// one: a statement-aware SQL lexer that tracks strings, comments and
// backticks, so an "INSERT INTO `wp_blogs`" inside a post's content never
// counts, and only INSERTs into tables ending in `blogs`, `site` or
// `domain_mapping` are captured (at most 256 KiB each), every captured byte
// charged against the parser's metadata budget.
//
// The original reads one byte at a time from a buffered reader. Here the same
// steps are a state machine fed chunk by chunk (`push`, then `end` at the end
// of the dump), so a dump of any size streams through without an await per
// byte. Every "unread" of the original is a state change that looks at the
// same byte again.

import { binary } from './binary.js';
import { capError } from './errors.js';
import { atoi, equalFoldAscii, parseInt64, toLowerAscii, trimSpace } from './go.js';

export const STMT_BUFFER_CAP = 256 << 10;
export const MAX_NETWORK_SITES_NFR = 100;
const MAX_SCAN_TABLE_NAME = 256;
const MAX_SCAN_PREFIXES = 100;

export interface BlogRow {
  blogId: bigint;
  domain: string;
  path: string;
  public: number;
  archived: number;
  spam: number;
  deleted: number;
}

/** Why a group of multisite tables could not be read (a machine token and the table). */
export interface ScanNote {
  reason: string;
  table: string;
}

export interface PrefixScan {
  blogs: BlogRow[];
  siteRows: number;
  domainMapping: boolean;
  truncated: boolean;
  note: ScanNote | null;
}

const Kind = { Blogs: 0, Site: 1, DomainMapping: 2 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

const S = {
  Run: 0,
  Dash: 1,
  Slash: 2,
  Line: 3,
  Block: 4,
  Word1: 5,
  Spaces2: 6,
  Word2: 7,
  Spaces3: 8,
  Word3: 9,
  SpacesTable: 10,
  TableStart: 11,
  TableQuoted: 12,
  TableBare: 13,
  Statement: 14,
} as const;
type State = (typeof S)[keyof typeof S];

const isLetter = (b: number) => (b >= 0x61 && b <= 0x7a) || (b >= 0x41 && b <= 0x5a);
const isIdent = (b: number) =>
  isLetter(b) || (b >= 0x30 && b <= 0x39) || b === 0x5f /* _ */ || b === 0x24; /* $ */
const isSpace = (b: number) => b === 0x20 || b === 0x09 || b === 0x0d || b === 0x0a;

function classifyTable(name: string): { prefix: string; kind: Kind } | null {
  if (name.endsWith('domain_mapping'))
    return { prefix: name.slice(0, -14), kind: Kind.DomainMapping };
  if (name.endsWith('blogs')) return { prefix: name.slice(0, -5), kind: Kind.Blogs };
  if (name.endsWith('site')) return { prefix: name.slice(0, -4), kind: Kind.Site };
  return null;
}

function fail(ps: PrefixScan, note: ScanNote): void {
  if (!ps.note) ps.note = note;
}

export class DumpScanner {
  readonly prefixes = new Map<string, PrefixScan>();
  private state: State = S.Run;
  private word = '';
  private name = '';
  private star = false;
  // consumeStatement
  private inStr = 0;
  private esc = false;
  private peekQuote = false;
  private capture = false;
  private complete = true;
  private readonly body = new Uint8Array(STMT_BUFFER_CAP);
  private bodyLen = 0;
  private group: PrefixScan | null = null;
  private kind: Kind = Kind.Blogs;
  private table = '';

  constructor(private readonly charge: (n: number) => void) {}

  /** Feeds the next bytes of the dump. */
  push(chunk: Uint8Array): void {
    let i = 0;
    const n = chunk.length;
    while (i < n) {
      const b = chunk[i]!;
      switch (this.state) {
        case S.Run:
          if (isSpace(b) || b === 0x3b /* ; */) i += 1;
          else if (b === 0x2d /* - */) {
            i += 1;
            this.state = S.Dash;
          } else if (b === 0x2f /* / */) {
            i += 1;
            this.state = S.Slash;
          } else {
            this.word = '';
            this.state = S.Word1;
          }
          break;
        case S.Dash:
          if (b === 0x2d) {
            i += 1;
            this.state = S.Line;
          } else this.skip();
          break;
        case S.Slash:
          if (b === 0x2a /* * */) {
            i += 1;
            this.star = false;
            this.state = S.Block;
          } else this.skip();
          break;
        case S.Line: {
          const nl = chunk.indexOf(0x0a, i);
          if (nl < 0) i = n;
          else {
            i = nl + 1;
            this.state = S.Run;
          }
          break;
        }
        case S.Block:
          i += 1;
          if (this.star && b === 0x2f) this.state = S.Run;
          else this.star = b === 0x2a;
          break;
        case S.Word1:
        case S.Word2:
        case S.Word3:
          if (isLetter(b)) {
            i += 1;
            // readWord keeps 32 letters; the 33rd ends the word and is consumed.
            if (this.word.length >= 32) this.afterWord();
            else this.word += String.fromCharCode(b);
          } else this.afterWord();
          break;
        case S.Spaces2:
        case S.Spaces3:
        case S.SpacesTable:
          if (isSpace(b)) i += 1;
          else if (this.state === S.SpacesTable) this.state = S.TableStart;
          else {
            this.word = '';
            this.state = this.state === S.Spaces2 ? S.Word2 : S.Word3;
          }
          break;
        case S.TableStart:
          if (b === 0x60 /* ` */) {
            i += 1;
            this.name = '';
            this.state = S.TableQuoted;
          } else if (!isIdent(b)) this.skip();
          else {
            i += 1;
            this.name = String.fromCharCode(b);
            this.state = S.TableBare;
          }
          break;
        case S.TableQuoted:
          i += 1;
          if (b === 0x60) this.afterTable();
          else if (this.name.length >= MAX_SCAN_TABLE_NAME) this.skip();
          else this.name += String.fromCharCode(b);
          break;
        case S.TableBare:
          if (!isIdent(b)) this.afterTable();
          else {
            i += 1;
            if (this.name.length >= MAX_SCAN_TABLE_NAME) this.skip();
            else this.name += String.fromCharCode(b);
          }
          break;
        case S.Statement:
          i = this.statement(chunk, i);
          break;
      }
    }
  }

  /** The end of the dump. */
  end(): void {
    if (this.state === S.TableBare) {
      // The table name ran to the end of the dump: the original still classifies it.
      this.afterTable();
    }
    if (this.state === S.Statement && this.group) {
      this.peekQuote = false;
      this.finishCapture();
    }
    this.state = S.Run;
  }

  private afterWord(): void {
    const word = this.word;
    if (this.state === S.Word1) {
      if (equalFoldAscii(word, 'INSERT')) this.state = S.Spaces2;
      else this.skip();
    } else if (this.state === S.Word2 && equalFoldAscii(word, 'IGNORE')) {
      this.state = S.Spaces3;
    } else if (equalFoldAscii(word, 'INTO')) {
      this.state = S.SpacesTable;
    } else {
      this.skip();
    }
  }

  private afterTable(): void {
    const found = classifyTable(this.name);
    if (!found) {
      this.skip();
      return;
    }
    const ps = this.prefix(found.prefix);
    if (found.kind === Kind.DomainMapping) {
      ps.domainMapping = true;
      this.skip();
      return;
    }
    if (ps.note || ps.truncated) {
      this.skip();
      return;
    }
    this.group = ps;
    this.kind = found.kind;
    this.table = this.name;
    this.startStatement(true);
  }

  private prefix(p: string): PrefixScan {
    const known = this.prefixes.get(p);
    if (known) return known;
    if (this.prefixes.size >= MAX_SCAN_PREFIXES) {
      throw capError('table_prefixes', { limit: MAX_SCAN_PREFIXES });
    }
    this.charge(p.length);
    const ps: PrefixScan = {
      blogs: [],
      siteRows: 0,
      domainMapping: false,
      truncated: false,
      note: null,
    };
    this.prefixes.set(p, ps);
    return ps;
  }

  private skip(): void {
    this.group = null;
    this.startStatement(false);
  }

  private startStatement(capture: boolean): void {
    this.state = S.Statement;
    this.inStr = 0;
    this.esc = false;
    this.peekQuote = false;
    this.capture = capture;
    this.complete = true;
    this.bodyLen = 0;
  }

  /** consumeStatement over the chunk from `i`; returns where it stopped. */
  private statement(chunk: Uint8Array, start: number): number {
    let i = start;
    const n = chunk.length;
    const body = this.body;
    // Locals for the hot loop; written back before leaving.
    let inStr = this.inStr;
    let esc = this.esc;
    let capture = this.capture;
    let bodyLen = this.bodyLen;
    let ended = false;
    if (this.peekQuote && i < n) {
      // The quote that may close the string was the last byte of a chunk.
      this.peekQuote = false;
      if (chunk[i] === inStr) {
        i += 1;
        if (capture && bodyLen < STMT_BUFFER_CAP) body[bodyLen++] = inStr;
      } else inStr = 0;
    }
    while (i < n) {
      const b = chunk[i++]!;
      if (capture) {
        if (bodyLen < STMT_BUFFER_CAP) body[bodyLen++] = b;
        else {
          capture = false;
          this.complete = false;
        }
      }
      if (inStr !== 0) {
        if (esc) esc = false;
        else if (b === 0x5c /* \ */ && inStr !== 0x60) esc = true;
        else if (b === inStr) {
          // A doubled quote ('' or ``) stays inside the string.
          if (i < n) {
            if (chunk[i] === inStr) {
              i += 1;
              if (capture && bodyLen < STMT_BUFFER_CAP) body[bodyLen++] = b;
            } else inStr = 0;
          } else this.peekQuote = true;
        }
        continue;
      }
      if (b === 0x27 || b === 0x22 || b === 0x60) inStr = b;
      else if (b === 0x3b /* ; */) {
        if (capture) bodyLen -= 1;
        ended = true;
        break;
      }
    }
    this.inStr = inStr;
    this.esc = esc;
    this.capture = capture;
    this.bodyLen = bodyLen;
    if (ended) {
      if (this.group) this.finishCapture();
      this.state = S.Run;
    }
    return i;
  }

  private finishCapture(): void {
    const ps = this.group!;
    this.group = null;
    const length = this.bodyLen;
    this.charge(length);
    if (!this.complete) {
      fail(ps, { reason: 'statement_too_large', table: this.table });
      return;
    }
    ingest(ps, this.kind, this.table, this.body.subarray(0, length));
  }
}

// ------------------------------------------------------------ insert bodies

class BodyError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

class BodyParser {
  i = 0;
  constructor(private readonly b: Uint8Array) {}

  ws(): void {
    while (this.i < this.b.length && isSpace(this.b[this.i]!)) this.i += 1;
  }

  peek(): number {
    return this.i >= this.b.length ? 0 : this.b[this.i]!;
  }

  word(): string {
    const start = this.i;
    while (this.i < this.b.length && isLetter(this.b[this.i]!)) this.i += 1;
    return binary(this.b, start, this.i);
  }

  identList(): string[] {
    this.i += 1;
    const out: string[] = [];
    for (;;) {
      this.ws();
      let name: string;
      if (this.peek() === 0x60) {
        this.i += 1;
        const start = this.i;
        while (this.i < this.b.length && this.b[this.i] !== 0x60) this.i += 1;
        if (this.i >= this.b.length) throw new BodyError('unterminated_column_name');
        name = binary(this.b, start, this.i);
        this.i += 1;
      } else {
        const start = this.i;
        while (this.i < this.b.length && isIdent(this.b[this.i]!)) this.i += 1;
        name = binary(this.b, start, this.i);
      }
      if (name.length === 0) throw new BodyError('empty_column_name');
      out.push(name);
      this.ws();
      const c = this.peek();
      if (c === 0x2c) this.i += 1;
      else if (c === 0x29) {
        this.i += 1;
        return out;
      } else throw new BodyError('bad_column_list');
    }
  }

  tuple(): string[] {
    this.i += 1;
    const out: string[] = [];
    for (;;) {
      this.ws();
      const c = this.peek();
      if (c === 0x27 || c === 0x22) out.push(this.quoted(c));
      else if (c === 0) throw new BodyError('unterminated_tuple');
      else {
        const start = this.i;
        while (this.i < this.b.length && this.b[this.i] !== 0x2c && this.b[this.i] !== 0x29) {
          this.i += 1;
        }
        out.push(trimSpace(binary(this.b, start, this.i)));
      }
      this.ws();
      const d = this.peek();
      if (d === 0x2c) this.i += 1;
      else if (d === 0x29) {
        this.i += 1;
        return out;
      } else throw new BodyError('bad_tuple');
    }
  }

  quoted(q: number): string {
    this.i += 1;
    const out: number[] = [];
    while (this.i < this.b.length) {
      const c = this.b[this.i]!;
      if (c === 0x5c) {
        this.i += 1;
        if (this.i >= this.b.length) throw new BodyError('unterminated_escape');
        out.push(unescapeSql(this.b[this.i]!));
        this.i += 1;
      } else if (c === q) {
        if (this.i + 1 < this.b.length && this.b[this.i + 1] === q) {
          out.push(q);
          this.i += 2;
          continue;
        }
        this.i += 1;
        return binary(Uint8Array.from(out));
      } else {
        out.push(c);
        this.i += 1;
      }
    }
    throw new BodyError('unterminated_string');
  }
}

function unescapeSql(b: number): number {
  switch (b) {
    case 0x30:
      return 0;
    case 0x62:
      return 0x08;
    case 0x6e:
      return 0x0a;
    case 0x72:
      return 0x0d;
    case 0x74:
      return 0x09;
    case 0x5a:
      return 26;
    default:
      return b;
  }
}

function parseInsertBody(body: Uint8Array): { cols: string[] | null; tuples: string[][] } {
  const p = new BodyParser(body);
  p.ws();
  let cols: string[] | null = null;
  if (p.peek() === 0x28) {
    cols = p.identList();
    p.ws();
  }
  const word = p.word();
  if (!equalFoldAscii(word, 'VALUES') && !equalFoldAscii(word, 'VALUE')) {
    throw new BodyError('expected_values');
  }
  const tuples: string[][] = [];
  for (;;) {
    p.ws();
    if (p.peek() !== 0x28) break;
    tuples.push(p.tuple());
    p.ws();
    if (p.peek() === 0x2c) {
      p.i += 1;
      continue;
    }
    break;
  }
  if (tuples.length === 0) throw new BodyError('no_tuples');
  return { cols, tuples };
}

interface BlogColumns {
  blogId: number;
  domain: number;
  path: number;
  public: number;
  archived: number;
  spam: number;
  deleted: number;
  arity: number;
}

/** The standard 12-column wp_blogs layout. */
const POSITIONAL: BlogColumns = {
  blogId: 0,
  domain: 2,
  path: 3,
  public: 6,
  archived: 7,
  spam: 9,
  deleted: 10,
  arity: 12,
};

function blogColumns(cols: string[] | null): BlogColumns {
  if (cols === null) return POSITIONAL;
  const pos = new Map<string, number>();
  for (let i = 0; i < cols.length; i += 1) pos.set(toLowerAscii(cols[i]!), i);
  const find = (name: string) => {
    const i = pos.get(name);
    if (i === undefined) throw new BodyError(`missing_column_${name}`);
    return i;
  };
  return {
    blogId: find('blog_id'),
    domain: find('domain'),
    path: find('path'),
    public: find('public'),
    archived: find('archived'),
    spam: find('spam'),
    deleted: find('deleted'),
    arity: cols.length,
  };
}

function blogRow(tuple: string[], idx: BlogColumns): BlogRow {
  if (tuple.length !== idx.arity) throw new BodyError('tuple_arity');
  const blogId = parseInt64(tuple[idx.blogId]!);
  if (blogId === null) throw new BodyError('blog_id_not_integer');
  const status = (at: number, field: string) => {
    const n = atoi(tuple[at]!);
    if (n === null) throw new BodyError(`${field}_not_integer`);
    return n;
  };
  return {
    blogId,
    domain: tuple[idx.domain]!,
    path: tuple[idx.path]!,
    public: status(idx.public, 'public'),
    archived: status(idx.archived, 'archived'),
    spam: status(idx.spam, 'spam'),
    deleted: status(idx.deleted, 'deleted'),
  };
}

function ingest(ps: PrefixScan, kind: Kind, table: string, body: Uint8Array): void {
  let parsed: { cols: string[] | null; tuples: string[][] };
  try {
    parsed = parseInsertBody(body);
  } catch (error) {
    if (error instanceof BodyError) {
      fail(ps, { reason: error.reason, table });
      return;
    }
    throw error;
  }
  if (kind === Kind.Site) {
    ps.siteRows += parsed.tuples.length;
    return;
  }
  let idx: BlogColumns;
  try {
    idx = blogColumns(parsed.cols);
  } catch (error) {
    if (error instanceof BodyError) {
      fail(ps, { reason: error.reason, table });
      return;
    }
    throw error;
  }
  for (const tuple of parsed.tuples) {
    if (ps.blogs.length > MAX_NETWORK_SITES_NFR) {
      ps.truncated = true;
      return;
    }
    try {
      ps.blogs.push(blogRow(tuple, idx));
    } catch (error) {
      if (error instanceof BodyError) {
        fail(ps, { reason: error.reason, table });
        return;
      }
      throw error;
    }
  }
}
