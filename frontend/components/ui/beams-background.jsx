import { useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export function BeamsBackground({ className, children, intensity = "strong", lightMode = false }) {
  const canvasRef = useRef(null)
  const beamsRef = useRef([])
  const animationFrameRef = useRef(0)
  const MINIMUM_BEAMS = 20
  const opacityMap = { subtle: 0.7, medium: 0.85, strong: 1 }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    function makeBeam(w, h) {
      return {
        x: Math.random() * w * 1.5 - w * 0.25,
        y: Math.random() * h * 1.5 - h * 0.25,
        width: 30 + Math.random() * 60,
        length: h * 2.5,
        angle: -35 + Math.random() * 10,
        speed: 0.6 + Math.random() * 1.2,
        opacity: lightMode ? 0.12 + Math.random() * 0.15 : 0.12 + Math.random() * 0.16,
        hue: lightMode ? 0 : 190 + Math.random() * 70,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03,
      }
    }

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.scale(dpr, dpr)
      beamsRef.current = Array.from({ length: MINIMUM_BEAMS * 1.5 }, () => makeBeam(canvas.width, canvas.height))
    }

    updateCanvasSize()
    window.addEventListener("resize", updateCanvasSize)

    function resetBeam(beam, index, totalBeams) {
      if (!canvas) return beam
      const column = index % 3
      const spacing = canvas.width / 3
      beam.y = canvas.height + 100
      beam.x = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5
      beam.width = 100 + Math.random() * 100
      beam.speed = 0.5 + Math.random() * 0.4
      beam.hue = lightMode ? 0 : 190 + (index * 70) / totalBeams
      beam.opacity = lightMode ? 0.1 + Math.random() * 0.12 : 0.2 + Math.random() * 0.1
      return beam
    }

    function drawBeam(ctx, beam) {
      ctx.save()
      ctx.translate(beam.x, beam.y)
      ctx.rotate((beam.angle * Math.PI) / 180)
      const pulsingOpacity = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) * opacityMap[intensity]
      const sat = lightMode ? "0%" : "85%"
      const lit = lightMode ? "30%" : "65%"
      const gradient = ctx.createLinearGradient(0, 0, 0, beam.length)
      gradient.addColorStop(0, `hsla(${beam.hue}, ${sat}, ${lit}, 0)`)
      gradient.addColorStop(0.1, `hsla(${beam.hue}, ${sat}, ${lit}, ${pulsingOpacity * 0.5})`)
      gradient.addColorStop(0.4, `hsla(${beam.hue}, ${sat}, ${lit}, ${pulsingOpacity})`)
      gradient.addColorStop(0.6, `hsla(${beam.hue}, ${sat}, ${lit}, ${pulsingOpacity})`)
      gradient.addColorStop(0.9, `hsla(${beam.hue}, ${sat}, ${lit}, ${pulsingOpacity * 0.5})`)
      gradient.addColorStop(1, `hsla(${beam.hue}, ${sat}, ${lit}, 0)`)
      ctx.fillStyle = gradient
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length)
      ctx.restore()
    }

    function animate() {
      if (!canvas || !ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.filter = lightMode ? "blur(18px)" : "blur(35px)"
      const totalBeams = beamsRef.current.length
      beamsRef.current.forEach((beam, index) => {
        beam.y -= beam.speed
        beam.pulse += beam.pulseSpeed
        if (beam.y + beam.length < -100) resetBeam(beam, index, totalBeams)
        drawBeam(ctx, beam)
      })
      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", updateCanvasSize)
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [intensity, lightMode])

  return (
    <div className={cn("relative min-h-screen w-full overflow-hidden", lightMode ? "bg-white" : "bg-neutral-950", className)}>
      <canvas ref={canvasRef} className="absolute inset-0" style={{ filter: lightMode ? "blur(6px)" : "blur(15px)" }} />
      <motion.div
        className={cn("absolute inset-0", lightMode ? "bg-white/5" : "bg-neutral-950/5")}
        animate={{ opacity: [0.05, 0.15, 0.05] }}
        transition={{ duration: 10, ease: "easeInOut", repeat: Infinity }}
        style={{ backdropFilter: "blur(50px)" }}
      />
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  )
}
