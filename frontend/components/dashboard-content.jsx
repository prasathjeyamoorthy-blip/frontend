import { useState, useCallback, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import Editor from "@monaco-editor/react"
import { TerminalPanel } from "@/components/ui/terminal"
import { FileExplorer } from "@/components/ui/file-explorer"
import { PromptInputBox } from "@/components/ui/ai-prompt-box"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { BeamsBackground } from "@/components/ui/beams-background"
import HeartbeatEffectButton from "@/components/ui/heartbeat-effect-button"
import { X, Play, Wifi, WifiOff, FileCode, ShieldAlert, Loader2 } from "lucide-react"
import { createFS, updateFile, createFile, createDir, deleteEntry, renameEntry, getLang } from "@/lib/fs-store"
import { clearSession } from "@/lib/users-store"
import { HackerModeFlash } from "@/components/ui/letter-glitch"
import { DeveloperModeFlash } from "@/components/ui/developer-flash"
import { useKryonAgent } from "@/lib/kryon-agent"

// ── Chat message renderer ──────────────────────────────────────────────────
const LEVEL_STYLES = {
  writing:  { dot: "bg-blue-400",   label: "writing"  },
  testing:  { dot: "bg-yellow-400", label: "testing"  },
  success:  { dot: "bg-green-400",  label: "success"  },
  error:    { dot: "bg-red-400",    label: "error"    },
  agent:    { dot: "bg-purple-400", label: "agent"    },
}

function ChatMessage({ msg, isDark }) {
  const base = isDark ? "text-white/80" : "text-black/80"
  const subtle = isDark ? "text-white/40" : "text-black/40"
  const codeBg = isDark ? "bg-white/5 border-white/10" : "bg-black/5 border-black/10"

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className={`max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm ${isDark ? "bg-white/10 text-white" : "bg-black/10 text-black"}`}>
          {msg.content}
        </div>
      </div>
    )
  }

  if (msg.type === "token") {
    return (
      <div className={`flex gap-2 items-start`}>
        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 shrink-0 mt-0.5 flex items-center justify-center">
          <span className="text-[8px] text-white font-bold">K</span>
        </div>
        <div className={`text-sm leading-relaxed ${base} whitespace-pre-wrap`}>
          {msg.content}
          {msg.streaming && <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 animate-pulse rounded-sm align-middle" />}
        </div>
      </div>
    )
  }

  if (msg.type === "files_created") {
    return (
      <div className={`flex items-start gap-2 text-xs ${subtle}`}>
        <FileCode size={13} className="mt-0.5 shrink-0 text-blue-400" />
        <span>{msg.content}</span>
      </div>
    )
  }

  if (msg.type === "security_scan") {
    const color = msg.score >= 80 ? "text-green-400" : msg.score >= 50 ? "text-yellow-400" : "text-red-400"
    return (
      <div className={`flex items-start gap-2 text-xs ${subtle}`}>
        <ShieldAlert size={13} className={`mt-0.5 shrink-0 ${color}`} />
        <span>{msg.content} {msg.issues?.length > 0 && `(${msg.issues.length} issue${msg.issues.length > 1 ? "s" : ""})`}</span>
      </div>
    )
  }

  if (msg.type === "threat_report") {
    return <ThreatScoreCard report={msg.threat_report} isDark={isDark} />
  }

  if (msg.type === "log") {
    const style = LEVEL_STYLES[msg.level] ?? { dot: "bg-white/30", label: msg.level }
    return (
      <div className={`flex items-start gap-2 text-xs ${subtle}`}>
        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${style.dot}`} />
        <span className="whitespace-pre-wrap">{msg.content}</span>
      </div>
    )
  }

  if (msg.type === "error") {
    return (
      <div className="flex items-start gap-2 text-xs text-red-400">
        <span className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-red-400" />
        <span>{msg.content}</span>
      </div>
    )
  }

  if (msg.type === "gen_start") {
    return (
      <div className={`flex items-center gap-2 text-xs ${subtle}`}>
        <Loader2 size={11} className="animate-spin shrink-0" />
        <span>{msg.content}</span>
      </div>
    )
  }

  return null
}

// ── Threat Score Card ──────────────────────────────────────────────────────
function ThreatScoreCard({ report, isDark }) {
  if (!report) return null
  const { threat_score, risk_level, risk_color, counts, total, categories, priority_issues } = report

  const ringColor = {
    green: "#22c55e", yellow: "#eab308", orange: "#f97316", red: "#ef4444"
  }[risk_color] ?? "#f97316"

  const badgeClass = {
    green:  "bg-green-500/10 text-green-400 border-green-500/30",
    yellow: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    red:    "bg-red-500/10 text-red-400 border-red-500/30",
  }[risk_color] ?? "bg-orange-500/10 text-orange-400 border-orange-500/30"

  const card = isDark ? "bg-white/5 border-white/10" : "bg-black/5 border-black/10"
  const text = isDark ? "text-white/80" : "text-black/80"
  const subtle = isDark ? "text-white/40" : "text-black/40"

  // Arc progress for the score ring
  const r = 28, circ = 2 * Math.PI * r
  const dash = (threat_score / 100) * circ

  return (
    <div className={`rounded-2xl border p-4 space-y-3 text-xs ${card}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className={`font-semibold text-sm ${text}`}>Threat Score Report</span>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider ${badgeClass}`}>
          {risk_level} RISK
        </span>
      </div>

      {/* Score ring + breakdown */}
      <div className="flex items-center gap-4">
        {/* SVG ring */}
        <div className="relative shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
            <circle cx="36" cy="36" r={r} fill="none" stroke={ringColor}
              strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform="rotate(-90 36 36)"
              style={{ filter: `drop-shadow(0 0 4px ${ringColor})`, transition: "stroke-dasharray 0.6s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold" style={{ color: ringColor }}>{threat_score}</span>
            <span className={`text-[9px] ${subtle}`}>/100</span>
          </div>
        </div>

        {/* Severity counts */}
        <div className="flex flex-col gap-1.5 flex-1">
          {[
            { label: "Critical", count: counts.critical, color: "text-red-400", bar: "bg-red-500" },
            { label: "High",     count: counts.high,     color: "text-orange-400", bar: "bg-orange-500" },
            { label: "Medium",   count: counts.medium,   color: "text-yellow-400", bar: "bg-yellow-500" },
          ].map(({ label, count, color, bar }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`w-12 shrink-0 ${color}`}>{label}</span>
              <div className={`flex-1 h-1.5 rounded-full ${isDark ? "bg-white/10" : "bg-black/10"}`}>
                <div className={`h-full rounded-full ${bar}`}
                  style={{ width: `${total > 0 ? Math.min(100, (count / total) * 100) : 0}%`, transition: "width 0.5s ease" }} />
              </div>
              <span className={`w-4 text-right ${subtle}`}>{count}</span>
            </div>
          ))}
          <div className={`text-[10px] ${subtle} mt-0.5`}>{total} issue{total !== 1 ? "s" : ""} total</div>
        </div>
      </div>

      {/* Top priority issues */}
      {priority_issues?.length > 0 && (
        <div className="space-y-1.5">
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${subtle}`}>Top Priorities</div>
          {priority_issues.map((issue, i) => {
            const sColor = { critical: "text-red-400", high: "text-orange-400", medium: "text-yellow-400" }[issue.severity] ?? "text-white/40"
            return (
              <div key={i} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${isDark ? "bg-white/5" : "bg-black/5"}`}>
                <span className={`shrink-0 font-bold uppercase text-[9px] mt-0.5 ${sColor}`}>{issue.severity}</span>
                <div className="min-w-0">
                  <div className={`truncate ${text}`}>{issue.name}</div>
                  <div className={`truncate text-[10px] ${subtle}`}>{issue.file}{issue.line ? `:${issue.line}` : ""}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Category breakdown */}
      {Object.keys(categories ?? {}).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(categories).map(([cat, n]) => (
            <span key={cat} className={`px-2 py-0.5 rounded-full border text-[10px] ${isDark ? "border-white/10 text-white/50" : "border-black/10 text-black/50"}`}>
              {cat} · {n}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardContent() {
  const [isDark, setIsDark] = useState(true)
  const [mode, setMode] = useState('Developer')
  const [hackerFlash, setHackerFlash] = useState(false)
  const [devFlash, setDevFlash] = useState(false)
  const hackerTimer = useRef(null)
  const devTimer = useRef(null)

  const handleModeChange = useCallback((m) => {
    setMode(m)
    if (m === 'Hacker') {
      setHackerFlash(true)
      clearTimeout(hackerTimer.current)
      hackerTimer.current = setTimeout(() => setHackerFlash(false), 1500)
    }
    if (m === 'Developer') {
      setDevFlash(true)
      clearTimeout(devTimer.current)
      devTimer.current = setTimeout(() => setDevFlash(false), 3000)
    }
  }, [])

  useEffect(() => () => {
    clearTimeout(hackerTimer.current)
    clearTimeout(devTimer.current)
  }, [])
  const [fs, setFs] = useState(() => createFS())
  const [openTabs, setOpenTabs] = useState(['/src/main.js'])
  const [activeTab, setActiveTab] = useState('/src/main.js')

  // ── Agent integration ──────────────────────────────────────────────────
  const chatEndRef = useRef(null)

  const handleFilesCreated = useCallback((fsEntries) => {
    setFs(prev => {
      const merged = { ...prev, ...fsEntries }
      // Open first new file in editor
      const firstFile = Object.entries(fsEntries).find(([, v]) => v.type === "file")?.[0]
      if (firstFile) {
        setOpenTabs(t => t.includes(firstFile) ? t : [...t, firstFile])
        setActiveTab(firstFile)
      }
      return merged
    })
  }, [])

  const { send: agentSend, messages: agentMessages, isLoading: agentLoading, connected, addMessage } = useKryonAgent({
    onFilesCreated: handleFilesCreated,
  })

  const [isScanning, setIsScanning] = useState(false)
  const handleScan = useCallback(async () => {
    if (isScanning) return
    setIsScanning(true)
    try {
      // Extract file contents from frontend FS to send to backend
      const files = {}
      Object.entries(fs).forEach(([path, entry]) => {
        if (entry.type === 'file' && typeof entry.content === 'string') {
          files[path] = entry.content
        }
      })
      const res = await fetch("http://localhost:8000/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      })
      const data = await res.json()
      const { issues = [], score = 100, message, threat_report } = data
      if (message) {
        addMessage?.({ role: "system", type: "security_scan", content: message, issues: [], score: 100, threat_report: null })
      } else {
        // Show the threat score card
        addMessage?.({ role: "system", type: "threat_report", threat_report, issues, score })
        // Individual issues
        issues.forEach(issue => {
          addMessage?.({
            role: "system", type: "log",
            level: issue.severity === "critical" || issue.severity === "high" ? "error" : "testing",
            content: `[${issue.severity.toUpperCase()}] ${issue.name} in ${issue.file}${issue.line ? `:${issue.line}` : ""} — ${issue.description}`,
          })
        })
      }
    } catch {
      addMessage?.({ role: "system", type: "error", content: "Scan failed — is the backend running?" })
    } finally {
      setIsScanning(false)
    }
  }, [isScanning, addMessage, fs])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [agentMessages])
  const [sidebarWidth, setSidebarWidth] = useState(200)
  const [editorPct, setEditorPct] = useState(60)
  const [leftPct, setLeftPct] = useState(65)
  const editorColRef = useRef(null)
  const rootRef = useRef(null)
  const terminalRef = useRef(null)
  const navigate = useNavigate()

  const handleLogout = useCallback(() => {
    clearSession()
    navigate('/')
  }, [navigate])

  // Sidebar horizontal drag
  const isDraggingSidebar = useRef(false)
  const sidebarDragStartX = useRef(0)
  const sidebarDragStartWidth = useRef(0)

  const onDragStart = useCallback((e) => {
    isDraggingSidebar.current = true
    sidebarDragStartX.current = e.clientX
    sidebarDragStartWidth.current = sidebarWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e) => {
      if (!isDraggingSidebar.current) return
      const delta = e.clientX - sidebarDragStartX.current
      const next = Math.min(400, Math.max(120, sidebarDragStartWidth.current + delta))
      setSidebarWidth(next)
    }
    const onUp = () => {
      isDraggingSidebar.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  // Editor/terminal vertical drag
  const onEditorDragStart = useCallback((e) => {
    const col = editorColRef.current
    if (!col) return
    const colH = col.getBoundingClientRect().height
    const startY = e.clientY
    const startPct = editorPct
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const onMove = (e) => {
      const delta = e.clientY - startY
      const next = Math.min(85, Math.max(15, startPct + (delta / colH) * 100))
      setEditorPct(next)
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [editorPct])

  // Left/right panel drag
  const onPanelDragStart = useCallback((e) => {
    const root = rootRef.current
    if (!root) return
    const totalW = root.getBoundingClientRect().width
    const startX = e.clientX
    const startPct = leftPct
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const MIN_RIGHT_PX = 400
    const maxLeftPct = ((totalW - MIN_RIGHT_PX) / totalW) * 100

    const onMove = (e) => {
      const delta = e.clientX - startX
      const next = Math.min(maxLeftPct, Math.max(20, startPct + (delta / totalW) * 100))
      setLeftPct(next)
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [leftPct])

  const border = isDark ? "border-white/10" : "border-black/10"
  const tabBarBg = isDark ? "bg-[#252526]" : "bg-[#ececec]"
  const explorerBg = isDark ? "bg-[#1e1e1e]" : "bg-[#f3f3f3]"
  const termBg = isDark ? "bg-[#0d0d0f]" : "bg-[#fafafa]"

  const openFile = useCallback((path) => {
    setOpenTabs(prev => prev.includes(path) ? prev : [...prev, path])
    setActiveTab(path)
  }, [])

  const closeTab = useCallback((path, e) => {
    e.stopPropagation()
    setOpenTabs(prev => {
      const next = prev.filter(p => p !== path)
      if (activeTab === path) setActiveTab(next[next.length - 1] ?? null)
      return next
    })
  }, [activeTab])

  const handleFsChange = useCallback((newFs) => setFs(newFs), [])

  const handleNewFile = useCallback((path) => {
    setFs(prev => {
      const newFs = { ...prev, [path]: { type: 'file', content: '' } }
      return newFs
    })
    openFile(path)
  }, [openFile])

  const handleNewDir = useCallback((path) => {
    setFs(prev => ({ ...prev, [path]: { type: 'dir' } }))
  }, [])

  const handleDelete = useCallback((path) => {
    if (!confirm(`Delete ${path}?`)) return
    setFs(prev => deleteEntry(prev, path))
    setOpenTabs(prev => prev.filter(p => p !== path && !p.startsWith(path + '/')))
    if (activeTab === path || activeTab?.startsWith(path + '/')) setActiveTab(null)
  }, [activeTab])

  const handleRename = useCallback((oldPath, newPath) => {
    setFs(prev => renameEntry(prev, oldPath, newPath))
    setOpenTabs(prev => prev.map(p => p === oldPath ? newPath : p.startsWith(oldPath + '/') ? newPath + p.slice(oldPath.length) : p))
    if (activeTab === oldPath) setActiveTab(newPath)
  }, [activeTab])

  const activeContent = activeTab && fs[activeTab]?.type === 'file' ? fs[activeTab].content : ''
  const activeLang = activeTab ? getLang(activeTab) : 'plaintext'

  const handleRunFile = useCallback(() => {
    if (!activeTab || !fs[activeTab] || fs[activeTab].type !== 'file') return
    const ext = activeTab.split('.').pop()?.toLowerCase()
    const runnable = ['js', 'jsx', 'mjs', 'py']
    if (!runnable.includes(ext)) return
    terminalRef.current?.runFile(activeTab, fs[activeTab].content, ext)
  }, [activeTab, fs])

  return (
    <div ref={rootRef} className={`flex h-screen w-full overflow-hidden transition-colors duration-500 ${isDark ? "bg-[#1e1e1e]" : "bg-[#f3f3f3]"}`}>

      {/* ══ LEFT SIDE — file explorer + editor + terminal ══ */}
      <div className={`flex`} style={{ width: `${leftPct}%` }}>

        {/* File Explorer sidebar */}
        <div className={`flex flex-col shrink-0 ${explorerBg}`} style={{ width: sidebarWidth }}>
          <FileExplorer
            fs={fs}
            activeFile={activeTab}
            onSelect={openFile}
            onRename={handleRename}
            onDelete={handleDelete}
            onCreateFile={handleNewFile}
            onCreateDir={handleNewDir}
            isDark={isDark}
          />
        </div>

        {/* Drag handle */}
        <div
          onMouseDown={onDragStart}
          className={`shrink-0 w-[4px] cursor-col-resize group relative border-r ${border} hover:border-blue-500/60 transition-colors duration-150`}
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-blue-500/0 group-hover:bg-blue-500/50 transition-colors duration-150 rounded-full" />
        </div>

        {/* Editor + Terminal column */}
        <div ref={editorColRef} className="flex flex-col flex-1 overflow-hidden">

          {/* Editor area */}
          <div className="flex flex-col overflow-hidden" style={{ height: `${editorPct}%` }}>

            {/* Tab bar */}
            <div className={`flex items-end shrink-0 overflow-x-auto border-b ${border} ${tabBarBg}`}
              style={{ minHeight: 35 }}>
              <div className="flex items-end flex-1 overflow-x-auto">
              {openTabs.map(tab => {
                const name = tab.split('/').pop()
                const isActive = tab === activeTab
                return (
                  <div
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer shrink-0 border-r ${border} transition-colors
                      ${isActive
                        ? isDark ? 'bg-[#1e1e1e] text-white border-t-2 border-t-blue-500' : 'bg-[#f3f3f3] text-black border-t-2 border-t-blue-500'
                        : isDark ? 'bg-[#2d2d2d] text-white/40 hover:text-white/70 hover:bg-[#252526]' : 'bg-[#ececec] text-black/40 hover:text-black/70'
                      }`}
                  >
                    <span className="font-mono">{name}</span>
                    <button
                      onClick={(e) => closeTab(tab, e)}
                      className={`rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity
                        ${isDark ? 'hover:bg-white/20 text-white/60' : 'hover:bg-black/10 text-black/60'}`}
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              })}
              {openTabs.length === 0 && (
                <span className={`px-4 py-2 text-xs ${isDark ? 'text-white/20' : 'text-black/20'}`}>
                  No files open
                </span>
              )}
              </div>
              {/* Run button */}
              {activeTab && ['js','jsx','mjs','py'].includes(activeTab.split('.').pop()?.toLowerCase()) && (
                <button
                  onClick={handleRunFile}
                  title="Run file (Ctrl+Enter)"
                  className={`shrink-0 flex items-center gap-1 px-3 py-1 mx-1 my-1 rounded text-xs font-medium border transition-colors
                    ${isDark
                      ? 'bg-green-600/20 hover:bg-green-600/40 text-green-400 hover:text-green-300 border-green-600/30'
                      : 'bg-green-600/10 hover:bg-green-600/20 text-green-700 hover:text-green-800 border-green-600/40'
                    }`}
                >
                  <Play size={11} className="fill-current" />
                  Run
                </button>
              )}
            </div>

            {/* Monaco */}
            <div className="flex-1 overflow-hidden">
              {activeTab && fs[activeTab]?.type === 'file' ? (
                <Editor
                  key={activeTab}
                  height="100%"
                  language={activeLang}
                  value={activeContent}
                  onChange={(val) => setFs(prev => updateFile(prev, activeTab, val ?? ''))}
                  theme={isDark ? "vs-dark" : "light"}
                  options={{
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    renderLineHighlight: "line",
                    padding: { top: 12, bottom: 12 },
                    smoothScrolling: true,
                    cursorBlinking: "smooth",
                    cursorSmoothCaretAnimation: "on",
                    tabSize: 2,
                    wordWrap: "on",
                    automaticLayout: true,
                    bracketPairColorization: { enabled: true },
                    formatOnPaste: true,
                    suggestOnTriggerCharacters: true,
                  }}
                />
              ) : (
                <div className={`flex items-center justify-center h-full text-sm ${isDark ? 'text-white/20' : 'text-black/20'}`}>
                  Select a file to edit
                </div>
              )}
            </div>
          </div>

          {/* Horizontal drag handle */}
          <div
            onMouseDown={onEditorDragStart}
            className={`shrink-0 h-[4px] cursor-row-resize group relative border-t ${border} hover:border-blue-500/60 transition-colors duration-150`}
          >
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] bg-blue-500/0 group-hover:bg-blue-500/50 transition-colors duration-150 rounded-full" />
          </div>

          {/* Terminal — fills remaining space */}
          <div className={`flex flex-col flex-1 overflow-hidden`}>
            {/* Terminal tab bar */}
            <div className={`flex items-center gap-4 px-4 shrink-0 border-b ${border} ${isDark ? 'bg-[#1e1e1e]' : 'bg-[#f3f3f3]'}`}
              style={{ minHeight: 32 }}>
              <span className={`text-xs font-medium pb-0.5 border-b-2 border-blue-500 ${isDark ? 'text-white/80' : 'text-black/80'}`}>
                TERMINAL
              </span>
              <span className={`text-xs ${isDark ? 'text-white/20' : 'text-black/20'}`}>PROBLEMS</span>
              <span className={`text-xs ${isDark ? 'text-white/20' : 'text-black/20'}`}>OUTPUT</span>
            </div>

            <div className={`flex-1 overflow-hidden ${termBg}`}>
              <TerminalPanel
                ref={terminalRef}
                isDark={isDark}
                fs={fs}
                onFsChange={handleFsChange}
                onOpenFile={openFile}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ══ PANEL DRAG HANDLE ══ */}
      <div
        onMouseDown={onPanelDragStart}
        className={`shrink-0 w-[4px] cursor-col-resize group relative border-r ${border} hover:border-blue-500/60 transition-colors duration-150 z-10`}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-blue-500/0 group-hover:bg-blue-500/50 transition-colors duration-150 rounded-full" />
      </div>

      {/* ══ RIGHT SIDE — AI chat ══ */}
      <div className="relative flex flex-col overflow-hidden flex-1" style={{ minWidth: 400 }}>
        <div className="absolute inset-0 z-0">
          <BeamsBackground className="h-full w-full" lightMode={!isDark} />
        </div>

        <div className="relative z-20 flex items-center justify-end gap-2 px-3 py-3 shrink-0">
          <div className={`flex items-center justify-center w-7 h-7 rounded-full border ${
            connected
              ? isDark ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-green-600/30 text-green-700 bg-green-500/10"
              : isDark ? "border-red-500/30 text-red-400 bg-red-500/10" : "border-red-600/30 text-red-700 bg-red-500/10"
          }`} title={connected ? "Connected" : "Offline"}>
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          </div>
          <ThemeToggle isDark={isDark} onToggle={() => setIsDark(p => !p)} />
          <HeartbeatEffectButton onClick={handleLogout} />
        </div>

        {/* Chat message feed */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-2 space-y-2 scrollbar-thin">
          {agentMessages.length === 0 && (
            <div className={`flex items-center justify-center h-full text-sm ${isDark ? "text-white/20" : "text-black/30"}`}>
              Ask KRYON to generate code, explain concepts, or build features.
            </div>
          )}
          {agentMessages.map((msg) => (
            <ChatMessage key={msg.id} msg={msg} isDark={isDark} />
          ))}
          <div ref={chatEndRef} />
        </div>

        <div className="relative z-10 flex flex-col items-center px-4 pb-8 shrink-0">
          <div className="w-full">
            <PromptInputBox
              placeholder="Ask KRYON anything..."
              onSend={(msg) => agentSend(msg, mode)}
              isLoading={agentLoading}
              mode={mode}
              onModeChange={handleModeChange}
              onThreat={handleScan}
              isThreatScanning={isScanning}
              className={isDark
                ? ""
                : "!bg-white/30 !border-white/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] [&_textarea]:text-zinc-900 [&_textarea]:placeholder:text-zinc-500"}
            />
          </div>
        </div>
      </div>
      <HackerModeFlash active={hackerFlash} />
      <DeveloperModeFlash active={devFlash} />
    </div>
  )
}
