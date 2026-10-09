/**
 * Escapes literal text for ICU MessageFormat 1.
 *
 * `{`, `}` and, in a plural, `#` are quoted. Special characters separated
 * only by apostrophes are quoted as one segment, because ICU reads
 * `'#'` + `''` + `'#'` as one quoted segment `'#''#'` in which `''` is a
 * single apostrophe: quoting them one by one would read back as `#'#` plus an
 * extra apostrophe. Inside a quoted segment, and elsewhere, an apostrophe is
 * doubled.
 */
export function escapeIcuText(value: string, inPlural: boolean): string {
  const special = inPlural ? /[{}#](?:'*[{}#])*|'/g : /[{}](?:'*[{}])*|'/g;
  return value.replace(special, (match) =>
    match === "'" ? "''" : `'${match.replace(/'/g, "''")}'`,
  );
}
