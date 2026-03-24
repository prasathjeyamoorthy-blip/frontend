import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen,
         FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { listDir } from '@/lib/fs-store'
import { cn } from '@/lib/utils'

function FileIcon({ name, isDark = true }) {
  const ext = name.split('.').pop()?.toLowerCase()
  const colors = {
    js: 'text-yellow-500', jsx: 'text-yellow-500',
    ts: 'text-blue-500',  tsx: 'text-blue-500',
    css: 'text-purple-500', html: 'text-orange-500',
    json: 'text-yellow-600', md: isDark ? 'text-white/60' : 'text-black/50',
    py: 'text-green-600', rs: 'text-orange-600',
  }
  return <File size={13} className={cn('shrink-0', colors[ext] ?? (isDark ? 'text-white/50' : 'text-black/40'))} />
}

// Inline input shown inside the tree when creating a new file/folder
function InlineInput({ icon: Icon, iconClass, depth, onCommit, onCancel, isDark = true }) {
  const [val, setVal] = useState('')
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const commit = () => { if (val.trim()) onCommit(val.trim()); else onCancel() }

  return (
    <div className="flex items-center gap-1 py-[3px]" style={{ paddingLeft: `${8 + depth * 12 + 16}px` }}>
      <Icon size={13} className={cn('shrink-0', iconClass)} />
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel() }}
        className={cn(
          'flex-1 border rounded px-1.5 py-0.5 text-xs outline-none min-w-0',
          isDark
            ? 'bg-white/10 border-blue-500/60 text-white placeholder:text-white/40'
            : 'bg-white border-blue-500/70 text-black placeholder:text-black/40'
        )}
        placeholder="name..."
      />
    </div>
  )
}

function TreeNode({ fs, path, name, type, depth, activeFile, onSelect, onRename, onDelete, onCreateFile, onCreateDir, isDark }) {
  const [open, setOpen] = useState(depth === 0)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState(name)
  const [creating, setCreating] = useState(null) // 'file' | 'dir' | null
  const renameRef = useRef(null)

  useEffect(() => { if (renaming) renameRef.current?.focus() }, [renaming])

  const children = type === 'dir' ? listDir(fs, path) : []
  const isActive = activeFile === path

  const handleRenameSubmit = () => {
    if (renameVal.trim() && renameVal !== name) {
      const parent = path.substring(0, path.lastIndexOf('/')) || '/'
      onRename(path, parent === '/' ? '/' + renameVal.trim() : parent + '/' + renameVal.trim())
    }
    setRenaming(false)
  }

  const startCreate = (kind, e) => {
    e.stopPropagation()
    setOpen(true)
    setCreating(kind)
  }

  const commitCreate = (kind, entryName) => {
    const p = path === '/' ? '/' + entryName : path + '/' + entryName
    if (kind === 'file') onCreateFile(p)
    else onCreateDir(p)
    setCreating(null)
  }

  return (
    <div>
      {/* Row */}
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-[3px] rounded cursor-pointer select-none text-xs',
          'transition-colors',
          isDark ? 'hover:bg-white/5' : 'hover:bg-black/5',
          isActive && type === 'file' && (isDark ? 'bg-white/10 text-white' : 'bg-blue-500/10 text-blue-700'),
          !isActive && (isDark ? 'text-white/60' : 'text-black/70')
        )}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        onClick={() => { if (type === 'dir') setOpen(p => !p); else onSelect(path) }}
      >
        {type === 'dir' ? (
          <>
            {open ? <ChevronDown size={12} className={cn('shrink-0', isDark ? 'text-white/40' : 'text-black/40')} /> : <ChevronRight size={12} className={cn('shrink-0', isDark ? 'text-white/40' : 'text-black/40')} />}
            {open ? <FolderOpen size={13} className="shrink-0 text-blue-500" /> : <Folder size={13} className="shrink-0 text-blue-500" />}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileIcon name={name} isDark={isDark} />
          </>
        )}

        {renaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setRenaming(false) }}
            className={cn(
              'ml-1 flex-1 border rounded px-1 text-xs outline-none',
              isDark ? 'bg-white/10 border-white/20 text-white' : 'bg-white border-black/20 text-black'
            )}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="ml-1 flex-1 truncate">{name}</span>
        )}

        <div className="hidden group-hover:flex items-center gap-1 ml-auto shrink-0">
          {type === 'dir' && (
            <>
              <button onClick={e => startCreate('file', e)} title="New File"
                className={cn('p-0.5 rounded transition-colors',
                  isDark ? 'hover:bg-white/10 text-white/40 hover:text-white/80' : 'hover:bg-black/10 text-black/40 hover:text-black/70')}>
                <FilePlus size={11} />
              </button>
              <button onClick={e => startCreate('dir', e)} title="New Folder"
                className={cn('p-0.5 rounded transition-colors',
                  isDark ? 'hover:bg-white/10 text-white/40 hover:text-white/80' : 'hover:bg-black/10 text-black/40 hover:text-black/70')}>
                <FolderPlus size={11} />
              </button>
            </>
          )}
          {path !== '/' && (
            <>
              <button onClick={e => { e.stopPropagation(); setRenaming(true); setRenameVal(name) }} title="Rename"
                className={cn('p-0.5 rounded transition-colors',
                  isDark ? 'hover:bg-white/10 text-white/40 hover:text-white/80' : 'hover:bg-black/10 text-black/40 hover:text-black/70')}>
                <Pencil size={11} />
              </button>
              <button onClick={e => { e.stopPropagation(); onDelete(path) }} title="Delete"
                className="p-0.5 rounded hover:bg-red-500/10 text-red-400/60 hover:text-red-500 transition-colors">
                <Trash2 size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Children + inline input */}
      {type === 'dir' && open && (
        <>
          {creating && (
            <InlineInput
              icon={creating === 'file' ? File : Folder}
              iconClass={creating === 'file' ? (isDark ? 'text-white/50' : 'text-black/40') : 'text-blue-500'}
              depth={depth + 1}
              isDark={isDark}
              onCommit={n => commitCreate(creating, n)}
              onCancel={() => setCreating(null)}
            />
          )}
          {children.map(child => (
            <TreeNode key={child.path} fs={fs} path={child.path} name={child.name}
              type={child.type} depth={depth + 1} activeFile={activeFile}
              onSelect={onSelect} onRename={onRename} onDelete={onDelete}
              onCreateFile={onCreateFile} onCreateDir={onCreateDir} isDark={isDark} />
          ))}
        </>
      )}
    </div>
  )
}

export function FileExplorer({ fs, activeFile, onSelect, onRename, onDelete, onCreateFile, onCreateDir, isDark }) {
  const [rootCreating, setRootCreating] = useState(null) // 'file' | 'dir' | null

  const commitRoot = (kind, name) => {
    const p = '/' + name
    if (kind === 'file') onCreateFile(p)
    else onCreateDir(p)
    setRootCreating(null)
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', isDark ? 'bg-neutral-900/60' : 'bg-white/40')}>
      {/* Header */}
      <div className={cn('flex items-center justify-between px-3 py-2 shrink-0 border-b',
        isDark ? 'border-white/10' : 'border-black/10')}>
        <span className={cn('text-[10px] font-semibold uppercase tracking-widest',
          isDark ? 'text-white/30' : 'text-black/30')}>Explorer</span>
        <div className="flex gap-1">
          <button onClick={() => setRootCreating('file')} title="New File"
            className={cn('p-1 rounded hover:bg-white/10 transition-colors',
              isDark ? 'text-white/40 hover:text-white/80' : 'text-black/40 hover:text-black/80')}>
            <FilePlus size={13} />
          </button>
          <button onClick={() => setRootCreating('dir')} title="New Folder"
            className={cn('p-1 rounded hover:bg-white/10 transition-colors',
              isDark ? 'text-white/40 hover:text-white/80' : 'text-black/40 hover:text-black/80')}>
            <FolderPlus size={13} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {rootCreating && (
          <InlineInput
            icon={rootCreating === 'file' ? File : Folder}
            iconClass={rootCreating === 'file' ? (isDark ? 'text-white/50' : 'text-black/40') : 'text-blue-500'}
            depth={1}
            isDark={isDark}
            onCommit={n => commitRoot(rootCreating, n)}
            onCancel={() => setRootCreating(null)}
          />
        )}
        <TreeNode fs={fs} path="/" name="KRYON" type="dir" depth={0}
          activeFile={activeFile} onSelect={onSelect} onRename={onRename}
          onDelete={onDelete} onCreateFile={onCreateFile} onCreateDir={onCreateDir} isDark={isDark} />
      </div>
    </div>
  )
}
