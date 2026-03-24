import { useRef, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789'
const FONT_SIZE = 16
const CHAR_W = 10
const CHAR_H = 20

function LetterGlitchCanvas({ glitchColors = ['#0f2', '#0af', '#f0f'], glitchSpeed = 40 }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const letters = useRef([])
  const grid = useRef({ columns: 0, rows: 0 })
  const ctx = useRef(null)
  const lastTime = useRef(Date.now())
  const chars = Array.from(CHARS)

  const rndChar = () => chars[Math.floor(Math.random() * chars.length)]
  const rndColor = () => glitchColors[Math.floor(Math.random() * glitchColors.length)]

  const hexToRgb = (hex) => {
    hex = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (_, r, g, b) => r+r+g+g+b+b)
    const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return r ? { r: parseInt(r[1],16), g: parseInt(r[2],16), b: parseInt(r[3],16) } : null
  }

  const lerp = (a, b, t) =>
    `rgb(${Math.round(a.r+(b.r-a.r)*t)},${Math.round(a.g+(b.g-a.g)*t)},${Math.round(a.b+(b.b-a.b)*t)})`

  const init = (w, h) => {
    const cols = Math.ceil(w / CHAR_W)
    const rows = Math.ceil(h / CHAR_H)
    grid.current = { columns: cols, rows }
    letters.current = Array.from({ length: cols * rows }, () => ({
      char: rndChar(), color: rndColor(), targetColor: rndColor(), progress: 1,
    }))
  }

  const draw = () => {
    const canvas = canvasRef.current
    if (!ctx.current || !canvas) return
    const { width, height } = canvas.getBoundingClientRect()
    ctx.current.clearRect(0, 0, width, height)
    ctx.current.font = `${FONT_SIZE}px monospace`
    ctx.current.textBaseline = 'top'
    letters.current.forEach((l, i) => {
      ctx.current.fillStyle = l.color
      ctx.current.fillText(l.char, (i % grid.current.columns) * CHAR_W, Math.floor(i / grid.current.columns) * CHAR_H)
    })
  }

  const update = () => {
    const count = Math.max(1, Math.floor(letters.current.length * 0.05))
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * letters.current.length)
      letters.current[idx].char = rndChar()
      letters.current[idx].targetColor = rndColor()
      letters.current[idx].progress = 0
    }
  }

  const smooth = () => {
    let dirty = false
    letters.current.forEach(l => {
      if (l.progress < 1) {
        l.progress = Math.min(1, l.progress + 0.05)
        const a = hexToRgb(l.color), b = hexToRgb(l.targetColor)
        if (a && b) { l.color = lerp(a, b, l.progress); dirty = true }
      }
    })
    if (dirty) draw()
  }

  const animate = () => {
    const now = Date.now()
    if (now - lastTime.current >= glitchSpeed) {
      update(); draw(); lastTime.current = now
    }
    smooth()
    animRef.current = requestAnimationFrame(animate)
  }

  const resize = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.parentElement.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    ctx.current?.setTransform(dpr, 0, 0, dpr, 0, 0)
    init(rect.width, rect.height)
    draw()
  }

  useEffect(() => {
    ctx.current = canvasRef.current.getContext('2d')
    resize()
    animate()
    const onResize = () => { cancelAnimationFrame(animRef.current); resize(); animate() }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', onResize) }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {/* outer vignette */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(0,0,0,0) 50%, rgba(0,0,0,0.95) 100%)' }} />
    </div>
  )
}

// Wrapper: shows for `duration` ms then fades out
export function HackerModeFlash({ active, duration = 1500 }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="hacker-flash"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}
        >
          <LetterGlitchCanvas glitchColors={['#00ff41', '#008f11', '#00cc33']} glitchSpeed={30} />

          {/* scanlines */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 4px)',
          }} />

          {/* flicker layer */}
          <motion.div
            animate={{ opacity: [0.08, 0, 0.12, 0, 0.06, 0] }}
            transition={{ duration: 0.6, times: [0, 0.15, 0.3, 0.5, 0.75, 1], repeat: 1 }}
            style={{ position: 'absolute', inset: 0, background: '#00ff41', pointerEvents: 'none' }}
          />

          {/* center content */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
          }}>
            {/* red chromatic ghost behind */}
            <motion.h1
              initial={{ opacity: 0, x: -8, skewX: -10 }}
              animate={{ opacity: [0, 0.5, 0, 0.35, 0], x: [-8, 5, -4, 2, 0], skewX: [-10, 7, -5, 2, 0] }}
              transition={{ duration: 0.4, times: [0, 0.2, 0.4, 0.7, 1] }}
              style={{
                position: 'absolute',
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: 'clamp(28px, 5vw, 62px)',
                fontWeight: 900, color: '#ff003c',
                textShadow: '0 0 16px #ff003c, 0 0 32px #ff003c',
                margin: 0, letterSpacing: '0.12em', userSelect: 'none',
                textTransform: 'uppercase',
              }}
            >
              System Breached..
            </motion.h1>

            {/* main text */}
            <motion.h1
              initial={{ opacity: 0, scale: 1.18, y: -10, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
              transition={{ delay: 0.07, duration: 0.28, ease: 'easeOut' }}
              style={{
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: 'clamp(28px, 5vw, 62px)',
                fontWeight: 900,
                color: '#ffffff',
                textShadow: '0 0 10px #ffffff, 0 0 30px #00ff41, 0 0 70px #00aa22, 0 0 120px #005511',
                margin: 0, letterSpacing: '0.12em', textAlign: 'center',
                textTransform: 'uppercase',
              }}
            >
              System Breached..
            </motion.h1>

            {/* subtitle bar */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ delay: 0.22, duration: 0.3, ease: 'easeOut' }}
              style={{
                height: 2, width: 'clamp(180px, 30vw, 360px)',
                background: 'linear-gradient(90deg, transparent, #00ff41, transparent)',
                boxShadow: '0 0 14px #00ff41',
                transformOrigin: 'center',
              }}
            />

            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 0.75, y: 0 }}
              transition={{ delay: 0.32, duration: 0.2 }}
              style={{
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: 12,
                color: '#00ff41', letterSpacing: '0.4em', textTransform: 'uppercase',
              }}
            >
              Access Granted
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
