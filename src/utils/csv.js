/*
 * CSV INJECTION: if a cell starts with = + - @ (or tab / carriage return),
 * Excel and Google Sheets may run it as a formula. A user could name an expense
 * '=HYPERLINK(...)' and attack whoever opens the statement. safeText() puts a
 * single quote in front of such text so it is shown as plain text.
 * Use it for every user-typed text (names, descriptions, notes). Do NOT use it
 * on numbers we generate ourselves, because "-500.00" must stay a number.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function safeText(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return FORMULA_START.test(text) ? `'${text}` : text;
}

// Quote a cell only when needed; a double quote inside is written as two.
function escapeCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ['a', 'b,c'] -> 'a,"b,c"'
function toLine(cells) {
  return cells.map(escapeCell).join(',');
}

module.exports = { safeText, toLine };