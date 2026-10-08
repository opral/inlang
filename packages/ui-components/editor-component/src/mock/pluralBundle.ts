import type { BundleRow, MessageRow, VariantRow } from "@inlang/sdk";

export const examplePlural: {
  bundles: BundleRow[];
  messages: MessageRow[];
  variants: VariantRow[];
} = {
  bundles: [
    {
      id: "mock_bundle_human_id",
      declarations: [
        {
          type: "input-variable",
          name: "numProducts",
        },
        {
          type: "input-variable",
          name: "count",
        },
        {
          type: "input-variable",
          name: "projectCount",
        },
      ],
    },
  ],
  messages: [
    {
      bundle_id: "mock_bundle_human_id",
      id: "mock_message_id_de",
      locale: "de",
      selectors: [
        {
          type: "variable-reference",
          name: "numProducts",
        },
      ],
    },
    {
      bundle_id: "mock_bundle_human_id",
      id: "mock_message_id_en",
      locale: "en",
      selectors: [
        {
          type: "variable-reference",
          name: "numProducts",
        },
      ],
    },
  ],
  variants: [
    {
      message_id: "mock_message_id_de",
      id: "mock_variant_id_de_zero",
      matches: [
        {
          type: "literal-match",
          key: "numProducts",
          value: "zero",
        },
      ],
      pattern: [
        {
          type: "text",
          value: "Keine Produkte",
        },
      ],
    },
    {
      message_id: "mock_message_id_de",
      id: "mock_variant_id_de_one",
      matches: [
        {
          type: "literal-match",
          key: "numProducts",
          value: "one",
        },
      ],
      pattern: [
        {
          type: "text",
          value: "Ein Produkt",
        },
      ],
    },
    {
      message_id: "mock_message_id_de",
      id: "mock_variant_id_de_other",
      matches: [
        {
          type: "literal-match",
          key: "numProducts",
          value: "other",
        },
      ],
      pattern: [
        {
          type: "expression",
          arg: {
            type: "variable-reference",
            name: "numProducts",
          },
        },
        {
          type: "text",
          value: " Produkte",
        },
      ],
    },
    {
      message_id: "mock_message_id_en",
      id: "mock_variant_id_en_zero",
      matches: [
        {
          type: "literal-match",
          key: "numProducts",
          value: "zero",
        },
      ],
      pattern: [
        {
          type: "text",
          value: "No Products",
        },
      ],
    },
    {
      message_id: "mock_message_id_en",
      id: "mock_variant_id_en_one",
      matches: [
        {
          type: "literal-match",
          key: "numProducts",
          value: "one",
        },
      ],
      pattern: [
        {
          type: "text",
          value: "A product",
        },
      ],
    },
    {
      message_id: "mock_message_id_en",
      id: "mock_variant_id_en_other",
      matches: [
        {
          type: "literal-match",
          key: "numProducts",
          value: "other",
        },
      ],
      pattern: [
        {
          type: "expression",
          arg: {
            type: "variable-reference",
            name: "numProducts",
          },
        },
        {
          type: "text",
          value: " products",
        },
      ],
    },
  ],
};
