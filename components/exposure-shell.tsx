"use client"

/* Contenedor de las pantallas del "Sistema IA" (la capa de agentes de
   Exposure OS). Repite el padding y el fondo cálido de la app original
   para que se vean igual que allá. Los datos de estas pantallas son
   ficticios (components/exposure/data.ts) hasta que se conecten. */
export function ExposureShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="exposure-page mx-auto w-full max-w-[1500px]" style={{ padding: "28px 38px 34px" }}>
      {children}
    </div>
  )
}
