"use client"

import { createContext, useContext } from "react"

type Session = { rol: string; email: string; nombre: string }

const Ctx = createContext<Session>({ rol: "", email: "", nombre: "" })

export function SessionProvider({ value, children }: { value: Session; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession() {
  return useContext(Ctx)
}
