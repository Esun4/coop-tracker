import { METER_TICKS } from "@/lib/stage";
import { TABLE_COLS, TABLE_HEADINGS } from "./table-layout";

/**
 * The dashboard before its data arrives.
 *
 * Four rules hold here. Chrome is never a skeleton — every label you can read
 * below is real static text that paints immediately, and only values are
 * blocks. The blocks hold shipped geometry: 26px monogram, two lines of
 * company/role, a chip and four ticks at full size, eight rows deep, so
 * nothing moves when the data lands. Row widths vary so it reads as a list of
 * companies rather than a barcode. And one pulse runs on the whole screen —
 * see `.skeleton-screen`, which also holds it back for 200ms so the cached
 * case never flashes.
 */

/** company · role · chip · location · source */
const ROW_WIDTHS = [
  ["w-[132px]", "w-[168px]", "w-[62px]", "w-[96px]", "w-[74px]"],
  ["w-[104px]", "w-[196px]", "w-[78px]", "w-[74px]", "w-[96px]"],
  ["w-[156px]", "w-[150px]", "w-[58px]", "w-[88px]", "w-[68px]"],
  ["w-[118px]", "w-[182px]", "w-[70px]", "w-[104px]", "w-[84px]"],
  ["w-[142px]", "w-[160px]", "w-[62px]", "w-[80px]", "w-[92px]"],
  ["w-[96px]", "w-[204px]", "w-[74px]", "w-[96px]", "w-[70px]"],
  ["w-[148px]", "w-[172px]", "w-[58px]", "w-[70px]", "w-[88px]"],
  ["w-[112px]", "w-[154px]", "w-[66px]", "w-[100px]", "w-[76px]"],
];

function Block({ className }: { className: string }) {
  return <span className={`bg-stage-off block rounded-[5px] ${className}`} />;
}

function MetricLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-label text-muted-foreground tracking-label font-medium uppercase">
      {children}
    </p>
  );
}

export function MetricStripSkeleton() {
  return (
    <div className="bg-card border-border flex items-stretch rounded-xl border px-[26px] py-[22px]">
      <div className="shrink-0 pr-[34px]">
        <MetricLabel>In play</MetricLabel>
        <Block className="mt-2 h-[34px] w-24 rounded-md" />
        <Block className="mt-[14px] h-1.5 w-[260px] rounded-full" />
        <Block className="mt-3 h-[9px] w-[230px]" />
      </div>
      <div className="bg-border w-px" />
      <div className="flex flex-1 gap-11 pl-[34px]">
        {["Response rate", "Interview rate", "Offers"].map((label) => (
          <div key={label}>
            <MetricLabel>{label}</MetricLabel>
            <Block className="mt-2 h-[22px] w-[62px]" />
            <Block className="mt-[11px] h-[9px] w-[88px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApplicationTableSkeleton() {
  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      <div className={`${TABLE_COLS} bg-sunken border-border border-b py-[9px]`}>
        {TABLE_HEADINGS.map((label) => (
          <span
            key={label}
            className="text-label text-muted-foreground tracking-column font-medium uppercase"
          >
            {label}
          </span>
        ))}
        <span />
      </div>

      <div className="bg-sunken border-border flex items-center gap-[9px] border-b px-[18px] py-[7px]">
        <Block className="size-[5px] rounded-full" />
        <Block className="h-[9px] w-24" />
      </div>

      {ROW_WIDTHS.map(([company, role, chip, location, source], i) => (
        <div
          key={i}
          className={`${TABLE_COLS} border-border-subtle items-center border-b py-[11px]`}
        >
          <span className="flex items-center gap-[11px] pr-3">
            <Block className="size-[26px] shrink-0 rounded-[7px]" />
            <span>
              <Block className={`h-[10px] ${company}`} />
              <Block className={`mt-1.5 h-[9px] ${role}`} />
            </span>
          </span>

          <span className="flex items-center gap-[9px]">
            <Block className={`h-[17px] rounded-sm ${chip}`} />
            {/* The meter is the same four ticks, simply with none filled. */}
            <span className="flex items-center gap-0.5">
              {Array.from({ length: METER_TICKS }, (_, t) => (
                <span
                  key={t}
                  className="bg-stage-off h-[3px] w-[9px] rounded-[2px]"
                />
              ))}
            </span>
          </span>

          <Block className="h-[9px] w-11" />
          <Block className={`h-[9px] ${location}`} />
          <Block className={`h-[9px] ${source}`} />
          <span />
        </div>
      ))}
    </div>
  );
}
