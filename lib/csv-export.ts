// Exporta filas a un .xlsx descargable, usando exactamente lo que el usuario
// tiene visible en pantalla (ya filtrado/paginado). El archivo se genera en
// el servidor (ver /api/export-xlsx) con alto de fila fijo y sin wrap, para
// que las celdas con textos largos (resumen de chat, IA análisis) no inflen
// la fila al abrirlo en Google Sheets/Excel.
export type CSVColumn<T> = { label: string; get: (row: T) => unknown }

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let text = String(value)
  // Evita que Excel/Sheets interpreten datos del CRM como fórmulas.
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function exportRowsToCSV<T>(rows: T[], columns: CSVColumn<T>[], filename: string) {
  const lines = [
    columns.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(column.get(row))).join(",")),
  ]
  const blob = new Blob(["\uFEFF", lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function exportRowsToXLSX<T>(rows: T[], columns: CSVColumn<T>[], filename: string) {
  const header = columns.map((c) => c.label)
  const data = rows.map((row) =>
    columns.map((c) => {
      const v = c.get(row)
      return v === null || v === undefined ? "" : v
    })
  )

  const res = await fetch("/api/export-xlsx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ columns: header, rows: data, filename }),
  })
  if (!res.ok) {
    alert("Hubo un error al generar el archivo. Probá de nuevo.")
    return
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
