import { Link as RouterLink } from "@tanstack/react-router";

type LinkProps = {
  to?: string;
  children?: unknown;
  [key: string]: unknown;
};

export function Link(props: LinkProps) {
  // Avoid JSX type conflicts when multiple React type versions are present.
  return RouterLink(props as any) as JSX.Element;
}
