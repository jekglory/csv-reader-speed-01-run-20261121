// A fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// It returns exactly csv-reader's answer, {columns, rows, errors}, for every
// {text, header} input: the same header rule, the same padding and cutting of
// rows to the first record's width, and the same errors in the same order.
// The speed comes from scanning with indexOf instead of one character at a
// time: an unquoted field ends at the next comma or line break, and a quoted
// field ends at the next quote that is not doubled, so each field is found
// by a few native scans and taken as one slice.
//
// The broken-row policy, kept exactly:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it is one quote, and each CRLF or lone CR inside
//     it is read as LF; what follows its closing quote, up to the next comma
//     or line break, is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character, and the text
//     after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it, each padded with "" (short_row, with fields: its
//     count) or cut (long_row, with extra: the cut fields) to the first
//     record's width;
//   - each error is {code, line, row}, in the order met: line is the
//     1-based line its record starts on, counting every LF, CRLF and lone
//     CR inside quotes, and row is its record's index in rows, null for the
//     header.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. One scratch object is reused for field results inside a call.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const BREAK = 1;
const END = 2;

/** The reading of one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and how many characters
  // the unquoted part of it kept (the quote_junk rule counts those).
  const field = { value: '', ended: END, added: 0 };

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field from pos, appending onto `head` (the value built
  // so far, '' for a plain field). The field ends at the next comma, line
  // break or end of text; a CR not followed by LF is dropped with one
  // stray_cr error each, and a CR that pairs with the line break's LF is
  // part of that break, not of the value.
  function readUnquoted(head) {
    let value = head;
    let added = 0;
    const iComma = text.indexOf(',', pos);
    const iLf = text.indexOf('\n', pos);
    let end;
    let ended;
    if (iComma === -1) {
      if (iLf === -1) {
        end = len;
        ended = END;
      } else {
        end = iLf;
        ended = BREAK;
      }
    } else if (iLf === -1 || iComma < iLf) {
      end = iComma;
      ended = COMMA;
    } else {
      end = iLf;
      ended = BREAK;
    }
    let seg = text.slice(pos, end);
    if (ended === BREAK && seg.charCodeAt(seg.length - 1) === 13) seg = seg.slice(0, -1);
    const iCr = seg.indexOf('\r');
    if (iCr === -1) {
      if (seg.length !== 0) {
        value += seg;
        added += seg.length;
      }
    } else {
      // Stray CRs, dropped one by one; the rest of the segment is kept.
      let p = 0;
      for (;;) {
        const r = seg.indexOf('\r', p);
        if (r === -1) {
          if (p < seg.length) {
            value += seg.slice(p);
            added += seg.length - p;
          }
          break;
        }
        pushError('stray_cr');
        if (r > p) {
          value += seg.slice(p, r);
          added += r - p;
        }
        p = r + 1;
      }
    }
    pos = end + (ended === END ? 0 : 1);
    if (ended === BREAK) line += 1;
    field.value = value;
    field.ended = ended;
    field.added = added;
  }

  // The folded stretch and the line breaks it held, reused across calls so
  // folding one allocates no array.
  const fold = { text: '', breaks: 0 };

  // Folds one stretch from inside a quoted field: each CRLF and each lone CR
  // becomes one LF, and counts the line breaks it held. Writes the folded
  // stretch and the count into `fold`.
  function foldQuoted(seg) {
    if (seg.indexOf('\n') === -1 && seg.indexOf('\r') === -1) {
      fold.text = seg;
      fold.breaks = 0;
      return;
    }
    let out = '';
    let breaks = 0;
    let p = 0;
    for (;;) {
      const a = seg.indexOf('\n', p);
      const b = seg.indexOf('\r', p);
      let n;
      let skip;
      if (a === -1) {
        if (b === -1) break;
        n = b;
        skip = seg.charCodeAt(n + 1) === 10 ? 2 : 1;
      } else if (b === -1 || a < b) {
        n = a;
        skip = 1;
      } else {
        n = b;
        skip = seg.charCodeAt(n + 1) === 10 ? 2 : 1;
      }
      out += seg.slice(p, n);
      out += '\n';
      breaks += 1;
      p = n + skip;
    }
    if (p < seg.length) out += seg.slice(p);
    fold.text = out;
    fold.breaks = breaks;
  }

  // Reads a quoted field whose opening quote is at pos. Runs to the next
  // quote that is not doubled; a quote that never closes is a literal
  // character, and the text after it is read again as unquoted.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let parts = null;
    let breaks = 0;
    let segStart = pos;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one literal quote; the field goes on.
        foldQuoted(text.slice(segStart, q));
        breaks += fold.breaks;
        if (parts === null) parts = [];
        parts.push(fold.text, '"');
        pos = q + 2;
        segStart = q + 2;
        continue;
      }
      // The closing quote: fold the last stretch and join the value.
      foldQuoted(text.slice(segStart, q));
      breaks += fold.breaks;
      const value = parts === null ? fold.text : parts.join('') + fold.text;
      pos = q + 1;
      line += breaks;
      if (pos >= len) {
        field.value = value;
        field.ended = END;
        field.added = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        field.value = value;
        field.ended = COMMA;
        field.added = 0;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        field.value = value;
        field.ended = BREAK;
        field.added = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        field.value = value;
        field.ended = BREAK;
        field.added = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the
      // next comma or line break.
      readUnquoted(value);
      if (field.added > 0) pushError('quote_junk');
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(field.value);
      ended = field.ended;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
