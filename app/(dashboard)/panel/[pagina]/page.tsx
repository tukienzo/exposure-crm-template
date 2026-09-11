import { notFound } from "next/navigation"
import { PanelNegocio } from "@/components/panel-negocio"
import { esPaginaPanel, TITULOS_PANEL } from "@/lib/panel-paginas"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ pagina: string }> }) {
  const { pagina } = await params
  const titulo = esPaginaPanel(pagina) ? TITULOS_PANEL[pagina] : null
  return { title: titulo ? `${titulo} · Panel del negocio | Exposure OS` : "Panel del negocio | Exposure OS" }
}

export default async function PaginaPanelNegocio({ params }: { params: Promise<{ pagina: string }> }) {
  const { pagina } = await params
  if (!esPaginaPanel(pagina)) notFound()
  return <PanelNegocio pagina={pagina} />
}
