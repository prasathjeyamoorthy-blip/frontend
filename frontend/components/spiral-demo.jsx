import { GalaxyBackground } from "@/components/ui/galaxy-background"
import { HoverButton } from "@/components/ui/hover-button"
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button"
import { FlowButton } from "@/components/ui/flow-button"
import { KryonIcon } from "@/components/ui/kryon-logo"
import { AuthOverlay } from "@/components/auth-overlay"
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const SpiralDemo = () => {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [authMode, setAuthMode] = useState(null)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 600)
    return () => clearTimeout(timer)
  }, [])

  const handleAuthSuccess = () => {
    setAuthMode(null)
    navigate('/dashboard')
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-[#060610]">

      {/* Galaxy background — full screen */}
      <div className={`absolute inset-0 transition-all duration-300 ${authMode ? 'blur-sm' : ''}`}>
        <GalaxyBackground
          mouseInteraction
          mouseRepulsion
          starSpeed={0.5}
          density={1}
          hueShift={140}
          speed={1}
          glowIntensity={0.3}
          saturation={0}
          repulsionStrength={5}
          twinkleIntensity={0.3}
          rotationSpeed={0.1}
          transparent={false}
          className="w-full h-full"
        />
      </div>

      {/* Navbar */}
      <nav className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between
        px-8 py-5 transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
        ${authMode ? 'blur-sm pointer-events-none' : ''}`}
      >
        <div className="flex items-center gap-2.5">
          <KryonIcon size={26} />
          <span className="text-[#e0e0e0] text-lg font-semibold tracking-[0.18em] uppercase">KRYON</span>
        </div>
        <div />
        <div className="flex items-center gap-2">
          <InteractiveHoverButton text="Log in" className="w-24" onClick={() => setAuthMode("login")} />
          <FlowButton text="Sign up" onClick={() => setAuthMode("signup")} />
        </div>
      </nav>

      {/* Hero */}
      <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-10 transition-all duration-300 ${authMode ? 'blur-sm' : ''}`}>
        <div
          className={`flex flex-col items-center gap-3 transition-all duration-1000 ease-out
            ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '400ms' }}
        >
          <h1 className="text-white text-5xl md:text-6xl font-bold tracking-[0.3em] uppercase">
            KRYON
          </h1>
          <p className="text-[#666] text-sm tracking-[0.25em] uppercase">Next Generation Platform</p>
        </div>

        <div
          className={`transition-all duration-1000 ease-out
            ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          style={{ transitionDelay: '700ms' }}
        >
          <HoverButton
            className="text-white text-base px-10 py-3"
            onClick={() => setAuthMode("signup")}
          >
            Get Started
          </HoverButton>
        </div>
      </div>

      {/* Sparkle */}
      <div
        className={`absolute bottom-8 right-8 z-10 transition-all duration-1000
          ${visible ? 'opacity-40' : 'opacity-0'}
          ${authMode ? 'blur-sm' : ''}`}
        style={{ transitionDelay: '1200ms' }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 0 L9 7 L16 8 L9 9 L8 16 L7 9 L0 8 L7 7 Z" fill="#aaa" />
        </svg>
      </div>

      {authMode && (
        <AuthOverlay
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={handleAuthSuccess}
          onSwitchMode={setAuthMode}
        />
      )}
    </div>
  )
}

export { SpiralDemo }
