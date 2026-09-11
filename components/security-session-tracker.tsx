"use client"

import { useEffect } from "react"

const DEVICE_KEY = "crm_security_device_id"

function deviceId() {
  let id = window.localStorage.getItem(DEVICE_KEY)
  if (!id) {
    id = window.crypto.randomUUID()
    window.localStorage.setItem(DEVICE_KEY, id)
  }
  return id
}

export function SecuritySessionTracker() {
  useEffect(() => {
    const report = (event: "login" | "heartbeat" = "heartbeat") => {
      void fetch("/api/security/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: deviceId(), event }),
        keepalive: true,
      })
    }
    report()
    const timer = window.setInterval(() => report(), 5 * 60 * 1000)
    const visible = () => { if (document.visibilityState === "visible") report() }
    document.addEventListener("visibilitychange", visible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [])
  return null
}

