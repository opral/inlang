import { m } from "@/generated/paraglide/messages";

type FieldProps = {
  fieldName: "email" | "password";
};

/**
 * Renders a form field. The label key is computed from the field name, so
 * which messages are used can't be determined statically.
 */
export function Field({ fieldName }: FieldProps) {
  return (
    <label>
      {m[`${fieldName}_label`]()}
      <input name={fieldName} />
    </label>
  );
}
