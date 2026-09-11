import { NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { getExportActor } from "@/lib/require-export-access"

// Genera el .xlsx con alto de fila fijo y wrap desactivado, para que las
// celdas de texto largo (resumen de chat, IA análisis, etc.) no agranden la
// fila al abrirse en Google Sheets/Excel — quedan recortadas y se ven
// completas al hacer clic en la celda, sin que haya que tocar nada a mano.
export async function POST(request: Request) {
  try {
    const actor = await getExportActor()
    if (!actor) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { columns, rows, filename } = await request.json()
    if (!Array.isArray(columns) || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet("Datos", { views: [{ state: "frozen", ySplit: 1 }] })

    ws.columns = columns.map((label: string) => ({ header: label, width: 24 }))

    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true }
    headerRow.height = 20
    headerRow.eachCell((cell) => { cell.alignment = { wrapText: false, vertical: "middle" } })

    for (const row of rows as unknown[][]) {
      const r = ws.addRow(row)
      r.height = 20
      // shrinkToFit (no wrapText) achica el texto para que entre siempre
      // dentro de su propia celda — a diferencia de wrapText:false a secas,
      // esto evita que un texto largo (ej: un link) se "derrame" visualmente
      // sobre la celda de al lado cuando esa celda está vacía.
      r.eachCell((cell) => { cell.alignment = { wrapText: false, shrinkToFit: true, vertical: "top" } })
    }

    const buffer = await wb.xlsx.writeBuffer()
    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${(filename || "export").replace(/[^a-zA-Z0-9_.-]/g, "_")}.xlsx"`,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 })
  }
}
