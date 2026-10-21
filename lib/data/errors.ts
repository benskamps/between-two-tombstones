// Named failures for every outside data source. The UI and the API both say
// which source failed and what to do next; nothing turns a failure into "empty".

export type DataSource = "Wikidata" | "Wikipedia" | "OpenStreetMap";

export type FailureKind = "unreachable" | "timeout" | "rate-limited" | "bad-response";

export type ErrorBody = { error: { source: DataSource; message: string } };

const MARK = "[[btt:";

/**
 * A failure from one named source. The details are also encoded in the message,
 * because errors thrown inside a `'use cache'` scope can cross the cache
 * boundary as plain Errors; `asDataSourceError` recovers them from the text.
 */
export class DataSourceError extends Error {
  readonly source: DataSource;
  readonly kind: FailureKind;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  readonly detail: string;

  constructor(
    source: DataSource,
    kind: FailureKind,
    detail: string,
    opts: { status?: number; retryAfterSeconds?: number; cause?: unknown } = {},
  ) {
    const meta = JSON.stringify({ source, kind, status: opts.status, retryAfterSeconds: opts.retryAfterSeconds });
    super(`${detail} ${MARK}${meta}]]`, { cause: opts.cause });
    this.name = "DataSourceError";
    this.source = source;
    this.kind = kind;
    this.status = opts.status;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.detail = detail;
  }

  /** HTTP status for our API: 503 when the source is down or limiting us, 502 when it answered badly. */
  get httpStatus(): 502 | 503 {
    return this.kind === "bad-response" ? 502 : 503;
  }

  /** What a person reads. Plain, names the source, says what to do. */
  get userMessage(): string {
    return userMessageFor(this.source, this.kind);
  }

  toBody(): ErrorBody {
    return { error: { source: this.source, message: this.userMessage } };
  }
}

export function userMessageFor(source: DataSource, kind: FailureKind): string {
  switch (kind) {
    case "rate-limited":
      return `${source} asked us to slow down. Try again in a minute, or open a saved tour.`;
    case "bad-response":
      return `${source} sent back something we couldn't read. Try again in a minute, or open a saved tour.`;
    case "timeout":
      return `${source} took too long to answer. Try again in a minute, or open a saved tour.`;
    default:
      return `Couldn't reach ${source}. Try again in a minute, or open a saved tour.`;
  }
}

/** Recover a DataSourceError from anything thrown, falling back to "unreachable" for `fallback`. */
export function asDataSourceError(err: unknown, fallback: DataSource): DataSourceError {
  if (err instanceof DataSourceError) return err;
  const text = err instanceof Error ? err.message : String(err);
  const at = text.indexOf(MARK);
  if (at >= 0) {
    const end = text.indexOf("]]", at);
    try {
      const meta = JSON.parse(text.slice(at + MARK.length, end)) as {
        source: DataSource;
        kind: FailureKind;
        status?: number;
        retryAfterSeconds?: number;
      };
      return new DataSourceError(meta.source, meta.kind, text.slice(0, at).trim(), {
        status: meta.status,
        retryAfterSeconds: meta.retryAfterSeconds,
        cause: err,
      });
    } catch {
      // Fall through to the generic failure below.
    }
  }
  // A production build replaces the message of an error thrown inside 'use cache'
  // with a generic one (and adds a digest). Never show that text to a person.
  return new DataSourceError(fallback, "unreachable", REDACTED.test(text) ? "the request failed." : text, { cause: err });
}

/** Next's production stand-in for a hidden server error message. */
const REDACTED = /^An error occurred in the Server Components render\b/;

/** JSON error response in the shape every route uses. */
export function errorResponse(err: DataSourceError): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (err.retryAfterSeconds) headers["Retry-After"] = String(Math.ceil(err.retryAfterSeconds));
  return Response.json(err.toBody(), { status: err.httpStatus, headers });
}
