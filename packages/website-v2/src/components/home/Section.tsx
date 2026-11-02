import type { ReactNode } from "react";

/** Page-width section wrapper shared by all landing page sections. */
export function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`mx-auto max-w-[1120px] px-4 pt-24 sm:px-6 md:pt-[120px] ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="max-w-[820px] text-[32px] leading-[1.1] font-bold tracking-[-0.035em] text-balance sm:text-[44px]">
      {children}
    </h2>
  );
}

export function SectionLead({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 max-w-[640px] text-[17px] leading-[1.7] text-ink-muted">
      {children}
    </p>
  );
}

/** Small mono label used above cards and diagrams. */
export function MonoLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10.5px] font-medium tracking-[0.08em] uppercase ${className}`}
    >
      {children}
    </span>
  );
}
