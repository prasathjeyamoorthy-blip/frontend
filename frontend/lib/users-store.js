// Simple in-memory user store (persisted to localStorage)
const STORAGE_KEY = "kryon_users"
const SESSION_KEY = "kryon_session"

export function getUsers() {
  if (typeof window === "undefined") return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")
  } catch {
    return []
  }
}

export function registerUser(user) {
  const users = getUsers()
  if (users.find((u) => u.email === user.email)) {
    return { ok: false, error: "Email already registered." }
  }
  users.push(user)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users))
  return { ok: true }
}

export function loginUser(email, password) {
  const users = getUsers()
  const user = users.find((u) => u.email === email && u.password === password)
  if (!user) return { ok: false, error: "Invalid email or password." }
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return { ok: true, user }
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null")
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
