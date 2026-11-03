export type TranslateTextArgs = {
  text: string;
  sourceLocale: string;
  targetLocale: string;
  /** Shared translator guidance; never part of the text to translate. */
  context?: string;
};

export type TranslateTextResult =
  | { ok: true; translatedText: string }
  | { ok: false; error: string; unavailable?: boolean };

export type MachineTranslateProvider = {
  /** Whether this provider uses translator guidance. */
  supportsContext?: boolean;
  translateText: (args: TranslateTextArgs) => Promise<TranslateTextResult>;
};
