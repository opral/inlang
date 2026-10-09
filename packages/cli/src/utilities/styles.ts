type Style = (text: string) => string;

/** ANSI styles for terminal output, plain text when `color` is false. */
export function styles(color: boolean) {
  const ansi =
    (open: number, close: number): Style =>
    (text) =>
      color ? `\u001b[${open}m${text}\u001b[${close}m` : text;
  return {
    bold: ansi(1, 22),
    dim: ansi(2, 22),
    red: ansi(31, 39),
    green: ansi(32, 39),
    yellow: ansi(33, 39),
    cyan: ansi(36, 39),
  };
}
