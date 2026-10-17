// Terminal safety for text that did not come from the CLI itself (API
// answers, file names, error messages). Control characters are escaped
// visibly instead of being dropped, so nothing is hidden from the person:
// ESC becomes the four characters `\x1b`, an RLO override becomes the text `\u202e`.
//
// Covered: C0 controls (U+0000 to U+001F), DEL (U+007F), C1 controls
// (U+0080 to U+009F, which include the 8-bit CSI and OSC introducers),
// bidirectional overrides and isolates (U+202A to U+202E, U+2066 to U+2069)
// and the private-use characters the Output class uses as style markers.
// Escaping ESC and the C1 introducers neutralizes every escape sequence
// (cursor moves, screen clears, OSC 8 links, OSC 52 clipboard writes,
// window titles), because what follows them is plain printable text.

// Keep the ranges below as \u escapes; never paste the raw characters here.

/** Everything above, including line breaks and tabs: for a single value. */
const UNSAFE_VALUE = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ue000\ue001]/g;

/** Same, but keeps `\n`: for whole lines the CLI composed itself. */
const UNSAFE_LINE =
  /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069\ue000\ue001]/g;

/**
 * Characters JSON.stringify leaves raw although some terminals act on them,
 * plus the style marker delimiters, so JSON never carries them either.
 */
const UNSAFE_JSON = /[\u007f-\u009f\u202a-\u202e\u2066-\u2069\ue000\ue001]/g;

function visible(char: string): string {
  const code = char.charCodeAt(0);
  return code <= 0xff
    ? `\\x${code.toString(16).padStart(2, '0')}`
    : `\\u${code.toString(16).padStart(4, '0')}`;
}

/** Makes one untrusted value safe to print on a terminal, on a single line. */
export function safeText(value: unknown): string {
  return String(value ?? '').replace(UNSAFE_VALUE, visible);
}

/** Makes composed output safe while keeping its own line breaks. */
export function safeLines(text: string): string {
  return text.replace(UNSAFE_LINE, visible);
}

/**
 * JSON.stringify already escapes C0 controls; this escapes DEL, C1, bidi
 * controls and the marker delimiters as `\uXXXX` too. The parsed value is
 * unchanged.
 */
export function safeJson(json: string): string {
  return json.replace(
    UNSAFE_JSON,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
