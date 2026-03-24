import React, { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

export function NavBar({ items, className, inline = false }) {
  const [activeTab, setActiveTab] = useState(items[0].name)
  const [lampX, setLampX] = useState(null)
  const itemRefs = useRef({})
  const containerRef = useRef(null)

  const updateLamp = (name) => {
    const el = itemRefs.current[name]
    const container = containerRef.current
    if (!el || !container) return
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setLampX(elRect.left - containerRect.left + elRect.width / 2)
  }

  useEffect(() => { updateLamp(activeTab) }, [activeTab])

  useEffect(() => {
    const handleResize = () => updateLamp(activeTab)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [activeTab])

  if (inline) {
    return (
      <div className={cn("relative flex flex-col items-start min-w-0", className)}>
        {/* Lamp above pill */}
        <div className="relative w-full h-4 flex items-end">
          {lampX !== null && (
            <motion.div
              className="absolute bottom-0 flex flex-col items-center pointer-events-none"
              style={{ left: 0 }}
              animate={{ x: lampX - 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <div className="w-10 h-[3px] rounded-full bg-white shadow-[0_0_10px_3px_rgba(255,255,255,1),0_0_20px_6px_rgba(255,255,255,0.5)]" />
              <div className="w-24 h-5 bg-white/20 blur-xl rounded-full -mt-1" />
              <div className="w-14 h-3 bg-white/10 blur-2xl rounded-full -mt-2" />
            </motion.div>
          )}
        </div>

        {/* Pill */}
        <div
          ref={containerRef}
          className="flex items-center gap-0.5 bg-black/70 border border-white/10 backdrop-blur-lg py-0.5 px-0.5 rounded-full shadow-lg"
        >
          {items.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.name
            return (
              <Link
                key={item.name}
                to={item.url}
                ref={(el) => { itemRefs.current[item.name] = el }}
                onClick={() => setActiveTab(item.name)}
                className={cn(
                  "relative cursor-pointer text-xs font-semibold px-4 py-1.5 rounded-full transition-colors duration-200",
                  isActive ? "text-white" : "text-white/40 hover:text-white/70"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-pill-inline"
                    className="absolute inset-0 rounded-full bg-white/[0.15] border border-white/20 -z-10"
                    initial={false}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <span className="hidden md:inline">{item.name}</span>
                <span className="md:hidden"><Icon size={14} strokeWidth={2.5} /></span>
              </Link>
            )
          })}
        </div>
      </div>
    )
  }

  // Default: fixed full-screen centered navbar
  return (
    <div className={cn("fixed top-0 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center", className)}>
      <div className="relative w-full h-5 flex items-end justify-center">
        {lampX !== null && (
          <motion.div
            className="absolute bottom-0 flex flex-col items-center pointer-events-none"
            animate={{ x: lampX - (containerRef.current?.getBoundingClientRect().width ?? 0) / 2 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div className="w-10 h-[4px] rounded-full bg-white shadow-[0_0_10px_3px_rgba(255,255,255,1),0_0_20px_6px_rgba(255,255,255,0.5)]" />
            <div className="w-28 h-6 bg-white/20 blur-xl rounded-full -mt-1" />
            <div className="w-16 h-4 bg-white/10 blur-2xl rounded-full -mt-3" />
          </motion.div>
        )}
      </div>
      <div
        ref={containerRef}
        className="flex items-center gap-1 bg-black/70 border border-white/10 backdrop-blur-lg py-1 px-1 rounded-full shadow-lg"
      >
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.name
          return (
            <Link
              key={item.name}
              to={item.url}
              ref={(el) => { itemRefs.current[item.name] = el }}
              onClick={() => setActiveTab(item.name)}
              className={cn(
                "relative cursor-pointer text-sm font-semibold px-6 py-2 rounded-full transition-colors duration-200",
                isActive ? "text-white" : "text-white/40 hover:text-white/70"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 rounded-full bg-white/[0.08] border border-white/10 -z-10"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span className="hidden md:inline">{item.name}</span>
              <span className="md:hidden"><Icon size={18} strokeWidth={2.5} /></span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
