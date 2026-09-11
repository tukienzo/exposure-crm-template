"use client"

type WebkitAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext
}

function soundIsDisabled() {
  if (typeof window === "undefined") return true
  return window.localStorage.getItem("crm-sounds-muted") === "true"
}

let sharedContext: AudioContext | null = null
let lastHoverAt = 0
const INTERFACE_VOLUME_BOOST = 3.5

function getAudioContext() {
  if (typeof window === "undefined" || soundIsDisabled()) return null
  const AudioContextClass =
    window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext
  if (!AudioContextClass) return null
  sharedContext ??= new AudioContextClass()
  if (sharedContext.state === "suspended") void sharedContext.resume()
  return sharedContext
}

function playSoftTone({
  frequency,
  endFrequency,
  volume,
  duration,
  type = "sine",
}: {
  frequency: number
  endFrequency: number
  volume: number
  duration: number
  type?: OscillatorType
}) {
  const context = getAudioContext()
  if (!context) return
  const now = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const filter = context.createBiquadFilter()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, now)
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration)
  filter.type = "lowpass"
  filter.frequency.value = 2200
  filter.Q.value = 0.5
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
  oscillator.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + duration + 0.02)
}

/** Destello al pasar entre opciones, con volumen suficiente para oírse claramente. */
export function playInterfaceHoverSound() {
  const now = performance.now()
  if (now - lastHoverAt < 85) return
  lastHoverAt = now
  playSoftTone({
    frequency: 760,
    endFrequency: 830,
    volume: 0.009 * INTERFACE_VOLUME_BOOST,
    duration: 0.055,
  })
}

/** Confirmación táctil clara para botones, links, filas y fichas clickeables. */
export function playInterfacePressSound() {
  playSoftTone({
    frequency: 330,
    endFrequency: 440,
    volume: 0.018 * INTERFACE_VOLUME_BOOST,
    duration: 0.11,
  })
  window.setTimeout(() => {
    playSoftTone({
      frequency: 660,
      endFrequency: 620,
      volume: 0.006 * INTERFACE_VOLUME_BOOST,
      duration: 0.085,
    })
  }, 24)
}

/**
 * Confirmación inspirada en interfaces de consola.
 * Se sintetiza en el navegador para evitar descargas.
 */
export function playSaleConfirmedSound() {
  if (soundIsDisabled()) return

  const context = getAudioContext()
  if (!context) return
  const master = context.createGain()
  const compressor = context.createDynamicsCompressor()
  const now = context.currentTime

  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.7, now + 0.025)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.15)
  compressor.threshold.value = -24
  compressor.knee.value = 18
  compressor.ratio.value = 3
  compressor.attack.value = 0.006
  compressor.release.value = 0.22
  master.connect(compressor)
  compressor.connect(context.destination)

  const notes = [
    { frequency: 392, delay: 0, gain: 0.052, duration: 0.72 },
    { frequency: 493.88, delay: 0.085, gain: 0.045, duration: 0.74 },
    { frequency: 659.25, delay: 0.19, gain: 0.038, duration: 0.82 },
  ]

  notes.forEach(({ frequency, delay, gain: peak, duration }) => {
    const oscillator = context.createOscillator()
    const overtone = context.createOscillator()
    const noteGain = context.createGain()
    const overtoneGain = context.createGain()
    const start = now + delay

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(frequency, start)
    overtone.type = "sine"
    overtone.frequency.setValueAtTime(frequency * 2, start)

    noteGain.gain.setValueAtTime(0.0001, start)
    noteGain.gain.exponentialRampToValueAtTime(peak, start + 0.035)
    noteGain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    overtoneGain.gain.setValueAtTime(0.0001, start)
    overtoneGain.gain.exponentialRampToValueAtTime(peak * 0.12, start + 0.025)
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.62)

    oscillator.connect(noteGain)
    overtone.connect(overtoneGain)
    noteGain.connect(master)
    overtoneGain.connect(master)
    oscillator.start(start)
    overtone.start(start)
    oscillator.stop(start + duration)
    overtone.stop(start + duration)
  })

}
