"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type Tag = "Mejorando" | "Estable" | "Cayendo" | "Poca data"
type Fila = { formato: string; noTeAnimas: Tag; game: Tag; hombreBueno: Tag; elVisto: Tag; escasezNeedy: Tag; queHacer: string }

// Matriz de Preview restaurada. No pertenece a Producción y no debe tocarse
// durante una sincronización de los datos operativos Producción → Preview.
const FILAS: Fila[] = [
  { formato: "Reacción", noTeAnimas: "Poca data", game: "Estable", hombreBueno: "Estable", elVisto: "Mejorando", escasezNeedy: "Poca data", queHacer: "Seguir, especialmente con El Visto" },
  { formato: "Talking Head", noTeAnimas: "Poca data", game: "Estable", hombreBueno: "Poca data", elVisto: "Cayendo", escasezNeedy: "Poca data", queHacer: "Pausar con El Visto — viene cayendo" },
  { formato: "Voz en Off", noTeAnimas: "Poca data", game: "Poca data", hombreBueno: "Cayendo", elVisto: "Cayendo", escasezNeedy: "Poca data", queHacer: "Bajarle prioridad en Hombre Bueno y El Visto" },
  { formato: "Análisis", noTeAnimas: "Poca data", game: "Estable", hombreBueno: "Poca data", elVisto: "Poca data", escasezNeedy: "Poca data", queHacer: "Mantener con Game" },
  { formato: "Volumen", noTeAnimas: "Estable", game: "Cayendo", hombreBueno: "Estable", elVisto: "Estable", escasezNeedy: "Mejorando", queHacer: "Caballo de batalla — no tocar" },
  { formato: "Cámara + PC", noTeAnimas: "Poca data", game: "Poca data", hombreBueno: "Poca data", elVisto: "Cayendo", escasezNeedy: "Poca data", queHacer: "Pausar con El Visto" },
  { formato: "Carrusel", noTeAnimas: "Poca data", game: "Mejorando", hombreBueno: "Poca data", elVisto: "Poca data", escasezNeedy: "Poca data", queHacer: "Escalar con Game — viene subiendo" },
]

const COLORS: Record<Tag, string> = {
  Mejorando: "bg-emerald-500/15 text-emerald-300",
  Estable: "bg-white/[.07] text-white/70",
  Cayendo: "bg-red-500/15 text-red-300",
  "Poca data": "bg-white/[.04] text-white/40 italic",
}

function Pill({ tag }: { tag: Tag }) {
  return <span className={cn("inline-block rounded-md px-3 py-1 text-xs font-semibold", COLORS[tag])}>{tag}</span>
}

export default function FormatosPage() {
  return <div className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-5 sm:px-6 lg:px-[1.5cm]">
    <div><h1 className="text-2xl font-black">Formatos</h1><p className="text-sm text-muted-foreground">Qué formato usar según el ángulo que vayas a grabar.</p></div>
    <Card className="border-white/10 bg-white/[.035]">
      <CardHeader className="pb-2"><CardTitle className="text-base">¿Cómo viene funcionando cada combinación?</CardTitle><p className="text-xs text-muted-foreground">Comparado contra los meses anteriores</p></CardHeader>
      <CardContent className="pt-2">
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow className="hover:bg-transparent"><TableHead>Formato</TableHead><TableHead>No Te Animás</TableHead><TableHead>Game</TableHead><TableHead>Hombre Bueno</TableHead><TableHead>El Visto</TableHead><TableHead>Escasez/Needy</TableHead><TableHead>Qué hacer</TableHead></TableRow></TableHeader>
          <TableBody>{FILAS.map((f) => <TableRow key={f.formato}><TableCell className="font-bold">{f.formato}</TableCell><TableCell><Pill tag={f.noTeAnimas} /></TableCell><TableCell><Pill tag={f.game} /></TableCell><TableCell><Pill tag={f.hombreBueno} /></TableCell><TableCell><Pill tag={f.elVisto} /></TableCell><TableCell><Pill tag={f.escasezNeedy} /></TableCell><TableCell className="min-w-64 text-sm">{f.queHacer}</TableCell></TableRow>)}</TableBody>
        </Table></div>
        <p className="mt-4 text-sm italic text-muted-foreground">“Poca data” = todavía no se filmó suficiente en esa combinación.</p>
      </CardContent>
    </Card>
  </div>
}
