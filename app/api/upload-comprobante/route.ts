import { NextResponse } from "next/server"
import { createSupabaseAdmin } from "@/lib/supabase-admin"

export const runtime = "nodejs"

const BUCKET = "comprobantes-pagos"
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"])
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

function cleanNamePart(value: string): string {
  return (value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60)
}

async function ensurePrivateBucket() {
  const supabase = createSupabaseAdmin()
  const { data } = await supabase.storage.getBucket(BUCKET)
  if (data) return supabase

  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: [...ALLOWED_MIME],
  })
  if (error && !/already exists/i.test(error.message)) throw error
  return supabase
}

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get("file")
    const concepto = String(form.get("concepto") || "")
    const cliente = String(form.get("cliente") || "")

    if (!(file instanceof File)) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "El archivo pesa más de 8 MB" }, { status: 400 })
    if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: "Formato no permitido. Usá PDF, JPG, PNG o WEBP." }, { status: 400 })

    const ext = EXT_BY_MIME[file.type]
    const label = [cleanNamePart(concepto), cleanNamePart(cliente)].filter(Boolean).join("-") || "pago"
    const date = new Date().toISOString().slice(0, 10)
    const path = `${date}/${crypto.randomUUID()}-${label}.${ext}`
    const supabase = await ensurePrivateBucket()
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    })
    if (error) throw error

    // Guardamos una URL absoluta para que el comprobante siga siendo un link
    // válido también en exportaciones y módulos que no conocen el dominio.
    const url = `${new URL(request.url).origin}/api/upload-comprobante?path=${encodeURIComponent(path)}`
    return NextResponse.json({ url })
  } catch (error: unknown) {
    console.error("upload-comprobante", error)
    return NextResponse.json({ error: "No se pudo guardar el comprobante. Intentá de nuevo." }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const path = new URL(request.url).searchParams.get("path")
    if (!path || path.includes("..")) return NextResponse.json({ error: "Comprobante inválido" }, { status: 400 })

    const supabase = createSupabaseAdmin()
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error || !data) return NextResponse.json({ error: "Comprobante no encontrado" }, { status: 404 })

    return new NextResponse(data, {
      headers: {
        "Content-Type": data.type || "application/octet-stream",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error: unknown) {
    console.error("download-comprobante", error)
    return NextResponse.json({ error: "No se pudo abrir el comprobante" }, { status: 500 })
  }
}
