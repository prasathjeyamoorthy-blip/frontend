import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', brightGreen: '\x1b[92m',
  blue: '\x1b[34m', brightBlue: '\x1b[94m',
  cyan: '\x1b[36m', brightCyan: '\x1b[96m',
  yellow: '\x1b[33m', brightYellow: '\x1b[93m',
  red: '\x1b[31m', brightRed: '\x1b[91m',
  magenta: '\x1b[35m', brightMagenta: '\x1b[95m',
  white: '\x1b[37m', brightWhite: '\x1b[97m',
  gray: '\x1b[90m',
}

const PROMPT = (cwd) =>
  `\r\n${C.bold}${C.brightGreen}kryon${C.reset}${C.gray}@${C.reset}${C.brightBlue}workspace${C.reset}${C.gray}:${C.reset}${C.brightCyan}${cwd}${C.reset}${C.gray} $${C.reset} `

function normPath(p) {
  const parts = p.split('/').filter(Boolean)
  const stack = []
  for (const part of parts) {
    if (part === '..') stack.pop()
    else if (part !== '.') stack.push(part)
  }
  return '/' + stack.join('/')
}

// JS executor — supports ES2022, async/await, top-level await via AsyncFunction
function execJS(code, write, onDone = () => {}) {
  const lines = []
  const push = (...a) => lines.push(
    a.map(x => x === null ? 'null' : x === undefined ? 'undefined'
      : typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x)).join(' ')
  )
  const fakeConsole = {
    log: push, info: push, debug: push,
    warn: (...a) => push('\x1b[33m[warn]\x1b[0m ' + a.join(' ')),
    error: (...a) => push('\x1b[91m[error]\x1b[0m ' + a.join(' ')),
    table: (v) => push(JSON.stringify(v, null, 2)),
    time: () => {}, timeEnd: () => {}, group: () => {}, groupEnd: () => {},
    assert: (c, ...a) => { if (!c) push('\x1b[91m[assert failed]\x1b[0m', ...a) },
  }
  const flush = () => {
    if (!lines.length) write(`${C.gray}(no output)${C.reset}`)
    else lines.forEach(l => write(l.replace(/\n/g, '\r\n') + '\r\n'))
    write(`\r\n${C.gray}Process exited with code ${C.brightGreen}0${C.reset}`)
    onDone()
  }
  const fail = (e) => {
    write(`${C.brightRed}${e.constructor?.name ?? 'Error'}: ${e.message}${C.reset}`)
    if (e.stack) e.stack.split('\n').slice(1, 4).forEach(f => write(`\r\n  ${C.gray}${f.trim()}${C.reset}`))
    write(`\r\n${C.gray}Process exited with code ${C.brightRed}1${C.reset}`)
    onDone()
  }
  try {
    const fn = new Function('console', 'process', `return (async()=>{\n${code}\n})()`)
    const result = fn(fakeConsole, { env: { NODE_ENV: 'development' }, argv: ['node'], exit: () => {} })
    if (result && typeof result.then === 'function') {
      result.then(flush).catch(fail)
    } else {
      flush()
    }
  } catch (e) {
    fail(e)
  }
}

// Python transpiler — indentation-aware, no infinite loops
function transpilePython(src) {
  const rawLines = src.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const out = []
  const indentStack = [0]

  const getIndent = (line) => line.match(/^(\s*)/)[1].length

  const closeBlocks = (target) => {
    while (indentStack.length > 1 && indentStack[indentStack.length - 1] > target) {
      indentStack.pop()
      out.push(' '.repeat(indentStack[indentStack.length - 1]) + '}')
    }
  }

  const transformExpr = (expr) => {
    let e = expr

    // f-strings first (before other replacements)
    e = e.replace(/f"([^"]*)"/g, (_, b) => '`' + b.replace(/\{([^}]+)\}/g, '${$1}') + '`')
    e = e.replace(/f'([^']*)'/g, (_, b) => '`' + b.replace(/\{([^}]+)\}/g, '${$1}') + '`')

    // any(expr for var in iterable) → iterable.some(var => expr)
    e = e.replace(/\bany\((.+?)\s+for\s+(\w+)\s+in\s+(.+?)\)/g, (_, ex, v, it) =>
      `(${it}).some(${v} => ${transformExpr(ex)})`)
    // all(expr for var in iterable) → iterable.every(var => expr)
    e = e.replace(/\ball\((.+?)\s+for\s+(\w+)\s+in\s+(.+?)\)/g, (_, ex, v, it) =>
      `(${it}).every(${v} => ${transformExpr(ex)})`)
    // [expr for var in iterable] → iterable.map(var => expr)
    e = e.replace(/\[(.+?)\s+for\s+(\w+)\s+in\s+(.+?)\]/g, (_, ex, v, it) =>
      `(${it}).map(${v} => ${transformExpr(ex)})`)
    // any(iterable) → iterable.some(x=>x)
    e = e.replace(/\bany\(([^)]+)\)/g, (_, it) => `(${it}).some(x=>x)`)
    // all(iterable) → iterable.every(x=>x)
    e = e.replace(/\ball\(([^)]+)\)/g, (_, it) => `(${it}).every(x=>x)`)

    // input(...) → prompt(...)  (browser prompt)
    e = e.replace(/\binput\(([^)]*)\)/g, (_, msg) => `(prompt(${msg}) ?? '')`)

    // String methods
    e = e.replace(/\.isdigit\(\)/g, '.match(/^\\d+$/) !== null')
    // fix isupper properly
    e = e.replace(/(\w+)\.isupper\(\)/g, (_, v) => `${v} === ${v}.toUpperCase() && ${v} !== ${v}.toLowerCase()`)
    e = e.replace(/(\w+)\.islower\(\)/g, (_, v) => `${v} === ${v}.toLowerCase() && ${v} !== ${v}.toUpperCase()`)
    e = e.replace(/(\w+)\.isalpha\(\)/g, (_, v) => `/^[a-zA-Z]+$/.test(${v})`)
    e = e.replace(/(\w+)\.isalnum\(\)/g, (_, v) => `/^[a-zA-Z0-9]+$/.test(${v})`)
    e = e.replace(/(\w+)\.isspace\(\)/g, (_, v) => `/^\\s+$/.test(${v})`)
    e = e.replace(/\.upper\(\)/g, '.toUpperCase()')
    e = e.replace(/\.lower\(\)/g, '.toLowerCase()')
    e = e.replace(/\.strip\(\)/g, '.trim()')
    e = e.replace(/\.lstrip\(\)/g, '.trimStart()')
    e = e.replace(/\.rstrip\(\)/g, '.trimEnd()')
    e = e.replace(/\.split\(([^)]*)\)/g, '.split($1)')
    e = e.replace(/\.join\(([^)]+)\)/g, '.join($1)')
    e = e.replace(/\.replace\(([^)]+)\)/g, '.replace($1)')
    e = e.replace(/\.startswith\(([^)]+)\)/g, '.startsWith($1)')
    e = e.replace(/\.endswith\(([^)]+)\)/g, '.endsWith($1)')
    e = e.replace(/\.find\(([^)]+)\)/g, '.indexOf($1)')
    e = e.replace(/\.count\(([^)]+)\)/g, (_, a) => `.split(${a}).length - 1`)
    e = e.replace(/\.append\(([^)]+)\)/g, '.push($1)')
    e = e.replace(/\.extend\(([^)]+)\)/g, '.push(...$1)')
    e = e.replace(/\.pop\(\)/g, '.pop()')
    e = e.replace(/\.sort\(\)/g, '.sort()')
    e = e.replace(/\.reverse\(\)/g, '.reverse()')
    e = e.replace(/\.keys\(\)/g, '.keys()')
    e = e.replace(/\.values\(\)/g, '.values()')
    e = e.replace(/\.items\(\)/g, '.entries()')

    // char in "string" → "string".includes(char)
    e = e.replace(/(\w+)\s+in\s+"([^"]*)"/g, (_, v, s) => `"${s}".includes(${v})`)
    e = e.replace(/(\w+)\s+in\s+'([^']*)'/g, (_, v, s) => `'${s}'.includes(${v})`)
    // x in list → list.includes(x)
    e = e.replace(/(\w+)\s+in\s+(\w+)/g, (_, v, arr) => `${arr}.includes(${v})`)
    // x not in list
    e = e.replace(/(\w+)\s+not\s+in\s+(\w+)/g, (_, v, arr) => `!${arr}.includes(${v})`)

    // builtins
    e = e.replace(/\blen\(([^)]+)\)/g, '($1).length')
    e = e.replace(/\bstr\(([^)]+)\)/g, 'String($1)')
    e = e.replace(/\bint\(([^)]+)\)/g, 'parseInt($1)')
    e = e.replace(/\bfloat\(([^)]+)\)/g, 'parseFloat($1)')
    e = e.replace(/\babs\(([^)]+)\)/g, 'Math.abs($1)')
    e = e.replace(/\bround\(([^)]+)\)/g, 'Math.round($1)')
    e = e.replace(/\bmin\(([^)]+)\)/g, 'Math.min($1)')
    e = e.replace(/\bmax\(([^)]+)\)/g, 'Math.max($1)')
    e = e.replace(/\bsum\(([^)]+)\)/g, '($1).reduce((a,b)=>a+b,0)')
    e = e.replace(/\bsorted\(([^)]+)\)/g, '[...($1)].sort()')
    e = e.replace(/\breversed\(([^)]+)\)/g, '[...($1)].reverse()')
    e = e.replace(/\blist\(([^)]+)\)/g, 'Array.from($1)')
    e = e.replace(/\bdict\(([^)]*)\)/g, 'Object.fromEntries($1)')
    e = e.replace(/\bset\(([^)]+)\)/g, 'new Set($1)')
    e = e.replace(/\btuple\(([^)]+)\)/g, 'Array.from($1)')
    e = e.replace(/\bprint\(([^)]*)\)/g, 'console.log($1)')
    e = e.replace(/\btype\(([^)]+)\)/g, 'typeof $1')
    e = e.replace(/\bisinstance\(([^,]+),\s*\w+\)/g, (_, v) => `(typeof ${v})`)
    e = e.replace(/\brange\(([^)]+)\)/g, (_, args) => {
      const p = args.split(',').map(x => x.trim())
      if (p.length === 1) return `[...Array(${p[0]}).keys()]`
      if (p.length === 2) return `[...Array(${p[1]}-${p[0]}).keys()].map(i=>i+${p[0]})`
      return `[...Array(Math.ceil((${p[1]}-${p[0]})/Math.abs(${p[2]}))).keys()].map(i=>${p[0]}+i*${p[2]})`
    })

    // keywords
    e = e.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')
    e = e.replace(/\band\b/g, '&&').replace(/\bor\b/g, '||')
    e = e.replace(/\bnot\s+/g, '!')
    e = e.replace(/\*\*/g, '**')

    return e
  }

  // Returns [jsLine, opensBlock]
  // opensBlock=true means this line ends with { and we should push next indent
  const transformLine = (line) => {
    const ind = ' '.repeat(getIndent(line))
    const s = line.trim()
    if (!s) return ['', false]
    if (s.startsWith('#')) return [ind + '//' + s.slice(1), false]

    // elif / else
    if (/^elif[\s(]/.test(s) && s.endsWith(':')) {
      const cond = s.replace(/^elif\s*/, '').slice(0, -1)
      return [`${ind}} else if (${transformExpr(cond)}) {`, true]
    }
    if (/^else\s*:$/.test(s)) return [`${ind}} else {`, true]

    if (/^if[\s(]/.test(s) && s.endsWith(':')) {
      const cond = s.replace(/^if\s*/, '').slice(0, -1)
      return [`${ind}if (${transformExpr(cond)}) {`, true]
    }
    if (/^while[\s(]/.test(s) && s.endsWith(':')) {
      const cond = s.replace(/^while\s*/, '').slice(0, -1)
      return [`${ind}while (${transformExpr(cond)}) {`, true]
    }

    if (/^for\s+(\w+)\s+in\s+range\((.+)\):$/.test(s)) {
      const [, v, rArgs] = s.match(/^for\s+(\w+)\s+in\s+range\((.+)\):$/)
      const p = rArgs.split(',').map(x => x.trim())
      const [start, end, step] = p.length === 1 ? ['0', p[0], '1'] : p.length === 2 ? [p[0], p[1], '1'] : p
      return [`${ind}for (let ${v} = ${start}; ${v} < ${end}; ${v} += ${step}) {`, true]
    }
    if (/^for\s+(\w+)\s+in\s+(.+):$/.test(s)) {
      const [, v, it] = s.match(/^for\s+(\w+)\s+in\s+(.+):$/)
      return [`${ind}for (const ${v} of ${transformExpr(it)}) {`, true]
    }
    if (/^def\s+(\w+)\s*\((.*)\)\s*:$/.test(s)) {
      const [, fn, params] = s.match(/^def\s+(\w+)\s*\((.*)\)\s*:$/)
      return [`${ind}function ${fn}(${params}) {`, true]
    }
    if (/^class\s+(\w+).*:$/.test(s))
      return [`${ind}class ${s.match(/^class\s+(\w+)/)[1]} {`, true]

    if (/^return(\s.*)?$/.test(s)) {
      const val = s.slice(6).trim()
      return [`${ind}return ${val ? transformExpr(val) : ''};`, false]
    }
    if (/^print\s*\(/.test(s)) {
      const inner = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'))
      return [`${ind}console.log(${transformExpr(inner)});`, false]
    }
    // try:
    if (/^try\s*:$/.test(s)) return [`${ind}try {`, true]
    // except ...:
    if (/^except(\s+\w+(\s+as\s+\w+)?)?\s*:$/.test(s)) {
      const asMatch = s.match(/except\s+\w+\s+as\s+(\w+)/)
      const eVar = asMatch ? asMatch[1] : 'e'
      return [`${ind}} catch(${eVar}) {`, true]
    }
    // finally:
    if (/^finally\s*:$/.test(s)) return [`${ind}} finally {`, true]
    // raise
    if (/^raise\s+/.test(s)) {
      const msg = s.slice(6).trim()
      return [`${ind}throw new Error(${transformExpr(msg)});`, false]
    }
    if (/^(\w+)\s*([+\-*/%]?=)\s*(.+)$/.test(s)) {
      const [, varName, op, val] = s.match(/^(\w+)\s*([+\-*/%]?=)\s*(.+)$/)
      const decl = op === '=' ? 'let ' : ''
      return [`${ind}${decl}${varName} ${op} ${transformExpr(val)};`, false]
    }
    return [`${ind}${transformExpr(s)};`, false]
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (!line.trim()) { out.push(''); continue }

    const indent = getIndent(line)
    const s = line.trim()

    // elif/else: close the if/elif body block, emit its closing brace,
    // then transformLine will prepend `}` again as part of `} else {`
    // So we only pop the stack — the `}` is embedded in the transformed line itself.
    // BUT we must close any deeper nested blocks first.
    if (/^(elif[\s(].+|else\s*|except(\s+\w+(\s+as\s+\w+)?)?\s*|finally\s*):$/.test(s)) {
      // Close any blocks deeper than the if-body level
      // The if-body indent is indentStack[last]; we want to close back to it, not past it
      // Then pop it so transformLine's `} else {` replaces it
      if (indentStack.length > 1) {
        // close blocks nested inside the if body (deeper indents)
        const ifBodyIndent = indentStack[indentStack.length - 1]
        // nothing to close since we're already at the body level
        // just pop the body level — the `}` is part of `} else {`
        indentStack.pop()
      }
    } else {
      closeBlocks(indent)
    }

    const [transformed, opensBlock] = transformLine(line)
    out.push(transformed)

    if (opensBlock) {
      let j = i + 1
      while (j < rawLines.length && !rawLines[j].trim()) j++
      const nextIndent = j < rawLines.length ? getIndent(rawLines[j]) : indent + 2
      indentStack.push(nextIndent)
    }
  }

  closeBlocks(0)
  return out.join('\n')
}

// ─── Pyodide singleton ────────────────────────────────────────────────────────
let _pyodide = null
let _pyodideLoading = false
let _pyodideQueue = []

// Packages bundled inside Pyodide — loadPackage() instead of micropip
const PYODIDE_BUNDLED = new Set([
  'numpy','pandas','scipy','matplotlib','scikit-learn','sklearn',
  'pillow','PIL','cryptography','lxml','pytz','six','attrs',
  'pydantic','regex','requests','beautifulsoup4','bs4',
  'sympy','networkx','statsmodels','xarray','h5py',
  'openpyxl','xlrd','pyarrow','sqlalchemy',
])

// Pyodide package name overrides (import name → pyodide package name)
const PKG_ALIAS = {
  sklearn: 'scikit-learn', PIL: 'pillow', bs4: 'beautifulsoup4',
  cv2: 'opencv-python', skimage: 'scikit-image',
}

// Python stdlib — never try to install these
const STDLIB = new Set([
  'os','sys','re','math','json','time','datetime','random','collections',
  'itertools','functools','string','io','pathlib','typing','abc','copy',
  'enum','dataclasses','contextlib','traceback','warnings','logging',
  'unittest','hashlib','base64','struct','array','heapq','bisect','queue',
  'threading','multiprocessing','subprocess','socket','http','urllib',
  'email','html','xml','csv','sqlite3','pickle','shelve','gzip','zipfile',
  'tarfile','shutil','glob','fnmatch','tempfile','stat','platform','signal',
  'gc','weakref','inspect','ast','dis','tokenize','keyword','builtins',
  '__future__','textwrap','pprint','decimal','fractions','numbers',
  'cmath','statistics','operator','types','typing_extensions',
])

async function getPyodide(onStatus) {
  if (_pyodide) return _pyodide
  if (_pyodideLoading) return new Promise((res, rej) => _pyodideQueue.push({ res, rej }))
  _pyodideLoading = true
  onStatus?.('Initializing Python 3.11 runtime (Pyodide)...')
  try {
    _pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/',
    })
    // Load micropip for installing packages from PyPI
    await _pyodide.loadPackage(['micropip'])
    // Set up persistent stdout/stderr redirect + input() override
    await _pyodide.runPythonAsync(`
import sys, builtins

class _KryonStream:
    def write(self, s):
        if s:
            import js
            js.globalThis.__kryon_out__(s)
    def flush(self):
        pass
    def isatty(self):
        return False
    def readable(self):
        return False

_kryon_stream = _KryonStream()
sys.stdout = _kryon_stream
sys.stderr = _kryon_stream

async def input(prompt=''):
    import js
    if prompt:
        js.globalThis.__kryon_out__(str(prompt))
    result = await js.globalThis.__kryon_input__(str(prompt) if prompt else '')
    if result is None:
        return ''
    return str(result)

builtins.input = input
`)
    _pyodideLoading = false
    _pyodideQueue.forEach(q => q.res(_pyodide))
    _pyodideQueue = []
    return _pyodide
  } catch (e) {
    _pyodideLoading = false
    _pyodideQueue.forEach(q => q.rej(e))
    _pyodideQueue = []
    throw e
  }
}

// Extract all top-level imports from Python source
function extractImports(src) {
  const pkgs = new Set()
  for (const line of src.split('\n')) {
    const m1 = line.match(/^\s*import\s+([\w\s,]+)/)
    const m2 = line.match(/^\s*from\s+(\w+)/)
    if (m1) m1[1].split(',').forEach(p => pkgs.add(p.trim().split(/\s+/)[0]))
    if (m2) pkgs.add(m2[1].trim())
  }
  return [...pkgs].filter(p => p && !STDLIB.has(p))
}

async function installPackages(pyodide, imports, write) {
  if (!imports.length) return
  const bundled = imports.filter(p => PYODIDE_BUNDLED.has(p) || PYODIDE_BUNDLED.has(PKG_ALIAS[p]))
  const pypi = imports.filter(p => !PYODIDE_BUNDLED.has(p) && !PYODIDE_BUNDLED.has(PKG_ALIAS[p]))

  if (bundled.length) {
    write(`${C.gray}Loading: ${bundled.join(', ')}...${C.reset}\r\n`)
    const pkgNames = bundled.map(p => PKG_ALIAS[p] || p)
    try { await pyodide.loadPackage(pkgNames) } catch (e) {
      write(`${C.yellow}Warning loading bundled packages: ${e.message}${C.reset}\r\n`)
    }
  }
  if (pypi.length) {
    write(`${C.gray}Installing from PyPI: ${pypi.join(', ')}...${C.reset}\r\n`)
    try {
      const micropip = pyodide.pyimport('micropip')
      for (const pkg of pypi) {
        try {
          await micropip.install(PKG_ALIAS[pkg] || pkg)
        } catch {
          write(`${C.yellow}Warning: could not install ${pkg}${C.reset}\r\n`)
        }
      }
    } catch (e) {
      write(`${C.yellow}micropip unavailable: ${e.message}${C.reset}\r\n`)
    }
  }
}

// Transforms Python source so all input() calls are awaited
// Replaces input(...) → (await input(...)) with correct paren balancing
function patchInputCalls(src) {
  const lines = src.split('\n')
  return lines.map(line => {
    if (line.trimStart().startsWith('#')) return line
    // Find each `input(` occurrence and wrap the whole call: input(...) → (await input(...))
    let result = ''
    let i = 0
    while (i < line.length) {
      // Check for `input(`
      const match = line.slice(i).match(/^(\binput\s*\()/)
      if (match) {
        // Find the matching closing paren
        const start = i + match[1].length // position after the opening (
        let depth = 1
        let j = start
        while (j < line.length && depth > 0) {
          if (line[j] === '(') depth++
          else if (line[j] === ')') depth--
          j++
        }
        // j is now after the closing )
        const inner = line.slice(start, j - 1) // content inside input(...)
        result += `(await input(${inner}))`
        i = j
      } else {
        result += line[i]
        i++
      }
    }
    return result
  }).join('\n')
}

// Main Python executor — uses real CPython via Pyodide/WASM
async function execPythonAsync(code, write, onDone, readLine) {
  const outBuf = []
  window.__kryon_out__ = (s) => outBuf.push(s)

  // Async input bridge — flushes buffered output then reads from terminal
  window.__kryon_input__ = async (promptText) => {
    if (outBuf.length) {
      outBuf.forEach(s => write(s.replace(/\n/g, '\r\n')))
      outBuf.length = 0
    }
    return await readLine()
  }

  let pyodide
  try {
    pyodide = await getPyodide((msg) => write(`${C.gray}${msg}${C.reset}\r\n`))
  } catch (e) {
    write(`${C.brightRed}Failed to load Python runtime: ${e.message}${C.reset}\r\n`)
    write(`${C.gray}Process exited with code ${C.brightRed}1${C.reset}`)
    delete window.__kryon_out__
    onDone(); return
  }

  // Install any imported packages
  const imports = extractImports(code)
  await installPackages(pyodide, imports, write)

  // Flush any loader output before running user code
  if (outBuf.length) { outBuf.forEach(s => write(s.replace(/\n/g, '\r\n'))); outBuf.length = 0 }

  try {
    await pyodide.runPythonAsync(patchInputCalls(code))
    // Flush captured output
    if (outBuf.length) {
      const full = outBuf.join('')
      if (full.trim()) {
        full.split('\n').forEach((l, i, a) => write(l + (i < a.length - 1 ? '\r\n' : '')))
      } else {
        write(`${C.gray}(no output)${C.reset}`)
      }
    } else {
      write(`${C.gray}(no output)${C.reset}`)
    }
    write(`\r\n${C.gray}Process exited with code ${C.brightGreen}0${C.reset}`)
  } catch (e) {
    // Flush any partial output first
    if (outBuf.length) outBuf.forEach(s => write(s.replace(/\n/g, '\r\n')))
    const msg = String(e.message || e)
    // Strip Pyodide internal frames, keep the useful Python traceback
    const cleaned = msg.split('\n').filter(l =>
      !l.includes('pyodide.asm') && !l.includes('at eval') && !l.includes('at async')
    )
    cleaned.forEach(l => write(`${C.brightRed}${l}${C.reset}\r\n`))
    write(`${C.gray}Process exited with code ${C.brightRed}1${C.reset}`)
  } finally {
    delete window.__kryon_out__
    delete window.__kryon_input__
    onDone()
  }
}

function execPython(code, write, onDone = () => {}, readLine) {
  execPythonAsync(code, write, onDone, readLine)
}

// Main component
export const TerminalPanel = forwardRef(function TerminalPanel({ isDark, fs, onFsChange, onOpenFile }, ref) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitRef = useRef(null)
  // When non-null, a Python input() call is waiting: { resolve, buffer }
  const inputReaderRef = useRef(null)
  const stateRef = useRef({
    input: '', history: [], histIdx: -1, cwd: '/', fs,
    env: { NODE_ENV: 'development', KRYON_VERSION: '1.0.0', SHELL: '/bin/kryon', HOME: '/', USER: 'kryon-user' },
    aliases: {},
  })

  useEffect(() => { stateRef.current.fs = fs }, [fs])

  // Returns a Promise that resolves with the line the user types in the terminal
  const readLine = useCallback(() => {
    return new Promise((resolve) => {
      inputReaderRef.current = { resolve, buffer: '' }
    })
  }, [])

  useImperativeHandle(ref, () => ({
    runFile(path, content, ext) {
      const term = termRef.current
      if (!term) return
      const w = (s) => term.write(s)
      const prompt = () => w(PROMPT(stateRef.current.cwd))
      w(`\r\n${C.bold}${C.brightCyan}> Running ${path}${C.reset}\r\n`)
      if (ext === 'js' || ext === 'jsx' || ext === 'mjs') {
        execJS(content, w, prompt)
      } else if (ext === 'py') {
        execPython(content, w, prompt, readLine)
      } else {
        w(`${C.yellow}No runner for .${ext} files${C.reset}`)
        prompt()
      }
    }
  }))

  const resolvePath = useCallback((cwd, target) => {
    if (!target || target === '~') return '/'
    if (target.startsWith('/')) return normPath(target)
    return normPath(cwd === '/' ? '/' + target : cwd + '/' + target)
  }, [])

  const runCommand = useCallback((term, raw) => {
    const state = stateRef.current
    const w = (s) => term.write(s)

    // Redirection: echo foo > file  or  echo foo >> file
    const appendMatch = raw.match(/^(.+?)\s*>>\s*(.+)$/)
    const redirectMatch = !appendMatch && raw.match(/^(.+?)\s*>\s*(.+)$/)
    if (appendMatch || redirectMatch) {
      const [, left, target] = appendMatch || redirectMatch
      const p = resolvePath(state.cwd, target.trim())
      const output = left.trim().startsWith('echo ') ? left.trim().slice(5) : left.trim()
      const existing = state.fs[p]?.content ?? ''
      const newContent = appendMatch ? existing + output + '\n' : output + '\n'
      const newFs = { ...state.fs, [p]: { type: 'file', content: newContent } }
      state.fs = newFs; onFsChange(newFs)
      w(`\r\n${C.gray}Written to ${p}${C.reset}`)
      w(PROMPT(state.cwd)); return
    }

    const trimmed = raw.trim()
    if (!trimmed) { w(PROMPT(state.cwd)); return }
    state.history.unshift(trimmed); state.histIdx = -1

    const parts = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
    const cmd = parts[0]
    const args = parts.slice(1).map(a => a.replace(/^["']|["']$/g, ''))
    const flag = (f) => args.includes(f)
    const nonFlags = args.filter(a => !a.startsWith('-'))

    switch (cmd) {
      case 'help': {
        w(`\r\n${C.bold}${C.brightCyan}KRYON Terminal v2.0${C.reset} -- available commands:\r\n\r\n`)
        const groups = [
          ['File System', [
            ['ls [-la] [path]',     'List directory contents'],
            ['cd <path>',           'Change directory'],
            ['pwd',                 'Print working directory'],
            ['cat [-n] <file>',     'Print file contents'],
            ['head [-n N] <file>',  'First N lines'],
            ['tail [-n N] <file>',  'Last N lines'],
            ['touch <file>',        'Create empty file'],
            ['mkdir <dir>',         'Create directory'],
            ['rm [-r] <path>',      'Remove file or directory'],
            ['mv <src> <dst>',      'Move / rename'],
            ['cp [-r] <src> <dst>', 'Copy file or directory'],
            ['find [path] -name P', 'Find files by name'],
            ['grep [-i] <p> <f>',   'Search pattern in file'],
            ['wc [-l|-w|-c] <f>',   'Word/line/char count'],
            ['stat <path>',         'File info'],
            ['tree [path]',         'Directory tree'],
            ['write <file> <text>', 'Write text to file'],
          ]],
          ['Execution', [
            ['run <file>',   'Run JS or Python file'],
            ['node <file>',  'Run JS file'],
            ['python <file>','Run Python file'],
            ['eval <expr>',  'Evaluate JS expression'],
          ]],
          ['Shell', [
            ['echo <text>',   'Print text (supports > / >>)'],
            ['export K=V',    'Set env variable'],
            ['unset <key>',   'Remove env variable'],
            ['env',           'Show env variables'],
            ['alias k=v',     'Create alias'],
            ['history',       'Show command history'],
            ['clear',         'Clear terminal'],
            ['date',          'Show date/time'],
            ['whoami',        'Show current user'],
            ['open <file>',   'Open file in editor'],
          ]],
        ]
        groups.forEach(([group, cmds]) => {
          w(`  ${C.bold}${C.brightYellow}${group}${C.reset}\r\n`)
          cmds.forEach(([c, d]) => w(`    ${C.cyan}${c.padEnd(22)}${C.reset}${C.gray}${d}${C.reset}\r\n`))
          w('\r\n')
        })
        break
      }

      case 'pwd': w(`\r\n${state.cwd}`); break
      case 'date': w(`\r\n${new Date().toString()}`); break
      case 'whoami': w(`\r\n${C.brightGreen}kryon-user${C.reset}`); break
      case 'clear': term.clear(); w(PROMPT(state.cwd)); return

      case 'env':
        Object.entries(state.env).forEach(([k, v]) => w(`\r\n${C.cyan}${k}${C.reset}=${C.brightWhite}${v}${C.reset}`))
        break
      case 'export': {
        const eq = trimmed.slice(7).trim(); const idx = eq.indexOf('=')
        if (idx < 0) { w(`\r\n${C.red}export: invalid syntax${C.reset}`); break }
        state.env[eq.slice(0, idx)] = eq.slice(idx + 1); break
      }
      case 'unset': delete state.env[args[0]]; break

      case 'alias': {
        const eq = trimmed.slice(6).trim(); const idx = eq.indexOf('=')
        if (idx < 0) {
          Object.entries(state.aliases).forEach(([k, v]) => w(`\r\nalias ${C.cyan}${k}${C.reset}='${v}'`))
        } else {
          state.aliases[eq.slice(0, idx)] = eq.slice(idx + 1).replace(/^['"]|['"]$/g, '')
        }
        break
      }
      case 'unalias': delete state.aliases[args[0]]; break
      case 'which': w(`\r\n${C.gray}/bin/kryon/${args[0] || ''}${C.reset}`); break

      case 'history':
        state.history.slice(0, 50).forEach((h, i) =>
          w(`\r\n  ${C.gray}${String(i + 1).padStart(4)}${C.reset}  ${h}`))
        break

      case 'ls': {
        const long = flag('-l') || flag('-la') || flag('-al')
        const target = nonFlags[0] ? resolvePath(state.cwd, nonFlags[0]) : state.cwd
        if (!state.fs[target] || state.fs[target].type !== 'dir') {
          w(`\r\n${C.red}ls: ${target}: No such directory${C.reset}`); break
        }
        const entries = Object.entries(state.fs)
          .filter(([p]) => { const par = p.substring(0, p.lastIndexOf('/')) || '/'; return par === target && p !== target })
          .map(([p, v]) => ({ name: p.split('/').pop(), type: v.type, size: v.content?.length ?? 0 }))
          .sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name))
        if (!entries.length) { w(`\r\n${C.gray}(empty)${C.reset}`); break }
        w('\r\n')
        if (long) {
          entries.forEach(e => {
            const perm = e.type === 'dir' ? `${C.brightBlue}drwxr-xr-x${C.reset}` : `-rw-r--r--`
            const name = e.type === 'dir' ? `${C.bold}${C.brightBlue}${e.name}/${C.reset}` : `${C.white}${e.name}${C.reset}`
            w(`${perm}  kryon  ${C.gray}${String(e.size).padStart(6)}${C.reset}  ${name}\r\n`)
          })
        } else {
          entries.forEach(e => e.type === 'dir'
            ? w(`${C.bold}${C.brightBlue}${e.name}/${C.reset}  `)
            : w(`${C.white}${e.name}${C.reset}  `))
        }
        break
      }

      case 'cd': {
        const target = args[0] ? resolvePath(state.cwd, args[0]) : '/'
        if (!state.fs[target] || state.fs[target].type !== 'dir')
          w(`\r\n${C.red}cd: ${target}: No such directory${C.reset}`)
        else state.cwd = target
        break
      }

      case 'cat': {
        if (!args[0]) { w(`\r\n${C.red}cat: missing operand${C.reset}`); break }
        const p = resolvePath(state.cwd, nonFlags[0] || args[0])
        const entry = state.fs[p]
        if (!entry) { w(`\r\n${C.red}cat: ${p}: No such file${C.reset}`); break }
        if (entry.type === 'dir') { w(`\r\n${C.red}cat: ${p}: Is a directory${C.reset}`); break }
        w('\r\n')
        entry.content.split('\n').forEach((line, i) =>
          w(`${flag('-n') ? `${C.gray}${String(i + 1).padStart(4)}  ${C.reset}` : ''}${line}\r\n`))
        break
      }

      case 'head':
      case 'tail': {
        const nIdx = args.indexOf('-n'); const n = nIdx >= 0 ? parseInt(args[nIdx + 1]) || 10 : 10
        const file = nonFlags[0]
        if (!file) { w(`\r\n${C.red}${cmd}: missing file${C.reset}`); break }
        const p = resolvePath(state.cwd, file); const entry = state.fs[p]
        if (!entry || entry.type === 'dir') { w(`\r\n${C.red}${cmd}: ${p}: No such file${C.reset}`); break }
        const lines = entry.content.split('\n')
        const slice = cmd === 'head' ? lines.slice(0, n) : lines.slice(-n)
        w('\r\n'); slice.forEach(l => w(l + '\r\n'))
        break
      }

      case 'wc': {
        const file = nonFlags[0]
        if (!file) { w(`\r\n${C.red}wc: missing file${C.reset}`); break }
        const p = resolvePath(state.cwd, file); const entry = state.fs[p]
        if (!entry || entry.type === 'dir') { w(`\r\n${C.red}wc: ${p}: No such file${C.reset}`); break }
        const c = entry.content
        const lc = c.split('\n').length, wc2 = c.trim().split(/\s+/).filter(Boolean).length, cc = c.length
        if (flag('-l')) w(`\r\n${lc} ${C.gray}${p}${C.reset}`)
        else if (flag('-w')) w(`\r\n${wc2} ${C.gray}${p}${C.reset}`)
        else if (flag('-c')) w(`\r\n${cc} ${C.gray}${p}${C.reset}`)
        else w(`\r\n${lc} ${wc2} ${cc} ${C.gray}${p}${C.reset}`)
        break
      }

      case 'grep': {
        if (args.length < 2) { w(`\r\n${C.red}grep: usage: grep <pattern> <file>${C.reset}`); break }
        const pat = nonFlags[0], file = nonFlags[1]
        const p = resolvePath(state.cwd, file); const entry = state.fs[p]
        if (!entry || entry.type === 'dir') { w(`\r\n${C.red}grep: ${p}: No such file${C.reset}`); break }
        const re = new RegExp(pat, flag('-i') ? 'gi' : 'g')
        let found = 0
        entry.content.split('\n').forEach((line, i) => {
          if (re.test(line)) {
            found++
            const hl = line.replace(new RegExp(pat, flag('-i') ? 'gi' : 'g'), m => `${C.brightRed}${m}${C.reset}`)
            w(`\r\n${C.gray}${String(i + 1).padStart(4)}:${C.reset} ${hl}`)
          }
        })
        if (!found) w(`\r\n${C.gray}(no matches)${C.reset}`)
        break
      }

      case 'find': {
        const nameIdx = args.indexOf('-name')
        const pattern = nameIdx >= 0 ? args[nameIdx + 1] : null
        const base = nonFlags[0] ? resolvePath(state.cwd, nonFlags[0]) : state.cwd
        const re = pattern ? new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null
        const results = Object.keys(state.fs).filter(p => {
          if (!p.startsWith(base === '/' ? '/' : base + '/') && p !== base) return false
          return re ? re.test(p.split('/').pop()) : true
        })
        if (!results.length) w(`\r\n${C.gray}(no results)${C.reset}`)
        else results.forEach(r => w(`\r\n${state.fs[r].type === 'dir' ? C.brightBlue : C.white}${r}${C.reset}`))
        break
      }

      case 'stat': {
        if (!args[0]) { w(`\r\n${C.red}stat: missing operand${C.reset}`); break }
        const p = resolvePath(state.cwd, args[0]); const entry = state.fs[p]
        if (!entry) { w(`\r\n${C.red}stat: ${p}: No such file${C.reset}`); break }
        w(`\r\n${C.bold}${p}${C.reset}`)
        w(`\r\n  Type:  ${entry.type === 'dir' ? C.brightBlue + 'directory' : C.white + 'file'}${C.reset}`)
        if (entry.type === 'file') {
          w(`\r\n  Size:  ${entry.content.length} bytes`)
          w(`\r\n  Lines: ${entry.content.split('\n').length}`)
        }
        break
      }

      case 'tree': {
        const base = nonFlags[0] ? resolvePath(state.cwd, nonFlags[0]) : state.cwd
        const printTree = (dir, prefix) => {
          const children = Object.entries(state.fs)
            .filter(([p]) => { const par = p.substring(0, p.lastIndexOf('/')) || '/'; return par === dir })
            .sort(([, a], [, b]) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : 0)
          children.forEach(([p, v], i) => {
            const name = p.split('/').pop()
            const isLast = i === children.length - 1
            const colored = v.type === 'dir' ? `${C.brightBlue}${name}/${C.reset}` : `${C.white}${name}${C.reset}`
            w(`\r\n${prefix}${isLast ? '`-- ' : '|-- '}${colored}`)
            if (v.type === 'dir') printTree(p, prefix + (isLast ? '    ' : '|   '))
          })
        }
        w(`\r\n${C.brightBlue}${base}${C.reset}`)
        printTree(base, '')
        break
      }

      case 'touch': {
        if (!args[0]) { w(`\r\n${C.red}touch: missing operand${C.reset}`); break }
        const p = resolvePath(state.cwd, args[0])
        if (!state.fs[p]) {
          const newFs = { ...state.fs, [p]: { type: 'file', content: '' } }
          state.fs = newFs; onFsChange(newFs)
        }
        break
      }

      case 'mkdir': {
        if (!nonFlags[0]) { w(`\r\n${C.red}mkdir: missing operand${C.reset}`); break }
        const p = resolvePath(state.cwd, nonFlags[0])
        if (state.fs[p]) { w(`\r\n${C.red}mkdir: ${p}: Already exists${C.reset}`); break }
        const newFs = { ...state.fs, [p]: { type: 'dir' } }
        state.fs = newFs; onFsChange(newFs)
        w(`\r\n${C.gray}Created ${p}${C.reset}`)
        break
      }

      case 'rm': {
        if (!nonFlags[0]) { w(`\r\n${C.red}rm: missing operand${C.reset}`); break }
        const p = resolvePath(state.cwd, nonFlags[0])
        if (!state.fs[p]) { w(`\r\n${C.red}rm: ${p}: No such file${C.reset}`); break }
        const newFs = { ...state.fs }
        Object.keys(newFs).forEach(k => { if (k === p || k.startsWith(p + '/')) delete newFs[k] })
        state.fs = newFs; onFsChange(newFs)
        w(`\r\n${C.gray}Removed ${p}${C.reset}`)
        break
      }

      case 'mv': {
        if (nonFlags.length < 2) { w(`\r\n${C.red}mv: missing operand${C.reset}`); break }
        const src = resolvePath(state.cwd, nonFlags[0]), dst = resolvePath(state.cwd, nonFlags[1])
        if (!state.fs[src]) { w(`\r\n${C.red}mv: ${src}: No such file${C.reset}`); break }
        const newFs = {}
        Object.entries(state.fs).forEach(([k, v]) => {
          if (k === src) newFs[dst] = v
          else if (k.startsWith(src + '/')) newFs[dst + k.slice(src.length)] = v
          else newFs[k] = v
        })
        state.fs = newFs; onFsChange(newFs)
        w(`\r\n${C.gray}Moved ${src} -> ${dst}${C.reset}`)
        break
      }

      case 'cp': {
        if (nonFlags.length < 2) { w(`\r\n${C.red}cp: missing operand${C.reset}`); break }
        const src = resolvePath(state.cwd, nonFlags[0]), dst = resolvePath(state.cwd, nonFlags[1])
        if (!state.fs[src]) { w(`\r\n${C.red}cp: ${src}: No such file${C.reset}`); break }
        const newFs = { ...state.fs }
        if (flag('-r') && state.fs[src].type === 'dir') {
          Object.entries(state.fs).filter(([k]) => k === src || k.startsWith(src + '/')).forEach(([k, v]) => {
            newFs[dst + k.slice(src.length)] = { ...v }
          })
        } else { newFs[dst] = { ...state.fs[src] } }
        state.fs = newFs; onFsChange(newFs)
        w(`\r\n${C.gray}Copied ${src} -> ${dst}${C.reset}`)
        break
      }

      case 'write': {
        if (nonFlags.length < 2) { w(`\r\n${C.red}write: usage: write <file> <content>${C.reset}`); break }
        const p = resolvePath(state.cwd, nonFlags[0])
        const content = args.slice(args.indexOf(nonFlags[1])).join(' ')
        const newFs = { ...state.fs, [p]: { type: 'file', content } }
        state.fs = newFs; onFsChange(newFs)
        w(`\r\n${C.gray}Written to ${p}${C.reset}`)
        break
      }

      case 'echo': w('\r\n' + args.join(' ')); break

      case 'open': {
        if (!args[0]) { w(`\r\n${C.red}open: missing operand${C.reset}`); break }
        const p = resolvePath(state.cwd, args[0])
        if (!state.fs[p]) { w(`\r\n${C.red}open: ${p}: No such file${C.reset}`); break }
        if (state.fs[p].type === 'dir') { w(`\r\n${C.red}open: ${p}: Is a directory${C.reset}`); break }
        onOpenFile(p)
        w(`\r\n${C.gray}Opened ${p} in editor${C.reset}`)
        break
      }

      case 'run':
      case 'node':
      case 'python':
      case 'python3': {
        if (!args[0]) { w(`\r\n${C.red}${cmd}: missing file${C.reset}`); break }
        const p = resolvePath(state.cwd, args[0])
        if (!state.fs[p]) { w(`\r\n${C.red}${cmd}: ${p}: No such file${C.reset}`); break }
        if (state.fs[p].type === 'dir') { w(`\r\n${C.red}${cmd}: ${p}: Is a directory${C.reset}`); break }
        const ext = p.split('.').pop()
        w(`\r\n${C.bold}${C.brightCyan}> ${p}${C.reset}\r\n`)
        if (cmd === 'python' || cmd === 'python3' || ext === 'py') {
          execPython(state.fs[p].content, w, () => w(PROMPT(state.cwd)), readLine)
        } else {
          execJS(state.fs[p].content, w, () => w(PROMPT(state.cwd)))
        }
        return  // skip the w(PROMPT) at the bottom
      }

      case 'eval': {
        if (!args[0]) { w(`\r\n${C.red}eval: missing expression${C.reset}`); break }
        w('\r\n')
        execJS(`console.log(${trimmed.slice(5)})`, w)
        break
      }

      default: {
        if (state.aliases[cmd]) { runCommand(term, state.aliases[cmd] + (args.length ? ' ' + args.join(' ') : '')); return }
        w(`\r\n${C.red}command not found:${C.reset} ${cmd}  ${C.gray}(type ${C.brightYellow}help${C.gray} for commands)${C.reset}`)
      }
    }

    w(PROMPT(state.cwd))
  }, [resolvePath, onFsChange, onOpenFile, readLine])

  useEffect(() => {
    if (!containerRef.current) return
    const term = new XTerm({
      cursorBlink: true, cursorStyle: 'block', fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
      lineHeight: 1.4,
      theme: isDark ? {
        background: '#0d0d0f', foreground: '#d4d4d4', cursor: '#ffffff', cursorAccent: '#000000',
        selectionBackground: '#264f78',
        black: '#1e1e1e', red: '#f44747', green: '#4ec9b0', yellow: '#dcdcaa',
        blue: '#569cd6', magenta: '#c586c0', cyan: '#9cdcfe', white: '#d4d4d4',
        brightBlack: '#808080', brightRed: '#f44747', brightGreen: '#4ec9b0',
        brightYellow: '#dcdcaa', brightBlue: '#569cd6', brightMagenta: '#c586c0',
        brightCyan: '#9cdcfe', brightWhite: '#ffffff',
      } : {
        background: '#ffffff', foreground: '#1a1a1a', cursor: '#1a1a1a', cursorAccent: '#ffffff',
        selectionBackground: '#b3d4ff',
        black: '#1a1a1a', red: '#c0392b', green: '#27ae60', yellow: '#d68910',
        blue: '#2471a3', magenta: '#8e44ad', cyan: '#148f77', white: '#555555',
        brightBlack: '#666666', brightRed: '#e74c3c', brightGreen: '#2ecc71',
        brightYellow: '#f39c12', brightBlue: '#3498db', brightMagenta: '#9b59b6',
        brightCyan: '#1abc9c', brightWhite: '#1a1a1a',
      },
      scrollback: 5000, allowTransparency: true, convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    setTimeout(() => fit.fit(), 50)
    termRef.current = term; fitRef.current = fit

    // ASCII banner (no unicode box chars to avoid encoding issues)
    term.write(
      `${C.bold}${C.brightCyan} ██╗  ██╗██████╗ ██╗   ██╗ ██████╗ ███╗  ██╗${C.reset}\r\n` +
      `${C.bold}${C.brightCyan} ██║ ██╔╝██╔══██╗╚██╗ ██╔╝██╔═══██╗████╗ ██║${C.reset}\r\n` +
      `${C.bold}${C.cyan} █████╔╝ ██████╔╝ ╚████╔╝ ██║   ██║██╔██╗██║${C.reset}\r\n` +
      `${C.bold}${C.cyan} ██╔═██╗ ██╔══██╗  ╚██╔╝  ██║   ██║██║╚████║${C.reset}\r\n` +
      `${C.bold}${C.blue} ██║  ██╗██║  ██║   ██║   ╚██████╔╝██║ ╚███║${C.reset}\r\n` +
      `${C.bold}${C.blue} ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚══╝${C.reset}\r\n` +
      `\r\n${C.gray}  Terminal v2.0  |  type ${C.brightYellow}help${C.reset}${C.gray} to get started  |  ${C.brightCyan}run <file>${C.reset}${C.gray} to execute${C.reset}\r\n`
    )
    term.write(PROMPT('/'))

    term.onKey(({ key, domEvent }) => {
      const state = stateRef.current
      const code = domEvent.keyCode

      // ── Input reader mode (Python input() waiting) ──────────────────────────
      if (inputReaderRef.current) {
        const reader = inputReaderRef.current
        if (domEvent.ctrlKey && domEvent.key === 'c') {
          // Cancel input — resolve with empty string
          term.write('^C\r\n')
          inputReaderRef.current = null
          reader.resolve('')
          return
        }
        if (code === 13) {
          // Enter — submit the buffered line
          const line = reader.buffer
          term.write('\r\n')
          inputReaderRef.current = null
          reader.resolve(line)
          return
        }
        if (code === 8) {
          // Backspace
          if (reader.buffer.length > 0) {
            reader.buffer = reader.buffer.slice(0, -1)
            term.write('\b \b')
          }
          return
        }
        if (!domEvent.ctrlKey && !domEvent.altKey && key.length === 1) {
          reader.buffer += key
          term.write(key)
        }
        return
      }
      // ────────────────────────────────────────────────────────────────────────

      if (domEvent.ctrlKey && domEvent.key === 'c') {
        state.input = ''; term.write('^C'); term.write(PROMPT(state.cwd)); return
      }
      if (domEvent.ctrlKey && domEvent.key === 'l') {
        term.clear(); term.write(PROMPT(state.cwd)); return
      }
      if (domEvent.ctrlKey && domEvent.key === 'u') {
        term.write('\b \b'.repeat(state.input.length)); state.input = ''; return
      }
      if (domEvent.ctrlKey && domEvent.key === 'w') {
        const words = state.input.trimEnd().split(' ')
        words.pop()
        const newInput = words.join(' ') + (words.length ? ' ' : '')
        term.write('\b \b'.repeat(state.input.length - newInput.length))
        state.input = newInput; return
      }

      // Tab completion
      if (code === 9) {
        domEvent.preventDefault()
        const parts = state.input.split(/\s+/)
        const last = parts[parts.length - 1]
        if (last) {
          const isFirst = parts.length === 1
          const base = resolvePath(state.cwd, last.includes('/') ? last.substring(0, last.lastIndexOf('/')) : '.')
          const prefix = last.split('/').pop()
          const cmdList = ['ls','cd','pwd','cat','head','tail','touch','mkdir','rm','mv','cp','find','grep','wc','stat','tree','write','run','node','python','eval','echo','export','unset','env','alias','which','history','clear','date','whoami','open','help']
          const fsMatches = Object.keys(state.fs)
            .filter(p => { const par = p.substring(0, p.lastIndexOf('/')) || '/'; return par === base && p.split('/').pop().startsWith(prefix) && p !== base })
            .map(p => p.split('/').pop() + (state.fs[p].type === 'dir' ? '/' : ''))
          const matches = [...new Set([...(isFirst ? cmdList.filter(c => c.startsWith(prefix)) : []), ...fsMatches])]
          if (matches.length === 1) {
            const completion = matches[0].slice(prefix.length)
            state.input += completion; term.write(completion)
          } else if (matches.length > 1) {
            term.write('\r\n' + matches.join('  '))
            term.write(PROMPT(state.cwd) + state.input)
          }
        }
        return
      }

      if (code === 13) { const c = state.input; state.input = ''; runCommand(term, c); return }
      if (code === 8) { if (state.input.length > 0) { state.input = state.input.slice(0, -1); term.write('\b \b') } return }
      if (code === 38) {
        const next = state.histIdx + 1
        if (next < state.history.length) {
          term.write('\b \b'.repeat(state.input.length))
          state.histIdx = next; state.input = state.history[next]; term.write(state.input)
        }
        return
      }
      if (code === 40) {
        if (state.histIdx > 0) {
          term.write('\b \b'.repeat(state.input.length))
          state.histIdx -= 1; state.input = state.history[state.histIdx]; term.write(state.input)
        } else if (state.histIdx === 0) {
          term.write('\b \b'.repeat(state.input.length)); state.histIdx = -1; state.input = ''
        }
        return
      }
      if (!domEvent.ctrlKey && !domEvent.altKey && key.length === 1) { state.input += key; term.write(key) }
    })

    const ro = new ResizeObserver(() => { try { fit.fit() } catch {} })
    ro.observe(containerRef.current)
    return () => { ro.disconnect(); term.dispose() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.theme = isDark
      ? { background: '#0d0d0f', foreground: '#d4d4d4', cursor: '#ffffff', cursorAccent: '#000000',
          selectionBackground: '#264f78',
          black: '#1e1e1e', red: '#f44747', green: '#4ec9b0', yellow: '#dcdcaa',
          blue: '#569cd6', magenta: '#c586c0', cyan: '#9cdcfe', white: '#d4d4d4',
          brightBlack: '#808080', brightRed: '#f44747', brightGreen: '#4ec9b0',
          brightYellow: '#dcdcaa', brightBlue: '#569cd6', brightMagenta: '#c586c0',
          brightCyan: '#9cdcfe', brightWhite: '#ffffff' }
      : { background: '#ffffff', foreground: '#1a1a1a', cursor: '#1a1a1a', cursorAccent: '#ffffff',
          selectionBackground: '#b3d4ff',
          black: '#1a1a1a', red: '#c0392b', green: '#27ae60', yellow: '#d68910',
          blue: '#2471a3', magenta: '#8e44ad', cyan: '#148f77', white: '#555555',
          brightBlack: '#666666', brightRed: '#e74c3c', brightGreen: '#2ecc71',
          brightYellow: '#f39c12', brightBlue: '#3498db', brightMagenta: '#9b59b6',
          brightCyan: '#1abc9c', brightWhite: '#1a1a1a' }
  }, [isDark])

  return <div ref={containerRef} className="w-full h-full" style={{ padding: '4px 2px' }} />
})
