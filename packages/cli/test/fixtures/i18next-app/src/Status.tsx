import { useTranslation } from "react-i18next";

export function Status({ status }: { status: string }) {
  const { t } = useTranslation("admin");
  return <p>{t(`status.${status}`)}</p>;
}
