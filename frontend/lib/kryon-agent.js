import { useRef, useState, useCallback, useEffect } from "react"

const WS_URL = import.meta.env.VITE_BACKEND_WS ?? "ws://localhost:8000/ws/agent"

/**
 * useKryonAgent — manages the WebSocket connection to the backend agent.
 *
 * Returns:
 *   send(prompt, mode)  — send a prompt to the agent
 *   messages            — array of chat message objects
 *   isLoading           — true while agent is generating
 *   connected           — WebSocket connection status
 *   clearMessages       — reset the chat feed
 */
export function useKryonAgent({ onFilesCreated } = {}) {
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const reconnectDelay = useRef(1000)
  const [connected, setConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState([])

  // Append or update the last streaming token message
  const appendToken = useCallback((token) => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.role === "assistant" && last?.streaming) {
        return [...prev.slice(0, -1), { ...last, content: last.content + token }]
      }
      return [...prev, { role: "assistant", type: "token", content: token, streaming: true, id: Date.now() }]
    })
  }, [])

  const finalizeStream = useCallback(() => {
    setMessages(prev => {
      const last = prev[prev.length - 1]
      if (last?.streaming) return [...prev.slice(0, -1), { ...last, streaming: false }]
      return prev
    })
  }, [])

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { ...msg, id: Date.now() + Math.random() }])
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      reconnectDelay.current = 1000 // reset backoff on success
      clearTimeout(reconnectTimer.current)
    }

    ws.onclose = () => {
      setConnected(false)
      setIsLoading(false)
      // Exponential backoff: 1s → 2s → 4s → 8s → max 15s
      const delay = reconnectDelay.current
      reconnectDelay.current = Math.min(delay * 2, 15000)
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      let data
      try { data = JSON.parse(event.data) } catch { return }

      switch (data.type) {
        case "token":
          appendToken(data.token)
          break

        case "gen_start":
          addMessage({ role: "system", type: "gen_start", content: data.message })
          break

        case "log":
          addMessage({ role: "system", type: "log", level: data.level, content: data.message })
          break

        case "files_created": {
          // Convert flat { path: content } → frontend FS format { /path: { type:'file', content } }
          const fsEntries = {}
          Object.entries(data.files ?? {}).forEach(([path, content]) => {
            const normalized = path.startsWith("/") ? path : `/${path}`
            // Ensure parent dirs exist
            const parts = normalized.split("/").filter(Boolean)
            let cur = ""
            parts.slice(0, -1).forEach(seg => {
              cur += `/${seg}`
              fsEntries[cur] = { type: "dir" }
            })
            fsEntries[normalized] = { type: "file", content: typeof content === "string" ? content : "" }
          })
          onFilesCreated?.(fsEntries)
          addMessage({
            role: "system",
            type: "files_created",
            content: `Created ${Object.keys(data.files ?? {}).length} file(s): ${Object.keys(data.files ?? {}).join(", ")}`,
            files: Object.keys(data.files ?? {}),
          })
          break
        }

        case "security_scan":
          addMessage({
            role: "system",
            type: "security_scan",
            content: `Security scan complete — score: ${data.score}/100`,
            issues: data.issues,
            score: data.score,
          })
          break

        case "exec_result":
          addMessage({ role: "system", type: "exec_result", content: data.stdout || data.error })
          break

        case "error":
          finalizeStream()
          addMessage({ role: "system", type: "error", content: data.message })
          if (data.fatal) setIsLoading(false)
          break

        case "done":
          finalizeStream()
          setIsLoading(false)
          break

        default:
          break
      }
    }
  }, [appendToken, finalizeStream, addMessage, onFilesCreated])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback((prompt, mode = "developer") => {
    if (!prompt?.trim()) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      addMessage({ role: "system", type: "error", content: "Not connected to backend. Retrying..." })
      connect()
      return
    }
    addMessage({ role: "user", content: prompt })
    setIsLoading(true)
    wsRef.current.send(JSON.stringify({ prompt, mode: mode.toLowerCase() }))
  }, [connect, addMessage])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { send, messages, isLoading, connected, clearMessages, addMessage }
}
