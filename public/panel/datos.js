/* ══════════════════════════════════════════════════════════════════════════
   EXPOSURE · Panel del negocio — LOS DATOS
   ──────────────────────────────────────────────────────────────────────────
   ESTE ES EL ÚNICO ARCHIVO QUE TENÉS QUE TOCAR.

   Regla de oro: acá solo se escriben NÚMEROS CRUDOS (lo que pasó).
   Los porcentajes, promedios, tasas, deltas y proyecciones NO se escriben:
   los calcula el dashboard solo. Si tocás un número de acá, todo el resto
   se recalcula al recargar la página.

   Los datos que vienen cargados son de DEMOSTRACIÓN. Reemplazalos por los
   tuyos y poné MODO_DEMO en false abajo de todo.
   ══════════════════════════════════════════════════════════════════════════ */

const DATOS = {

  /* ── 1 · La marca ─────────────────────────────────────────────────────── */
  marca: {
    nombre: "TU MARCA",
    bajada: "Panel del negocio",
    moneda: "$",
    // Objetivo de cash collected por mes. Es la vara de todos los semáforos.
    metaMensual: 68000,
  },

  /* ── 2 · Los meses ────────────────────────────────────────────────────────
     Una fila por mes. El ÚLTIMO de la lista es el mes en curso: se marca
     como parcial con `dias` (cuántos días van) y `diasTotal`.

     facturado  = lo que se vendió (contratos firmados)
     cobrado    = la plata que efectivamente entró (cash collected)
     leads      = conversaciones nuevas
     agendas    = llamadas agendadas
     presentadas= llamadas a las que el lead se presentó
     calificadas= de las presentadas, las que calificaban de verdad
     cierres    = ventas (en llamada o en seguimiento)
     ads        = inversión en publicidad
     alumnos    = alumnos activos a fin de ese mes                           */
  meses: [
    { mes: "2025-10", facturado: 38400, cobrado: 31250, leads: 412, agendas: 61,  presentadas: 42, calificadas: 33, cierres: 8,  ads: 4180, alumnos: 41 },
    { mes: "2025-11", facturado: 44900, cobrado: 36780, leads: 468, agendas: 68,  presentadas: 47, calificadas: 37, cierres: 9,  ads: 4640, alumnos: 47 },
    { mes: "2025-12", facturado: 41200, cobrado: 39420, leads: 391, agendas: 58,  presentadas: 38, calificadas: 30, cierres: 8,  ads: 3920, alumnos: 52 },
    { mes: "2026-01", facturado: 29800, cobrado: 33140, leads: 344, agendas: 51,  presentadas: 31, calificadas: 24, cierres: 6,  ads: 3310, alumnos: 54 },
    { mes: "2026-02", facturado: 47600, cobrado: 38960, leads: 502, agendas: 74,  presentadas: 52, calificadas: 41, cierres: 10, ads: 5070, alumnos: 59 },
    { mes: "2026-03", facturado: 55300, cobrado: 45870, leads: 587, agendas: 86,  presentadas: 61, calificadas: 48, cierres: 12, ads: 5840, alumnos: 66 },
    { mes: "2026-04", facturado: 58100, cobrado: 49320, leads: 613, agendas: 91,  presentadas: 63, calificadas: 50, cierres: 12, ads: 6120, alumnos: 71 },
    { mes: "2026-05", facturado: 82700, cobrado: 64180, leads: 894, agendas: 128, presentadas: 92, calificadas: 73, cierres: 18, ads: 8460, alumnos: 84 },
    { mes: "2026-06", facturado: 61400, cobrado: 58930, leads: 648, agendas: 95,  presentadas: 67, calificadas: 52, cierres: 13, ads: 6380, alumnos: 88 },
    { mes: "2026-07", facturado: 66900, cobrado: 61240, leads: 702, agendas: 103, presentadas: 72, calificadas: 57, cierres: 14, ads: 6910, alumnos: 91 },
    { mes: "2026-08", facturado: 52300, cobrado: 57480, leads: 689, agendas: 99,  presentadas: 58, calificadas: 46, cierres: 11, ads: 7240, alumnos: 89 },
    { mes: "2026-09", facturado: 24700, cobrado: 21860, leads: 231, agendas: 34,  presentadas: 24, calificadas: 19, cierres: 5,  ads: 2180, alumnos: 87,
      dias: 9, diasTotal: 30 },
  ],

  /* ── 3 · El equipo (últimos 90 días) ──────────────────────────────────────
     Los totales de esta lista tienen que dar los mismos números que la suma
     de los últimos 3 meses de arriba. El dashboard lo verifica y avisa. */
  closers: [
    { nombre: "Yendry Molina",  presentadas: 41, calificadas: 34, cierres: 10, cobrado: 48900 },
    { nombre: "Camilo Estrada", presentadas: 36, calificadas: 29, cierres: 8,  cobrado: 37240 },
    { nombre: "Rocío Pardo",    presentadas: 31, calificadas: 24, cierres: 6,  cobrado: 27680 },
    { nombre: "Nahuel Vidal",   presentadas: 28, calificadas: 21, cierres: 4,  cobrado: 18410 },
    { nombre: "Tomás Guzmán",   presentadas: 18, calificadas: 14, cierres: 2,  cobrado: 8350  },
  ],

  /* inbound = conversaciones nuevas · fups = seguimientos
     La tasa del setter es agendas / (inbound + fups) — el seguimiento cuenta. */
  setters: [
    { nombre: "Melina Cruz",  inbound: 812, fups: 604, agendas: 78 },
    { nombre: "Brian Ocampo", inbound: 744, fups: 552, agendas: 66 },
    { nombre: "Ivana Ferrer", inbound: 690, fups: 498, agendas: 54 },
    { nombre: "Kevin Duarte", inbound: 585, fups: 421, agendas: 38 },
  ],

  /* ── 4 · De dónde salen los leads (últimos 90 días) ───────────────────── */
  fuentes: [
    { nombre: "Instagram orgánico", leads: 624, agendas: 88, cierres: 12 },
    { nombre: "Ads Meta",           leads: 508, agendas: 71, cierres: 9  },
    { nombre: "YouTube",            leads: 231, agendas: 39, cierres: 6  },
    { nombre: "Referidos",          leads: 148, agendas: 26, cierres: 2  },
    { nombre: "WhatsApp / otro",    leads: 111, agendas: 12, cierres: 1  },
  ],

  /* ── 5 · El contenido (últimos 90 días) ───────────────────────────────── */
  contenido: [
    { formato: "Reels",     piezas: 12,  views: 1144733, ctas: 9,  leads: 408, agendas: 59 },
    { formato: "Historias", piezas: 168, views: 89400,   ctas: 44, leads: 216, agendas: 29 },
    { formato: "YouTube",   piezas: 6,   views: 38200,   ctas: 6,  leads: 231, agendas: 39 },
  ],

  /* ── 8 · Los reels y lo que trajo cada uno ────────────────────────────────
     Uno por reel, con sus métricas y la atribución (leads, agendas, ventas,
     cobrado). La miniatura va en miniaturas/<shortcode>.jpg. Vacío = la
     sección no se muestra. */
  reels: [],

  /* ── 6 · El pipeline — las oportunidades ABIERTAS de hoy ──────────────────
     Es una foto del estado actual, no de un período: por eso no suma con los
     meses ni con las llamadas. Lo que está acá todavía no es plata.

     etapa: "Agendada" · "Presentada" · "Calificada" · "Propuesta" · "Seguimiento"
       El orden de arriba es el del embudo y es el que dibuja las columnas.
     dias: cuántos días lleva parada en esa etapa. Arriba de 7 se marca fría.
     prob: probabilidad de cierre de ESA etapa, 0 a 100. Es lo que pondera el
       valor del pipeline — sin esto, "tengo $180k en pipeline" no dice nada. */
  pipelineEtapas: [
    { nombre: "Agendada",    prob: 10 },
    { nombre: "Presentada",  prob: 25 },
    { nombre: "Calificada",  prob: 40 },
    { nombre: "Propuesta",   prob: 60 },
    { nombre: "Seguimiento", prob: 75 },
  ],

  pipeline: [
    { lead:"Ignacio T.",    closer:"Yendry Molina",  etapa:"Seguimiento", monto:4900, dias:2,  fuente:"Instagram orgánico", prox:"Manda el primer pago el viernes" },
    { lead:"Sofía L.",      closer:"Camilo Estrada", etapa:"Seguimiento", monto:5600, dias:3,  fuente:"Ads Meta",           prox:"Lo habla con el socio" },
    { lead:"Bruno S.",      closer:"Yendry Molina",  etapa:"Propuesta",   monto:6800, dias:1,  fuente:"Referidos",          prox:"Le mandé el plan de pago en 3" },
    { lead:"Facundo R.",    closer:"Rocío Pardo",    etapa:"Propuesta",   monto:3200, dias:4,  fuente:"YouTube",            prox:"Espera el cobro de un cliente" },
    { lead:"Julián C.",     closer:"Camilo Estrada", etapa:"Propuesta",   monto:4200, dias:6,  fuente:"YouTube",            prox:"Pidió ver un caso parecido" },
    { lead:"Mariana E.",    closer:"Yendry Molina",  etapa:"Propuesta",   monto:7500, dias:11, fuente:"Instagram orgánico", prox:"No contesta hace una semana" },
    { lead:"Emiliano P.",   closer:"Nahuel Vidal",   etapa:"Calificada",  monto:4900, dias:1,  fuente:"Referidos",          prox:"Reagendó para el jueves" },
    { lead:"Valentina O.",  closer:"Camilo Estrada", etapa:"Calificada",  monto:5600, dias:2,  fuente:"YouTube",            prox:"Segunda llamada agendada" },
    { lead:"Tobías N.",     closer:"Rocío Pardo",    etapa:"Calificada",  monto:3000, dias:5,  fuente:"Ads Meta",           prox:"Quiere arrancar el mes que viene" },
    { lead:"Camila R.",     closer:"Tomás Guzmán",   etapa:"Calificada",  monto:4200, dias:9,  fuente:"Instagram orgánico", prox:"Se enfrió después de la llamada" },
    { lead:"Milagros H.",   closer:"Tomás Guzmán",   etapa:"Presentada",  monto:2800, dias:1,  fuente:"Instagram orgánico", prox:"Falta ver si califica" },
    { lead:"Diego A.",      closer:"Yendry Molina",  etapa:"Presentada",  monto:4900, dias:2,  fuente:"Ads Meta",           prox:"Pidió pensarlo" },
    { lead:"Renata C.",     closer:"Nahuel Vidal",   etapa:"Presentada",  monto:3200, dias:8,  fuente:"WhatsApp / otro",    prox:"Sin respuesta al seguimiento" },
    { lead:"Iván M.",       closer:"Camilo Estrada", etapa:"Agendada",    monto:4900, dias:0,  fuente:"Instagram orgánico", prox:"Llamada mañana 15:00" },
    { lead:"Paula G.",      closer:"Rocío Pardo",    etapa:"Agendada",    monto:4900, dias:0,  fuente:"Ads Meta",           prox:"Llamada mañana 17:30" },
    { lead:"Santiago V.",   closer:"Yendry Molina",  etapa:"Agendada",    monto:6800, dias:1,  fuente:"Referidos",          prox:"Llamada el jueves" },
    { lead:"Abril D.",      closer:"Nahuel Vidal",   etapa:"Agendada",    monto:3000, dias:3,  fuente:"YouTube",            prox:"Confirmó por WhatsApp" },
    { lead:"Lautaro F.",    closer:"Tomás Guzmán",   etapa:"Agendada",    monto:2800, dias:6,  fuente:"Ads Meta",           prox:"Todavía no confirmó" },
  ],

  /* ── 7 · Las cuotas por cobrar (estado de HOY, no de un período) ──────────
     estado: "cobrado" · "por-cobrar" · "vencida" · "protocolo"              */
  cuotas: [
    { alumno: "M. Villalba",   monto: 1650, vence: "2026-09-02", closer: "Yendry Molina",  estado: "vencida"    },
    { alumno: "R. Alcántara",  monto: 2400, vence: "2026-09-04", closer: "Camilo Estrada", estado: "vencida"    },
    { alumno: "J. Beltrán",    monto: 1650, vence: "2026-09-05", closer: "Rocío Pardo",    estado: "vencida"    },
    { alumno: "S. Quiroga",    monto: 3240, vence: "2026-09-07", closer: "Yendry Molina",  estado: "protocolo"  },
    { alumno: "D. Montenegro", monto: 1650, vence: "2026-09-08", closer: "Nahuel Vidal",   estado: "cobrado"    },
    { alumno: "P. Ferreyra",   monto: 2800, vence: "2026-09-09", closer: "Camilo Estrada", estado: "cobrado"    },
    { alumno: "L. Sandoval",   monto: 1650, vence: "2026-09-12", closer: "Yendry Molina",  estado: "por-cobrar" },
    { alumno: "A. Rivarola",   monto: 2400, vence: "2026-09-14", closer: "Rocío Pardo",    estado: "por-cobrar" },
    { alumno: "C. Maidana",    monto: 3000, vence: "2026-09-17", closer: "Camilo Estrada", estado: "por-cobrar" },
    { alumno: "F. Otamendi",   monto: 1650, vence: "2026-09-19", closer: "Tomás Guzmán",   estado: "por-cobrar" },
    { alumno: "N. Bustamante", monto: 2800, vence: "2026-09-22", closer: "Yendry Molina",  estado: "por-cobrar" },
    { alumno: "G. Peralta",    monto: 1650, vence: "2026-09-24", closer: "Nahuel Vidal",   estado: "por-cobrar" },
    { alumno: "V. Casaretto",  monto: 2400, vence: "2026-09-26", closer: "Rocío Pardo",    estado: "por-cobrar" },
    { alumno: "H. Zambrano",   monto: 3240, vence: "2026-09-29", closer: "Camilo Estrada", estado: "por-cobrar" },
  ],

  /* ── 8 · Las últimas llamadas ─────────────────────────────────────────────
     situacion: "Adentro en llamada" · "Adentro en seguimiento" · "No cerró"
                · "Reagendado" · "No se presentó" · "Pendiente"
     Un cierre es una situación "Adentro …", no un monto.                    */
  llamadas: [
    { fecha: "2026-09-09", lead: "Ignacio T.",   closer: "Yendry Molina",  fuente: "Instagram orgánico", estrategia: "Hand Raiser Reel",     calificado: true,  situacion: "Adentro en llamada",      monto: 4900 },
    { fecha: "2026-09-09", lead: "Belén M.",     closer: "Camilo Estrada", fuente: "Ads Meta",           estrategia: "CTA info/entregables", calificado: true,  situacion: "No cerró",                monto: 0    },
    { fecha: "2026-09-08", lead: "Facundo R.",   closer: "Rocío Pardo",    fuente: "YouTube",            estrategia: "CTA WN",               calificado: true,  situacion: "Adentro en seguimiento",  monto: 3200 },
    { fecha: "2026-09-08", lead: "Carla V.",     closer: "Yendry Molina",  fuente: "Instagram orgánico", estrategia: "Hand Raiser Historia", calificado: false, situacion: "No cerró",                monto: 0    },
    { fecha: "2026-09-08", lead: "Emiliano P.",  closer: "Nahuel Vidal",   fuente: "Referidos",          estrategia: "DM Directo",           calificado: true,  situacion: "Reagendado",              monto: 0    },
    { fecha: "2026-09-07", lead: "Sofía L.",     closer: "Camilo Estrada", fuente: "Ads Meta",           estrategia: "Encuesta",             calificado: true,  situacion: "Adentro en llamada",      monto: 5600 },
    { fecha: "2026-09-05", lead: "Martín G.",    closer: "Yendry Molina",  fuente: "Instagram orgánico", estrategia: "Hand Raiser Reel",     calificado: true,  situacion: "No cerró",                monto: 0    },
    { fecha: "2026-09-05", lead: "Antonella D.", closer: "Rocío Pardo",    fuente: "Ads Meta",           estrategia: "CTA info/entregables", calificado: false, situacion: "No se presentó",          monto: 0    },
    { fecha: "2026-09-04", lead: "Julián C.",    closer: "Camilo Estrada", fuente: "YouTube",            estrategia: "CTA WN",               calificado: true,  situacion: "Adentro en seguimiento",  monto: 4200 },
    { fecha: "2026-09-04", lead: "Rocío A.",     closer: "Tomás Guzmán",   fuente: "Instagram orgánico", estrategia: "Hand Raiser Historia", calificado: true,  situacion: "No cerró",                monto: 0    },
    { fecha: "2026-09-03", lead: "Bruno S.",     closer: "Yendry Molina",  fuente: "Referidos",          estrategia: "DM Directo",           calificado: true,  situacion: "Adentro en llamada",      monto: 6800 },
    { fecha: "2026-09-03", lead: "Lucía F.",     closer: "Nahuel Vidal",   fuente: "Ads Meta",           estrategia: "Encuesta",             calificado: false, situacion: "No cerró",                monto: 0    },
    { fecha: "2026-09-02", lead: "Gonzalo M.",   closer: "Rocío Pardo",    fuente: "Instagram orgánico", estrategia: "Hand Raiser Reel",     calificado: true,  situacion: "No se presentó",          monto: 0    },
    { fecha: "2026-09-02", lead: "Valentina O.", closer: "Camilo Estrada", fuente: "YouTube",            estrategia: "CTA WN",               calificado: true,  situacion: "Pendiente",               monto: 0    },
    { fecha: "2026-09-01", lead: "Nicolás B.",   closer: "Yendry Molina",  fuente: "Ads Meta",           estrategia: "CTA info/entregables", calificado: true,  situacion: "No cerró",                monto: 0    },
    { fecha: "2026-09-01", lead: "Milagros H.",  closer: "Tomás Guzmán",   fuente: "Instagram orgánico", estrategia: "Hand Raiser Historia", calificado: true,  situacion: "Reagendado",              monto: 0    },
  ],
};

/* ── ¿Los datos de arriba son de demostración? ────────────────────────────
   true  → muestra un sello discreto "datos de demostración"
   false → sacá el sello cuando cargues tus números reales                  */
const MODO_DEMO = true;
