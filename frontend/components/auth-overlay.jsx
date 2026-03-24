import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X } from "lucide-react"
import { registerUser, loginUser } from "@/lib/users-store"

export function AuthOverlay({ mode, onClose, onSuccess, onSwitchMode }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = (e) => {
    e.preventDefault()
    setError("")
    if (mode === "signup") {
      if (!name.trim()) return setError("Name is required.")
      const result = registerUser({ name, email, password })
      if (!result.ok) return setError(result.error)
      onSuccess(name)
    } else {
      const result = loginUser(email, password)
      if (!result.ok) return setError(result.error)
      onSuccess(result.user.name)
    }
  }

  const inputClass =
    "w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-white/50 transition-colors text-sm"

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={onClose} />
        <motion.div
          className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 shadow-2xl"
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {mode === "signup" ? "Create account" : "Welcome back"}
            </h2>
            <p className="text-white/50 text-sm mt-1">
              {mode === "signup" ? "Sign up to get started with KRYON" : "Log in to your KRYON account"}
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "signup" && (
              <input type="text" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} required />
            )}
            <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} required />
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button type="submit" className="mt-2 w-full rounded-xl bg-white text-black font-semibold py-3 hover:bg-white/90 transition-colors text-sm">
              {mode === "signup" ? "Sign up" : "Log in"} →
            </button>
          </form>
          <p className="text-center text-white/40 text-sm mt-6">
            {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button onClick={() => onSwitchMode(mode === "signup" ? "login" : "signup")} className="text-white hover:underline">
              {mode === "signup" ? "Log in" : "Sign up"}
            </button>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
