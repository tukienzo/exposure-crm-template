"use client"

import { useState } from "react"
import Vista from "@/components/exposure/pages/Agents"
import type { AgentId } from "@/components/exposure/data"
import { ExposureShell } from "@/components/exposure-shell"

export default function Page() {
  const [agent, setAgent] = useState<AgentId>("ceo")
  return <ExposureShell><Vista agent={agent} setAgent={setAgent} /></ExposureShell>
}
