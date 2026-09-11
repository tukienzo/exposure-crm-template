import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // El repo histórico usa adapters sin tipos generados de Supabase. El
      // typecheck sigue siendo obligatorio; este lint no bloquea por `any`.
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  globalIgnores([".next/**", ".vercel/**", "node_modules/**", "reports/**", "docs/manual-crm-nuevo/**"]),
])
