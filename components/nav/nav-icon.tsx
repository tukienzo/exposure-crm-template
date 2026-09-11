import type { ReactNode } from "react"

export type Ramp = { from: string; via: string; to: string; glow: string }

export function NavIcon({
  ramp,
  size = 46,
  radius = 15,
  badge,
  children,
}: {
  ramp: Ramp
  size?: number
  radius?: number
  badge?: number
  children: ReactNode
}) {
  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: `linear-gradient(160deg, ${ramp.from}, ${ramp.via} 48%, ${ramp.to})`,
        boxShadow: [
          "inset 0 2px 0 rgba(255,255,255,.5)",
          "inset 0 -3px 4px rgba(0,0,0,.3)",
          `0 8px 16px -6px ${ramp.glow}`,
          "0 2px 4px rgba(0,0,0,.5)",
        ].join(", "),
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: 2,
          right: 2,
          top: 2,
          bottom: "45%",
          borderRadius: `${radius - 2}px ${radius - 2}px 20px 20px`,
          background: "linear-gradient(180deg, rgba(255,255,255,.42), rgba(255,255,255,0))",
        }}
      />
      <span className="relative text-white" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,.45))" }}>
        {children}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-[7px] -top-[5px] flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-[#121216] bg-[#f2542d] px-[5px] text-[11px] font-semibold leading-none text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </div>
  )
}
