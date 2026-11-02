import type { MachineTranslateProvider, TranslateTextArgs } from "./types.js";

export const DEFAULT_OPENAI_MODEL = "gpt-6-luna";
export const DEFAULT_OPENAI_REASONING_EFFORT = "none";
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

function extractOutputText(response: unknown): string | undefined {
  if (!response || typeof response !== "object" || !("output" in response)) {
    return undefined;
  }

  const output = response.output;
  if (!Array.isArray(output)) {
    return undefined;
  }

  const text = output.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || !("content" in item)) {
      return [];
    }

    const content = item.content;
    if (!Array.isArray(content)) {
      return [];
    }

    return content.flatMap((part: unknown) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "output_text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return [part.text];
      }
      return [];
    });
  });

  return text.length > 0 ? text.join("") : undefined;
}

export function createOpenAITranslateProvider(
  apiKey: string,
  model = DEFAULT_OPENAI_MODEL,
  reasoningEffort = DEFAULT_OPENAI_REASONING_EFFORT,
): MachineTranslateProvider {
  return {
    async translateText(args: TranslateTextArgs) {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions:
            "You are a translation engine. Translate the user's text from the source language to the target language. Preserve HTML tags, placeholders, and formatting. Return only the translated text, without explanations or quotation marks.",
          input: `Source language: ${args.sourceLocale}\nTarget language: ${args.targetLocale}\n\nText:\n${args.text}`,
          reasoning: { effort: reasoningEffort },
        }),
      });

      if (!response.ok) {
        return {
          ok: false,
          error: `${response.status} ${response.statusText}: translating from ${args.sourceLocale} to ${args.targetLocale}`,
        };
      }

      const json = await response.json();
      const outputText = extractOutputText(json);
      if (typeof outputText !== "string") {
        return {
          ok: false,
          error: `Invalid response from OpenAI: translating from ${args.sourceLocale} to ${args.targetLocale}`,
        };
      }

      const translatedText = args.text.endsWith("\n")
        ? outputText
        : outputText.replace(/\r?\n$/, "");

      return { ok: true, translatedText };
    },
  };
}
