export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1120px] px-4 pt-24 pb-24 sm:px-6 md:pt-[120px]">
      <div className="flex flex-col items-start gap-[18px] rounded-[22px] bg-ink px-7 py-12 text-paper sm:px-14">
        <h2 className="max-w-[760px] text-[32px] leading-[1.1] font-bold tracking-[-0.035em] text-balance sm:text-[40px]">
          Keep your translations in your repo.
        </h2>
        <p className="text-[16px] text-[#b8bdc4]">
          Free and open source. Works with i18next, next-intl, ICU and JSON.
        </p>
        <a
          href="/m/2qj2w8pu/app-inlang-cli"
          className="rounded-[10px] bg-paper px-6 py-3 text-[15px] font-semibold text-ink transition-opacity hover:opacity-85"
        >
          Get started
        </a>
      </div>
    </section>
  );
}
