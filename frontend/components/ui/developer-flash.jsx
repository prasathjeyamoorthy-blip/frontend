/**
 * Developer Mode Flash — Heavy boot-sequence animation
 * Inspired by react-bits: BlurText, ShinyText, Particles (ogl WebGL)
 * https://reactbits.dev
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Renderer, Camera, Geometry, Program, Mesh } from 'ogl'

// ─── WebGL Particles (react-bits Particles source) ───────────────────────────
const VERT = /* glsl */`
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;
  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uSizeRandomness;
  varying vec4 vRandom;
  varying vec3 vColor;
  void main() {
    vRandom = random;
    vColor = color;
    vec3 pos = position * uSpread;
    pos.z *= 10.0;
    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime;
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);
    vec4 mvPos = viewMatrix * mPos;
    gl_PointSize = (uBaseSize * (1.0 + uSizeRandomness * (random.x - 0.5))) / length(mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`
const FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  varying vec4 vRandom;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));
    float circle = smoothstep(0.5, 0.38, d) * 0.85;
    gl_FragColor = vec4(vColor + 0.15 * sin(uv.yxx + uTime + vRandom.y * 6.28), circle);
  }
`

const hexToRgb = hex => {
  hex = hex.replace(/^#/, '')
  if (hex.length === 3) hex = hex.split('').map(c => c+c).join('')
  const n = parseInt(hex, 16)
  return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255]
}

function ParticlesCanvas() {
  const ref = useRef(null)
  useEffect(() => {
    const container = ref.current
    if (!container) return
    const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio, 2), depth: false, alpha: true })
    const gl = renderer.gl
    container.appendChild(gl.canvas)
    gl.clearColor(0,0,0,0)
    gl.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'

    const camera = new Camera(gl, { fov: 15 })
    camera.position.set(0, 0, 20)

    const resize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight)
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height })
    }
    window.addEventListener('resize', resize)
    resize()

    const COUNT = 220
    const palette = ['#6d28d9','#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#0ea5e9','#38bdf8','#818cf8']
    const positions = new Float32Array(COUNT * 3)
    const randoms   = new Float32Array(COUNT * 4)
    const colors    = new Float32Array(COUNT * 3)

    for (let i = 0; i < COUNT; i++) {
      let x,y,z,len
      do { x=Math.random()*2-1; y=Math.random()*2-1; z=Math.random()*2-1; len=x*x+y*y+z*z } while(len>1||len===0)
      const r = Math.cbrt(Math.random())
      positions.set([x*r, y*r, z*r], i*3)
      randoms.set([Math.random(),Math.random(),Math.random(),Math.random()], i*4)
      colors.set(hexToRgb(palette[Math.floor(Math.random()*palette.length)]), i*3)
    }

    const geometry = new Geometry(gl, {
      position: { size:3, data:positions },
      random:   { size:4, data:randoms },
      color:    { size:3, data:colors },
    })
    const program = new Program(gl, {
      vertex: VERT, fragment: FRAG,
      uniforms: {
        uTime:          { value: 0 },
        uSpread:        { value: 12 },
        uBaseSize:      { value: 90 },
        uSizeRandomness:{ value: 1.2 },
      },
      transparent: true, depthTest: false,
    })
    const mesh = new Mesh(gl, { mode: gl.POINTS, geometry, program })

    let id, last = performance.now(), elapsed = 0
    const tick = t => {
      id = requestAnimationFrame(tick)
      elapsed += (t - last) * 0.08; last = t
      program.uniforms.uTime.value = elapsed * 0.001
      mesh.rotation.y = Math.cos(elapsed * 0.0004) * 0.2
      mesh.rotation.z += 0.006
      renderer.render({ scene: mesh, camera })
    }
    id = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('resize', resize)
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])
  return <div ref={ref} style={{ position:'absolute', inset:0 }} />
}

// ─── Glitch Title (letter-by-letter reveal with glitch frames) ───────────────
const GLITCH_CHARS = '!@#$%^&*<>[]{}|/\\~`'
function GlitchTitle({ text, color = '#ffffff' }) {
  const [displayed, setDisplayed] = useState(() => Array(text.length).fill(''))
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    const result = Array(text.length).fill('')
    const delays = text.split('').map((_, i) => i * 45)

    delays.forEach((delay, i) => {
      // glitch phase: scramble for a bit
      let glitchCount = 0
      const glitchInterval = setInterval(() => {
        if (cancelled) { clearInterval(glitchInterval); return }
        result[i] = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        setDisplayed([...result])
        glitchCount++
        if (glitchCount >= 3) {
          clearInterval(glitchInterval)
          setTimeout(() => {
            if (!cancelled) {
              result[i] = text[i]
              setDisplayed([...result])
              if (i === text.length - 1) setDone(true)
            }
          }, 60)
        }
      }, delay + 20)
    })

    return () => { cancelled = true }
  }, [text])

  return (
    <span style={{
      fontFamily: 'monospace',
      fontSize: 'clamp(38px, 6vw, 72px)',
      fontWeight: 900,
      letterSpacing: '0.04em',
      color,
      textShadow: done
        ? '0 0 20px rgba(139,92,246,0.8), 0 0 60px rgba(109,40,217,0.5), 0 0 100px rgba(14,165,233,0.3)'
        : '0 0 10px rgba(139,92,246,0.4)',
      transition: 'text-shadow 0.4s ease',
      display: 'inline-block',
    }}>
      {displayed.map((ch, i) => (
        <motion.span
          key={i}
          animate={ch === text[i] && ch !== ' '
            ? { color: ['#a78bfa', '#ffffff', '#ffffff'], scale: [1.2, 1] }
            : {}}
          transition={{ duration: 0.15 }}
          style={{ display: 'inline-block', minWidth: ch === ' ' ? '0.35em' : undefined }}
        >
          {ch || '\u00A0'}
        </motion.span>
      ))}
    </span>
  )
}

// ─── Boot progress bar ────────────────────────────────────────────────────────
function BootBar({ delay = 0.4 }) {
  const [pct, setPct] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => {
      const steps = [15, 35, 55, 72, 88, 100]
      let i = 0
      const iv = setInterval(() => {
        setPct(steps[i])
        i++
        if (i >= steps.length) clearInterval(iv)
      }, 160)
      return () => clearInterval(iv)
    }, delay * 1000)
    return () => clearTimeout(t)
  }, [delay])

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      style={{ width: 'clamp(200px, 32vw, 340px)' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#6d28d9', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
          Initializing
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#a78bfa' }}>{pct}%</span>
      </div>
      <div style={{ height: 3, background: 'rgba(109,40,217,0.2)', borderRadius: 2, overflow: 'hidden' }}>
        <motion.div
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, #6d28d9, #0ea5e9)',
            boxShadow: '0 0 8px #7c3aed',
            borderRadius: 2,
          }}
        />
      </div>
    </motion.div>
  )
}

// ─── Typing line ──────────────────────────────────────────────────────────────
function TypeLine({ text, startDelay, color = '#a78bfa' }) {
  const [shown, setShown] = useState('')
  useEffect(() => {
    let cancelled = false
    const t = setTimeout(() => {
      let i = 0
      const iv = setInterval(() => {
        if (cancelled) { clearInterval(iv); return }
        i++; setShown(text.slice(0, i))
        if (i >= text.length) clearInterval(iv)
      }, 28)
      return () => clearInterval(iv)
    }, startDelay * 1000)
    return () => { cancelled = true; clearTimeout(t) }
  }, [text, startDelay])

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: startDelay, duration: 0.18 }}
      style={{ fontFamily: 'monospace', fontSize: 11, color, letterSpacing: '0.06em',
        display: 'flex', alignItems: 'center', gap: 6 }}
    >
      <span style={{ color: '#6d28d9', fontSize: 13 }}>›</span>
      <span>{shown}</span>
      {shown.length < text.length && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ repeat: Infinity, duration: 0.55 }}
          style={{ width: 6, height: 12, background: '#7c3aed', borderRadius: 1, display: 'inline-block' }}
        />
      )}
    </motion.div>
  )
}

// ─── Scanline grid overlay ────────────────────────────────────────────────────
function ScanGrid() {
  return (
    <>
      {/* horizontal scanlines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(109,40,217,0.04) 3px, rgba(109,40,217,0.04) 4px)',
      }} />
      {/* vertical grid lines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(109,40,217,0.04) 39px, rgba(109,40,217,0.04) 40px)',
      }} />
    </>
  )
}

// ─── Corner brackets ─────────────────────────────────────────────────────────
function CornerBrackets() {
  const style = (pos) => ({
    position: 'absolute', width: 28, height: 28,
    ...pos,
    borderColor: 'rgba(124,58,237,0.6)',
    borderStyle: 'solid',
    borderWidth: 0,
  })
  return (
    <>
      <motion.div initial={{ opacity:0, scale:0.5 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.1, duration:0.25 }}
        style={{ ...style({ top:24, left:24 }), borderTopWidth:2, borderLeftWidth:2 }} />
      <motion.div initial={{ opacity:0, scale:0.5 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.15, duration:0.25 }}
        style={{ ...style({ top:24, right:24 }), borderTopWidth:2, borderRightWidth:2 }} />
      <motion.div initial={{ opacity:0, scale:0.5 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.2, duration:0.25 }}
        style={{ ...style({ bottom:24, left:24 }), borderBottomWidth:2, borderLeftWidth:2 }} />
      <motion.div initial={{ opacity:0, scale:0.5 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.25, duration:0.25 }}
        style={{ ...style({ bottom:24, right:24 }), borderBottomWidth:2, borderRightWidth:2 }} />
    </>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DeveloperModeFlash({ active }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="dev-flash"
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97, filter: 'blur(10px)' }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 120% 100% at 50% 50%, #0a0118 0%, #04001a 60%, #000010 100%)',
            overflow: 'hidden',
          }}
        >
          {/* WebGL particles */}
          <ParticlesCanvas />

          {/* scan grid */}
          <ScanGrid />

          {/* radial vignette */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse 65% 55% at 50% 50%, rgba(4,0,26,0) 0%, rgba(4,0,26,0.7) 100%)',
          }} />

          {/* top edge glow */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: 'linear-gradient(90deg, transparent 0%, #7c3aed 30%, #0ea5e9 70%, transparent 100%)',
              boxShadow: '0 0 20px #7c3aed, 0 0 40px rgba(124,58,237,0.4)',
              transformOrigin: 'center',
            }}
          />
          {/* bottom edge glow */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.05, ease: 'easeOut' }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
              background: 'linear-gradient(90deg, transparent 0%, #0ea5e9 30%, #7c3aed 70%, transparent 100%)',
              boxShadow: '0 0 20px #0ea5e9, 0 0 40px rgba(14,165,233,0.4)',
              transformOrigin: 'center',
            }}
          />

          {/* corner brackets */}
          <CornerBrackets />

          {/* flicker on entry */}
          <motion.div
            initial={{ opacity: 0.18 }}
            animate={{ opacity: [0.18, 0, 0.1, 0, 0.06, 0] }}
            transition={{ duration: 0.4, times: [0, 0.15, 0.3, 0.5, 0.75, 1] }}
            style={{ position: 'absolute', inset: 0, background: '#7c3aed', pointerEvents: 'none' }}
          />

          {/* center content */}
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 20,
          }}>

            {/* badge */}
            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: -12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
              style={{
                padding: '4px 18px', borderRadius: 999,
                border: '1px solid rgba(124,58,237,0.55)',
                background: 'rgba(109,40,217,0.14)', backdropFilter: 'blur(12px)',
              }}
            >
              <span style={{
                fontFamily: 'monospace', fontSize: 10, color: '#a78bfa',
                letterSpacing: '0.32em', textTransform: 'uppercase',
              }}>
                Full Dev Toolkit
              </span>
            </motion.div>

            {/* Glitch title */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.2 }}
              style={{ textAlign: 'center' }}
            >
              <GlitchTitle text="Developer Mode" />
            </motion.div>

            {/* shiny subtitle */}
            <motion.div
              initial={{ opacity: 0, scale: 0.88 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.38, duration: 0.22 }}
              style={{
                fontFamily: 'monospace',
                fontSize: 'clamp(11px, 1.4vw, 15px)',
                background: 'linear-gradient(110deg, #a78bfa 0%, #a78bfa 30%, #ffffff 50%, #a78bfa 70%, #a78bfa 100%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                animation: 'devShine 2s linear infinite',
                letterSpacing: '0.12em',
              }}
            >
              {'< initializing environment />'}
            </motion.div>

            {/* divider */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.44, duration: 0.3, ease: 'easeOut' }}
              style={{
                height: 1, width: 'clamp(160px, 26vw, 300px)',
                background: 'linear-gradient(90deg, transparent, #7c3aed, #0ea5e9, transparent)',
                boxShadow: '0 0 12px rgba(124,58,237,0.6)',
                transformOrigin: 'center',
              }}
            />

            {/* boot progress */}
            <BootBar delay={0.5} />

            {/* typing lines */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              <TypeLine text="loading monaco editor..."    startDelay={0.55} />
              <TypeLine text="connecting to runtime..."    startDelay={0.82} color="#38bdf8" />
              <TypeLine text="mounting file system..."     startDelay={1.08} color="#818cf8" />
            </div>
          </div>

          {/* inline keyframes for shine */}
          <style>{`
            @keyframes devShine {
              0%   { background-position: 200% center; }
              100% { background-position: -200% center; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
