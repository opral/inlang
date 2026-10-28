import { Trans, useTranslation } from "react-i18next";

export function App({ count }: { count: number }) {
  const { t } = useTranslation("common");
  return (
    <main>
      <h1>{t("title")}</h1>
      <a href="/">{t("nav.home")}</a>
      <p>{t("item", { count })}</p>
      <Trans i18nKey="admin:users" />
    </main>
  );
}
