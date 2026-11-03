import type { MachineTranslateProvider, TranslateTextArgs } from "./types.js";

export function toDeepLSourceLocale(locale: string): string {
  const [language] = locale.split("-");
  return language ?? locale;
}

export function toDeepLTargetLocale(locale: string): string {
  return locale;
}

export function getDeepLApiUrl(apiKey: string): string {
  if (apiKey.endsWith(":fx")) {
    return "https://api-free.deepl.com/v2/translate";
  }
  return "https://api.deepl.com/v2/translate";
}

export function createDeepLTranslateProvider(
  apiKey: string,
): MachineTranslateProvider {
  const apiUrl = getDeepLApiUrl(apiKey);

  return {
    supportsContext: true,
    async translateText(args: TranslateTextArgs) {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: [args.text],
          source_lang: toDeepLSourceLocale(args.sourceLocale),
          target_lang: toDeepLTargetLocale(args.targetLocale),
          tag_handling: "html",
          ...(args.context ? { context: args.context } : {}),
        }),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `${response.status} ${response.statusText}: translating from ${args.sourceLocale} to ${args.targetLocale}`,
        };
      }

      const json = await response.json();
      return {
        ok: true,
        translatedText: json.translations[0].text,
      };
    },
  };
}
