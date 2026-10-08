import { afterEach, test, expect, vi } from "vitest";
import {
  PartialMachineTranslateError,
  translateCommandAction,
} from "./translate.js";
import {
  MAX_RETRIES,
  retryDelayMs,
  SERVICE_UNAVAILABLE_ERROR,
} from "./providers/demosjarco.js";
import {
  insertBundleNested,
  loadProjectInMemory,
  newProject,
  selectBundleNested,
  type NewBundleNested,
} from "@inlang/sdk";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("requires INLANG_GOOGLE_TRANSLATE_API_KEY", async () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "google");
  vi.stubEnv("INLANG_GOOGLE_TRANSLATE_API_KEY", "");

  await expect(translateCommandAction({ project: {} as any })).rejects.toThrow(
    "INLANG_GOOGLE_TRANSLATE_API_KEY must be set",
  );
});

test("requires INLANG_DEEPL_API_KEY when provider is deepl", async () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "deepl");
  vi.stubEnv("INLANG_DEEPL_API_KEY", "");

  await expect(translateCommandAction({ project: {} as any })).rejects.toThrow(
    "INLANG_DEEPL_API_KEY must be set",
  );
});

function unavailableResponse() {
  return new Response(null, {
    status: 503,
    statusText: "Service Unavailable",
  });
}

/** Skips the provider's retry waits so retries don't slow the test down. */
function skipRetryDelay() {
  const retryDelays = new Set(
    Array.from({ length: MAX_RETRIES }, (_, retry) => retryDelayMs(retry)),
  );
  const realSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: () => void,
    ms?: number,
  ) =>
    realSetTimeout(
      callback,
      ms !== undefined && retryDelays.has(ms) ? 0 : ms,
    )) as typeof setTimeout);
}

function textBundle(id: string, text: string): NewBundleNested {
  return {
    id,
    messages: [
      {
        id: `${id}_en`,
        bundle_id: id,
        locale: "en",
        variants: [
          {
            id: `${id}_en`,
            message_id: `${id}_en`,
            pattern: [{ type: "text" as const, value: text }],
          },
        ],
      },
    ],
  };
}

test("fails with a non-zero-triggering error when the fallback service is completely unavailable", async () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "demosjarco");
  skipRetryDelay();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => unavailableResponse()),
  );

  const project = await loadProjectInMemory({
    blob: await newProject({
      settings: {
        baseLocale: "en",
        locales: ["en", "de"],
      },
    }),
  });

  await insertBundleNested(project.db, {
    id: "mock",
    messages: [
      {
        id: "mock_en",
        bundle_id: "mock",
        locale: "en",
        variants: [
          {
            id: "mock_en",
            message_id: "mock_en",
            pattern: [{ type: "text", value: "Hello World" }],
          },
        ],
      },
    ],
  });

  await expect(translateCommandAction({ project })).rejects.toThrow(
    "translate.demosjarco.dev is not available",
  );
});

test("keeps successful translations and reports a single error when only some fail", async () => {
  vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "demosjarco");
  skipRetryDelay();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => {
      const query = new URL(url).searchParams;
      if (query.get("q") === "Goodbye" || query.get("target") === "fr") {
        return unavailableResponse();
      }
      return Response.json({
        data: {
          translations: [
            { translatedText: `${query.get("q")} (${query.get("target")})` },
          ],
        },
      });
    }),
  );

  const project = await loadProjectInMemory({
    blob: await newProject({
      settings: {
        baseLocale: "en",
        locales: ["en", "de", "fr"],
      },
    }),
  });

  await insertBundleNested(project.db, textBundle("hello", "Hello"));
  await insertBundleNested(project.db, textBundle("goodbye", "Goodbye"));

  const error = await translateCommandAction({ project }).then(
    () => undefined,
    (error: unknown) => error,
  );

  // hello→fr, goodbye→de and goodbye→fr failed: one summary error, not three.
  expect(error).toBeInstanceOf(PartialMachineTranslateError);
  expect((error as Error).message).toBe(
    `3 translations could not be completed.\n${SERVICE_UNAVAILABLE_ERROR}`,
  );

  const bundles = await selectBundleNested(project.db).execute();
  const hello = bundles.find((bundle) => bundle.id === "hello");
  const goodbye = bundles.find((bundle) => bundle.id === "goodbye");

  expect(hello?.messages.map((message) => message.locale).sort()).toEqual([
    "de",
    "en",
  ]);
  expect(
    hello?.messages.find((message) => message.locale === "de")?.variants[0]
      ?.pattern,
  ).toEqual([{ type: "text", value: "Hello (de)" }]);
  expect(goodbye?.messages.map((message) => message.locale)).toEqual(["en"]);
});

test.runIf(process.env.INLANG_GOOGLE_TRANSLATE_API_KEY)(
  "should tanslate the missing languages",
  async () => {
    vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "google");

    const project = await loadProjectInMemory({
      blob: await newProject({
        settings: {
          baseLocale: "en",
          locales: ["en", "de"],
        },
      }),
    });

    await insertBundleNested(project.db, {
      id: "mock",
      messages: [
        {
          id: "mock_en",
          bundle_id: "mock",
          locale: "en",
          variants: [
            {
              id: "mock_en",
              message_id: "mock_en",
              pattern: [{ type: "text", value: "Hello World" }],
            },
          ],
        },
      ],
    });

    await translateCommandAction({ project });

    const bundles = await selectBundleNested(project.db).execute();
    const messages = bundles[0]?.messages;
    const variants = messages?.flatMap((m) => m.variants);

    expect(bundles.length).toBe(1);
    expect(messages?.length).toBe(2);
    expect(variants?.length).toBe(2);

    expect(bundles[0]?.id).toBe("mock");
    expect(messages?.find((m) => m.locale === "en")).toBeDefined();
    expect(messages?.find((m) => m.locale === "de")).toBeDefined();
    expect(variants).toStrictEqual([
      expect.objectContaining({
        pattern: [
          {
            type: "text",
            value: "Hello World",
          },
        ],
      }),
      expect.objectContaining({
        pattern: [
          {
            type: "text",
            value: "Hallo Welt",
          },
        ],
      }),
    ]);
  },
  { timeout: 10000 },
);

test.runIf(process.env.INLANG_DEEPL_API_KEY)(
  "should translate missing languages with DeepL",
  async () => {
    vi.stubEnv("INLANG_MACHINE_TRANSLATE_PROVIDER", "deepl");

    const project = await loadProjectInMemory({
      blob: await newProject({
        settings: {
          baseLocale: "en",
          locales: ["en", "de"],
        },
      }),
    });

    await insertBundleNested(project.db, {
      id: "mock",
      messages: [
        {
          id: "mock_en",
          bundle_id: "mock",
          locale: "en",
          variants: [
            {
              id: "mock_en",
              message_id: "mock_en",
              pattern: [{ type: "text", value: "Hello World" }],
            },
          ],
        },
      ],
    });

    await translateCommandAction({ project });

    const bundles = await selectBundleNested(project.db).execute();
    const messages = bundles[0]?.messages;
    const variants = messages?.flatMap((m) => m.variants);

    expect(bundles.length).toBe(1);
    expect(messages?.length).toBe(2);
    expect(variants?.length).toBe(2);

    expect(bundles[0]?.id).toBe("mock");
    expect(messages?.find((m) => m.locale === "en")).toBeDefined();
    expect(messages?.find((m) => m.locale === "de")).toBeDefined();
    expect(variants).toStrictEqual([
      expect.objectContaining({
        pattern: [
          {
            type: "text",
            value: "Hello World",
          },
        ],
      }),
      expect.objectContaining({
        pattern: [
          {
            type: "text",
            value: "Hallo Welt",
          },
        ],
      }),
    ]);
  },
  { timeout: 10000 },
);
