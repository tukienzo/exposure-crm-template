import { NextResponse } from "next/server"
import { z } from "zod"

import { createSupabaseAdmin } from "@/lib/supabase-admin"
import { calculateClose, confirmationReadiness } from "@/lib/finance-engine"
import { FinanceAccessError, requireFinanceActor } from "@/lib/finance-access"
import { SPLITS } from "@/lib/operating-rules"

export const dynamic = "force-dynamic"

const money = z.number().finite()
const closeSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-01$/),
  revision: z.number().int().positive().default(1),
  externalIncome: money,
  platformFees: money.nonnegative(),
  payroll: money.nonnegative(),
  softwareMarketing: money.nonnegative(),
  operatingExpenses: money.nonnegative(),
  obligations: money.nonnegative(),
  reserves: money.nonnegative(),
  adjustments: money,
  sourceCount: z.number().int().nonnegative().default(0),
  totalMovements: z.number().int().nonnegative().default(0),
  reconciledMovements: z.number().int().nonnegative().default(0),
})

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("checklist"),
    closingId: z.string().uuid(),
    itemKey: z.string().min(1).max(80),
    status: z.enum(["pendiente", "completo", "no_aplica", "bloqueado"]),
    evidenceRefHash: z.string().max(128).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal("approve"),
    closingId: z.string().uuid(),
    partnerKey: z.enum(["partner_a", "partner_b"]),
    status: z.enum(["pendiente", "aprobado", "rechazado"]),
    comment: z.string().max(1000).nullable().optional(),
  }),
  z.object({
    action: z.literal("confirm"),
    closingId: z.string().uuid(),
  }),
])

const checklistTemplate = [
  ["sources_locked", "Fuentes del período cerradas"],
  ["mercury_reconciled", "Mercury conciliado sin duplicar transferencias internas"],
  ["reca_reconciled", "RECA/pesos conciliado"],
  ["crypto_cash_reconciled", "Crypto, USDT y efectivo conciliados"],
  ["expenses_classified", "Gastos clasificados; ambiguos separados"],
  ["payroll_bonuses", "Payroll, comisiones y bonos confirmados"],
  ["reserves_obligations", "Reservas, obligaciones, deudas y disputas aplicadas"],
  ["distribution_reproduced", "Distribución reproducible con evidencia"],
] as const

function apiError(error: unknown) {
  if (error instanceof FinanceAccessError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Datos inválidos", details: error.issues }, { status: 400 })
  }
  const message = error instanceof Error ? error.message : "Error interno"
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET() {
  try {
    await requireFinanceActor()
    const admin = createSupabaseAdmin()
    const [closingsResult, rulesResult, auditResult] = await Promise.all([
      admin.from("finance_closings").select("*").order("period_start", { ascending: false }).order("revision", { ascending: false }).limit(60),
      admin.from("finance_rule_versions").select("*").order("rule_key").order("version", { ascending: false }),
      admin.from("finance_audit_log").select("id,table_name,record_id,action,changed_at,changed_by").order("changed_at", { ascending: false }).limit(100),
    ])
    for (const result of [closingsResult, rulesResult, auditResult]) {
      if (result.error) throw result.error
    }
    const closings = closingsResult.data ?? []
    const ids = closings.map(item => item.id)
    const [approvalsResult, movementsResult, checklistResult] = ids.length
      ? await Promise.all([
          admin.from("finance_approvals").select("*").in("closing_id", ids),
          admin.from("finance_movements").select("id,closing_id,occurred_at,channel,amount_original,currency_original,amount_base,reconciliation_status,evidence_ref_hash,notes,source_record_key").in("closing_id", ids).order("occurred_at"),
          admin.from("finance_checklist_items").select("closing_id,item_key,status,notes,evidence_ref_hash").in("closing_id", ids),
        ])
      : [
          { data: [], error: null }, { data: [], error: null }, { data: [], error: null },
        ]
    if (approvalsResult.error) throw approvalsResult.error
    if (movementsResult.error) throw movementsResult.error
    if (checklistResult.error) throw checklistResult.error

    return NextResponse.json({
      closings,
      rules: rulesResult.data ?? [],
      approvals: approvalsResult.data ?? [],
      movements: movementsResult.data ?? [],
      checklist: checklistResult.data ?? [],
      audit: auditResult.data ?? [],
      policy: {
        ownership: "Reglas de reparto entre las cuentas dueñas: default, renovación cerrada por la cuenta A y venta nueva originada en la cuenta A. Porcentajes y vigencia se configuran en .env (CRM_SPLIT_*).",
        distributionRules: [
          { key: "paul_renewal", paul: SPLITS.renovacionA, cristian: Math.round((1 - SPLITS.renovacionA) * 100) / 100, appliesFrom: SPLITS.desde, priority: 1, base: "cash neto de plataforma y reembolsos" },
          { key: "paul_origin", paul: SPLITS.origenA, cristian: Math.round((1 - SPLITS.origenA) * 100) / 100, appliesFrom: SPLITS.desde, priority: 2, base: "cash neto de plataforma y reembolsos" },
          { key: "default", paul: SPLITS.defaultA, cristian: Math.round((1 - SPLITS.defaultA) * 100) / 100, appliesFrom: SPLITS.desde, priority: 3, base: "utilidad distribuible general" },
        ],
        previewReadOnly: process.env.VERCEL_ENV === "preview",
      },
    })
  } catch (error) {
    return apiError(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireFinanceActor({ write: true })
    const input = closeSchema.parse(await request.json())
    if (input.reconciledMovements > input.totalMovements) {
      return NextResponse.json({ error: "Conciliados no puede superar movimientos totales" }, { status: 400 })
    }
    const calculated = calculateClose(input)
    const admin = createSupabaseAdmin()
    const { data: closing, error } = await admin.from("finance_closings").insert({
      period_start: input.periodStart,
      revision: input.revision,
      status: "provisional",
      external_income: input.externalIncome,
      platform_fees: input.platformFees,
      payroll: input.payroll,
      software_marketing: input.softwareMarketing,
      operating_expenses: input.operatingExpenses,
      obligations: input.obligations,
      reserves: input.reserves,
      adjustments: input.adjustments,
      distributable_profit: calculated.distributable,
      partner_share: calculated.partnerShare,
      formula: calculated.formula,
      source_count: input.sourceCount,
      total_movements: input.totalMovements,
      reconciled_movements: input.reconciledMovements,
      created_by: actor.userId,
    }).select("*").single()
    if (error) throw error

    const [{ error: checklistError }, { error: approvalsError }] = await Promise.all([
      admin.from("finance_checklist_items").insert(checklistTemplate.map(([itemKey, label], index) => ({
        closing_id: closing.id,
        item_key: itemKey,
        label,
        sort_order: index + 1,
      }))),
      admin.from("finance_approvals").insert([
        { closing_id: closing.id, partner_key: "partner_a", status: "pendiente" },
        { closing_id: closing.id, partner_key: "partner_b", status: "pendiente" },
      ]),
    ])
    if (checklistError) throw checklistError
    if (approvalsError) throw approvalsError
    return NextResponse.json({ closing }, { status: 201 })
  } catch (error) {
    return apiError(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireFinanceActor({ write: true })
    const input = patchSchema.parse(await request.json())
    const admin = createSupabaseAdmin()

    if (input.action === "checklist") {
      const { error } = await admin.from("finance_checklist_items").update({
        status: input.status,
        completed_at: input.status === "completo" ? new Date().toISOString() : null,
        completed_by: input.status === "completo" ? actor.userId : null,
        evidence_ref_hash: input.evidenceRefHash ?? null,
        notes: input.notes ?? null,
      }).eq("closing_id", input.closingId).eq("item_key", input.itemKey)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    if (input.action === "approve") {
      if (!actor.partnerKey || actor.partnerKey !== input.partnerKey) {
        throw new FinanceAccessError("Esta aprobación pertenece al otro socio", 403)
      }
      const { error } = await admin.from("finance_approvals").update({
        status: input.status,
        approved_at: input.status === "aprobado" ? new Date().toISOString() : null,
        approved_by: input.status === "aprobado" ? actor.userId : null,
        comment: input.comment ?? null,
      }).eq("closing_id", input.closingId).eq("partner_key", input.partnerKey)
      if (error) throw error
      return NextResponse.json({ ok: true })
    }

    const [{ data: closing, error: closingError }, { data: checklist, error: checklistError }, { data: approvals, error: approvalsError }] = await Promise.all([
      admin.from("finance_closings").select("*").eq("id", input.closingId).single(),
      admin.from("finance_checklist_items").select("required,status").eq("closing_id", input.closingId),
      admin.from("finance_approvals").select("status").eq("closing_id", input.closingId),
    ])
    if (closingError) throw closingError
    if (checklistError) throw checklistError
    if (approvalsError) throw approvalsError
    const officialAccountantClose = closing.closing_verified === true
      && ["pdf_cierre", "xlsx_contaduria_2026"].includes(String(closing.verification_source || closing.evidence_source || ""))
    const readiness = confirmationReadiness({
      totalMovements: closing.total_movements,
      reconciledMovements: closing.reconciled_movements,
      unexplainedDifference: Number(closing.unexplained_difference),
      payrollReconciled: closing.payroll_reconciled,
      bonusesReconciled: closing.bonuses_reconciled,
      distributionReproducible: closing.distribution_reproducible,
      bothPartnersApproved: officialAccountantClose || (approvals?.length === 2 && approvals.every(item => item.status === "aprobado")),
    })
    const incompleteChecklist = (checklist ?? []).some(item => item.required && !["completo", "no_aplica"].includes(item.status))
    if (!readiness.canConfirm || incompleteChecklist) {
      return NextResponse.json({
        error: "El cierre aún no puede confirmarse",
        blockers: [...readiness.blockers, ...(incompleteChecklist ? ["checklist incompleto"] : [])],
      }, { status: 409 })
    }
    const { error } = await admin.from("finance_closings").update({ status: "confirmado" }).eq("id", input.closingId)
    if (error) throw error
    return NextResponse.json({ ok: true, status: "confirmado" })
  } catch (error) {
    return apiError(error)
  }
}
