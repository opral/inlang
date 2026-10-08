//generalized event dispatcher

import type { BundleRow, MessageRow, VariantRow } from "@inlang/sdk";

/**
 * This event is dispatched when a change is made to a bundle, message or variant.
 *
 * - `entityId` is the id of the entity that was changed.
 * - `entity` is the type of entity that was changed.
 * - `newData` is the new data of the entity.
 * - `newData` is `undefined` if the entity was deleted.
 */
export type ChangeEventDetail = {
  entityId: string;
  entity: "bundle" | "message" | "variant";
  newData?: BundleRow | MessageRow | VariantRow;
};

export const createChangeEvent = (detail: ChangeEventDetail) => {
  const onChangeEvent = new CustomEvent("change", {
    bubbles: true,
    composed: true,
    detail,
  });
  return onChangeEvent;
};
