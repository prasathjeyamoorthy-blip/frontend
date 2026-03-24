// Virtual in-memory file system
// Structure: { [path]: { type: 'file'|'dir', content: string } }

const LANG_MAP = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', css: 'css', html: 'html', json: 'json', md: 'markdown',
  sh: 'shell', txt: 'plaintext', rs: 'rust', go: 'go', cpp: 'cpp', c: 'c',
}

export function getLang(filename) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return LANG_MAP[ext] ?? 'plaintext'
}

export function createFS() {
  const files = {
    '/': { type: 'dir' },
    '/src': { type: 'dir' },
    '/src/main.js': {
      type: 'file',
      content: `// Welcome to KRYON Editor\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet("World"));\n`,
    },
    '/src/utils.js': {
      type: 'file',
      content: `export function add(a, b) {\n  return a + b;\n}\n\nexport function subtract(a, b) {\n  return a - b;\n}\n`,
    },
    '/src/hello.py': {
      type: 'file',
      content: `import pandas as pd\nfrom sklearn.ensemble import RandomForestClassifier\nfrom sklearn.model_selection import train_test_split\n\n# Sample dataset\ndata = pd.DataFrame({\n    "amount": [100, 2000, 150, 5000, 300, 7000],\n    "location_change": [0, 1, 0, 1, 0, 1],\n    "unusual_time": [0, 1, 0, 1, 0, 1],\n    "is_fraud": [0, 1, 0, 1, 0, 1]\n})\n\nX = data[["amount", "location_change", "unusual_time"]]\ny = data["is_fraud"]\n\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n\nmodel = RandomForestClassifier()\nmodel.fit(X_train, y_train)\n\ndef predict_transaction(amount, location_change, unusual_time):\n    input_data = [[amount, location_change, unusual_time]]\n    prediction = model.predict(input_data)[0]\n    if prediction == 1:\n        return "Fraud Detected"\n    else:\n        return "Safe Transaction"\n\nresult = predict_transaction(6000, 1, 1)\nprint(result)\n`,
    },
    '/src/ml_example.py': {
      type: 'file',
      content: `# ML example — scikit-learn linear regression\nimport numpy as np\nfrom sklearn.linear_model import LinearRegression\n\n# Generate data\nX = np.array([[1],[2],[3],[4],[5]], dtype=float)\ny = np.array([2, 4, 5, 4, 5], dtype=float)\n\nmodel = LinearRegression()\nmodel.fit(X, y)\n\nprint(f"Slope:     {model.coef_[0]:.4f}")\nprint(f"Intercept: {model.intercept_:.4f}")\nprint(f"R² score:  {model.score(X, y):.4f}")\nprint(f"Predict 6: {model.predict([[6]])[0]:.4f}")\n`,
    },
    '/README.md': {
      type: 'file',
      content: `# KRYON\n\nNext Generation Platform\n\n## Getting Started\n\nEdit files in the explorer and use the terminal below.\n`,
    },
    '/package.json': {
      type: 'file',
      content: `{\n  "name": "kryon-project",\n  "version": "1.0.0",\n  "description": "KRYON project"\n}\n`,
    },
  }
  return files
}

export function listDir(fs, dirPath) {
  const norm = dirPath.endsWith('/') && dirPath !== '/' ? dirPath.slice(0, -1) : dirPath
  return Object.entries(fs)
    .filter(([p, v]) => {
      if (p === norm) return false
      const parent = p.substring(0, p.lastIndexOf('/')) || '/'
      return parent === norm
    })
    .map(([p, v]) => ({ path: p, name: p.split('/').pop(), ...v }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export function createFile(fs, path, content = '') {
  return { ...fs, [path]: { type: 'file', content } }
}

export function createDir(fs, path) {
  return { ...fs, [path]: { type: 'dir' } }
}

export function deleteEntry(fs, path) {
  const next = { ...fs }
  Object.keys(next).forEach(k => {
    if (k === path || k.startsWith(path + '/')) delete next[k]
  })
  return next
}

export function renameEntry(fs, oldPath, newPath) {
  const next = {}
  Object.entries(fs).forEach(([k, v]) => {
    if (k === oldPath) next[newPath] = v
    else if (k.startsWith(oldPath + '/')) next[newPath + k.slice(oldPath.length)] = v
    else next[k] = v
  })
  return next
}

export function updateFile(fs, path, content) {
  if (!fs[path] || fs[path].type !== 'file') return fs
  return { ...fs, [path]: { ...fs[path], content } }
}
