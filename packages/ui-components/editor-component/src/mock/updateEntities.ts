import type { BundleRow, MessageRow, VariantRow } from "@inlang/sdk";
import type { ChangeEventDetail } from "../helper/event.js";

export const updateEntities = (args: {
  entities: {
    bundles: BundleRow[];
    messages: MessageRow[];
    variants: VariantRow[];
  };
  change: ChangeEventDetail;
}) => {
  const newEntities = structuredClone(args.entities);
  const entity = (args.change.entity + "s") as
    | "bundles"
    | "messages"
    | "variants";

  // deletion
  if (args.change.newData === undefined) {
    newEntities[entity] = newEntities[entity].filter(
      (entity: any) => entity.id !== args.change.entityId
    ) as any[];
  }
  // update
  newEntities[entity] = newEntities[entity].map((entity: any) => {
    // replace the entity with the new data
    if (entity.id === args.change.newData?.id) {
      return args.change.newData;
    }
    // return the entity if it is not the one to be updated
    return entity;
  });
  // insert
  if (
    !newEntities[entity].some(
      (entity: any) => entity.id === args.change.newData?.id
    )
  ) {
    newEntities[entity].push(args.change.newData as any);
  }
  console.info(args.change, args.change.newData, newEntities);
  return newEntities;
};
