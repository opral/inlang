export type TranslateTextArgs = {
  text: string;
  sourceLocale: string;
  targetLocale: string;
};

export type TranslateTextResult =
  | { ok: true; translatedText: string }
  | { ok: false; error: string; unavailable?: boolean };

export type MachineTranslateProvider = {
  translateText: (args: TranslateTextArgs) => Promise<TranslateTextResult>;
};
