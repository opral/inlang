/**
 * replaceAll for old Browsers
 *
 * @example replaceAll("abs def abc", "abc", "o")
 */
import { getPrimaryLanguageSubtag } from "@inlang/sdk/language-subtag";

export function replaceAll(str: string, find: string, replace: string) {
  return str.replace(new RegExp(escapeRegExp(find), "g"), replace);
}

/**
 * Replaces the `{locale}` and legacy `{languageTag}` placeholders with the
 * locale, and `{language}` with its primary language subtag, e.g. `en` for
 * `en-US`.
 */
export function replaceLocale(path: string, locale: string) {
  return path.replace(
    /\{(locale|languageTag|language)\}/g,
    (_, placeholder) =>
      placeholder === "language" ? getPrimaryLanguageSubtag(locale) : locale
  );
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}
