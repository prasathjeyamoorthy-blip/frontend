"""
Code Guardian v2 — Multi-File Self-Correcting Coding Agent
==========================================================
3-panel IDE layout: file tree (left), code editor (center), chat (right).
Generates multiple files, streams tokens live, executes & self-corrects.
"""

import asyncio
import json
import os
import re
import subprocess
import sys
import textwrap
import traceback
from pathlib import Path

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/api/generate")
MODEL = os.getenv("MODEL", "qwen2.5-coder:7b")
WORKSPACE = Path(__file__).resolve().parent / ".workspace"
MAX_RETRIES = 3

_SCAN_SKIP_DIRS = {".workspace", ".git", "node_modules", "__pycache__", ".venv", "venv", ".next", "dist", "build"}

def _scan_workspace(base_dir: Path) -> dict[str, str]:
    files = {}
    if not base_dir.exists():
        return files
    for p in base_dir.rglob("*"):
        if not p.is_file():
            continue
        # Skip files inside blacklisted directories
        if any(part in _SCAN_SKIP_DIRS for part in p.parts):
            continue
        try:
            rel = p.relative_to(base_dir).as_posix()
            # Skip extensionless files and hidden dirs at root level
            if "/" not in rel and "." not in rel:
                continue
            files[rel] = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError):
            pass
    return files

WORKSPACE.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Code Guardian", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

FILE_ICONS = {
    ".py": "🐍", ".js": "🟨", ".ts": "🔷", ".html": "🌐",
    ".css": "🎨", ".json": "📋", ".md": "📝", ".sh": "⚙️",
    ".bat": "⚙️", ".txt": "📄", ".yaml": "📋", ".yml": "📋",
    ".jsx": "⚛️", ".tsx": "⚛️", ".sql": "🗄️",
}


def _parse_multi_file(raw: str) -> dict[str, str]:
    files = {}
    pattern1 = r"-{3,}\s*FILE:\s*(.+?)\s*-{3,}\s*\n(.*?)(?=-{3,}\s*FILE:|$)"
    for fname, code in re.findall(pattern1, raw, re.DOTALL):
        files[fname.strip().strip("`\"'#").strip()] = _strip_markdown_fences(code).strip()
    if files: return files

    block_pattern = r"(?m)^[ \t]*```[a-zA-Z0-9]*\s*\n(.*?)^[ \t]*```[ \t]*(?:\n|$)"
    code_blocks = re.finditer(block_pattern, raw, re.DOTALL)
    
    last_end = 0
    i = 1
    for match in code_blocks:
        code = match.group(1).strip()
        if not code: continue
        text_before = raw[last_end:match.start()]
        last_end = match.end()
        
        m = re.findall(r"(?:^|[\s`*#\[\(])([a-zA-Z0-9_/-]*(?:\.[a-zA-Z0-9_-]+)+|[a-zA-Z0-9_-]+file|Dockerfile|\.env)[^\w\.-]", text_before + " ")
        fname = m[-1].strip() if m else f"file_{i}.txt"
        
        if fname.endswith(".txt") and fname.startswith("file_"):
            if "from 'react'" in code or 'from "react"' in code or "return (" in code: fname = fname.replace(".txt", ".jsx")
            elif "def " in code or ("class " in code and ":" in code) or ("import " in code and "from " in code and ";" not in code): fname = fname.replace(".txt", ".py")
            elif "const " in code or "let " in code or "document." in code or "console.log" in code or ("import " in code and ";" in code): fname = fname.replace(".txt", ".js")
            elif "<html" in code or "<!DOCTYPE" in code: fname = fname.replace(".txt", ".html")
            elif "{" in code and ":" in code and "}" in code and "import" not in code: fname = fname.replace(".txt", ".css")
            elif "FROM " in code or "WORKDIR " in code: fname = "Dockerfile"
            
        files[fname] = code
        i += 1
        
    if files: return files

    code = _strip_markdown_fences(raw).strip()
    if not code: return {}
    if "<html" in code: return {"index.html": code}
    if "import " in code: return {"main.py": code}
    if "const " in code: return {"index.js": code}
    return {"main.py": code}


def _strip_markdown_fences(text: str) -> str:
    pattern = r"(?m)^[ \t]*```[a-zA-Z0-9]*\s*\n(.*?)^[ \t]*```[ \t]*(?:\n|$)"
    matches = re.findall(pattern, text, re.DOTALL)
    if matches:
        return "\n".join(matches).strip()
    return text.strip()


def _extract_reasoning(raw: str) -> str:
    # Remove any explicit FILE format blocks
    pattern1 = r"-{3,}\s*FILE:\s*(.+?)\s*-{3,}\s*\n(.*?)(?=-{3,}\s*FILE:|$)"
    reasoning = re.sub(pattern1, "", raw, flags=re.DOTALL)
    
    # Remove any generic markdown code blocks, supporting indentation
    pattern2 = r"(?m)^[ \t]*```[a-zA-Z0-9]*\s*\n.*?^[ \t]*```[ \t]*(?:\n|$)"
    reasoning = re.sub(pattern2, "", reasoning, flags=re.DOTALL)
    
    return reasoning.strip()


async def _stream_ollama(prompt: str, websocket: WebSocket) -> str:
    full_response = ""
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST", OLLAMA_URL,
                json={"model": MODEL, "prompt": prompt, "stream": True, "options": {"temperature": 0.2}},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    token = chunk.get("response", "")
                    if token:
                        full_response += token
                        try:
                            await websocket.send_json({"type": "token", "token": token})
                        except Exception:
                            # Client disconnected or socket closed unexpectedly
                            break
                    if chunk.get("done"):
                        break
    except Exception as e:
        print(f"Ollama streaming interrupted: {e}")
    return full_response


async def _check_syntax(workspace: Path, files: dict[str, str]) -> tuple[bool, str]:
    """Returns (is_valid, error_message)"""
    for fname in files:
        fpath = workspace / fname
        ext = fpath.suffix
        cmd = None
        if ext == ".py":
            cmd = [sys.executable, "-m", "py_compile", str(fpath)]
        elif ext == ".js":
            cmd = ["node", "--check", str(fpath)]
        
        if cmd:
            try:
                result = await asyncio.to_thread(
                    subprocess.run, cmd, capture_output=True, text=True, timeout=10, cwd=str(workspace)
                )
                if result.returncode != 0:
                    err = result.stderr.strip() or result.stdout.strip()
                    if "Cannot use import statement outside a module" in err:
                        continue
                    return False, f"Syntax error in {fname}:\n{err}"
            except Exception as e:
                return False, f"Syntax check failed for {fname}: {e}"
    return True, ""


# ---------------------------------------------------------------------------
# Security Scanner (Hacker Mode)
# ---------------------------------------------------------------------------

SECURITY_CHECKS = [
    {
        "id": "hardcoded_secret",
        "name": "Hardcoded Secret/Password",
        "severity": "critical",
        "pattern": r"""(?i)(?:password|passwd|pwd|secret|api_key|apikey|api_secret|access_key|private_key|token|auth_token|secret_key|jwt_secret)\s*[=:]\s*["'][^"']{2,}["']""",
        "description": "Hardcoded credential found \u2014 attacker can extract from source",
    },
    {
        "id": "hardcoded_db_url",
        "name": "Hardcoded Database URL",
        "severity": "critical",
        "pattern": r"""(?i)(?:DATABASE_URL|SQLALCHEMY_DATABASE_URL|MONGO_URI|DB_URI|DB_URL|REDIS_URL)\s*=\s*["'][^"']{5,}["']""",
        "description": "Database connection string hardcoded \u2014 use environment variables",
    },
    {
        "id": "env_file_present",
        "name": ".env File Detected",
        "severity": "high",
        "check_type": "file_present_env",
        "description": ".env file with secrets found \u2014 ensure .gitignore excludes it",
    },
    {
        "id": "env_secrets",
        "name": "Secrets in .env file",
        "severity": "critical",
        "pattern": r"""(?i)^(?:DB_PASSWORD|SECRET_KEY|API_KEY|AWS_SECRET|PRIVATE_KEY|JWT_SECRET|DATABASE_URL|MONGO_URI|AUTH_TOKEN|ACCESS_TOKEN)\s*=\s*\S+""",
        "file_filter": ".env",
        "description": ".env contains real secrets \u2014 must be in .gitignore",
    },
    {
        "id": "sql_injection",
        "name": "SQL Injection Risk",
        "severity": "critical",
        "pattern": r"""(?i)(?:execute\s*\(\s*f["']|execute\s*\(\s*["']\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP).*%|execute\s*\(\s*["']\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP).*\+|\.format\s*\(.*(?:SELECT|INSERT|UPDATE|DELETE)|f["'].*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\s+.*\{)""",
        "description": "Unsanitized input in SQL query \u2014 use parameterized queries",
    },
    {
        "id": "xss_innerhtml",
        "name": "XSS \u2014 innerHTML Usage",
        "severity": "critical",
        "pattern": r"""(?:\.innerHTML\s*[=+]|\.outerHTML\s*[=+]|document\.write\s*\(|document\.writeln\s*\()""",
        "description": "Direct DOM manipulation allows XSS \u2014 sanitize user input first",
    },
    {
        "id": "xss_react_dangerous",
        "name": "XSS \u2014 dangerouslySetInnerHTML",
        "severity": "critical",
        "pattern": r"""dangerouslySetInnerHTML""",
        "description": "React dangerouslySetInnerHTML can inject malicious HTML",
    },
    {
        "id": "xss_template_injection",
        "name": "XSS \u2014 Unsanitized Template Rendering",
        "severity": "high",
        "pattern": r"""(?:render_template_string\s*\(|Markup\s*\(.*\+|{%\s*autoescape\s+false|escape\s*=\s*False|\|\s*safe\b)""",
        "description": "Template renders unsanitized user input \u2014 XSS risk",
    },
    {
        "id": "cors_wildcard",
        "name": "CORS Wildcard Origin",
        "severity": "medium",
        "pattern": r"""(?i)(?:allow_origins\s*=\s*\[\s*["']\*["']|origins\s*=\s*\[\s*["']\*["']|cors\(.*origin.*["']\*["']|Access-Control-Allow-Origin.*\*|allow_methods\s*=\s*\[\s*["']\*["'])""",
        "description": "CORS allows all origins \u2014 any website can make requests to your API",
    },
    {
        "id": "debug_mode",
        "name": "Debug Mode Enabled",
        "severity": "medium",
        "pattern": r"""(?i)(?:debug\s*=\s*True|DEBUG\s*=\s*True|app\.debug\s*=\s*True|"debug"\s*:\s*true)""",
        "description": "Debug mode exposes stack traces and internals to attackers",
    },
    {
        "id": "no_https",
        "name": "HTTP Instead of HTTPS",
        "severity": "high",
        "pattern": r"""http://(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[a-zA-Z0-9]""",
        "description": "Unencrypted HTTP \u2014 data transmitted in plaintext",
    },
    {
        "id": "exposed_host",
        "name": "Binding to 0.0.0.0",
        "severity": "medium",
        "pattern": r"""(?:host\s*=\s*["']0\.0\.0\.0["']|\.listen\(\s*0\.0\.0\.0)""",
        "description": "Server binds to all interfaces \u2014 exposed to entire network",
    },
    {
        "id": "eval_exec",
        "name": "Dangerous eval/exec",
        "severity": "critical",
        "pattern": r"""(?:^|[^a-zA-Z_])(?:eval|exec)\s*\(""",
        "description": "eval/exec allows arbitrary code execution",
    },
    {
        "id": "no_gitignore",
        "name": "Missing .gitignore",
        "severity": "high",
        "check_type": "file_missing",
        "target": ".gitignore",
        "description": "No .gitignore \u2014 secrets, venv, and node_modules may be pushed to git",
    },
    {
        "id": "venv_exposed",
        "name": "venv/node_modules in project",
        "severity": "high",
        "check_type": "file_present",
        "target_patterns": ["venv/", "node_modules/", ".venv/"],
        "description": "Virtual env or node_modules would be pushed to git",
    },
    {
        "id": "no_rate_limit",
        "name": "No Rate Limiting",
        "severity": "medium",
        "check_type": "content_missing",
        "search_terms": ["ratelimit", "rate_limit", "throttle", "slowapi", "RateLimiter"],
        "description": "No rate limiting detected \u2014 API vulnerable to brute-force and DDoS",
    },
    {
        "id": "placeholder_secret",
        "name": "Placeholder Secret Key",
        "severity": "high",
        "pattern": r"""(?i)(?:secret.?key|jwt.?secret|api.?key)\s*[=:]\s*["'](?:your|change|replace|example|placeholder|mysecret|secret|test|todo|fixme|xxx)""",
        "description": "Placeholder secret key left in code \u2014 must be replaced before deployment",
    },
]

SEVERITY_POINTS = {"critical": 20, "high": 10, "medium": 5}


def _scan_security_issues(files: dict[str, str]) -> list[dict]:
    issues = []
    file_names = set(files.keys())

    for check in SECURITY_CHECKS:
        check_type = check.get("check_type", "regex")

        if check_type == "file_missing":
            if check["target"] not in file_names:
                issues.append({
                    "id": check["id"], "name": check["name"],
                    "severity": check["severity"], "file": "(project)",
                    "line": 0, "description": check["description"],
                })
            continue

        if check_type == "file_present":
            for tp in check.get("target_patterns", []):
                for fname in file_names:
                    if tp in fname:
                        issues.append({
                            "id": check["id"], "name": check["name"],
                            "severity": check["severity"], "file": fname,
                            "line": 0, "description": check["description"],
                        })
            continue

        if check_type == "file_present_env":
            for fname in file_names:
                if fname.endswith(".env") or fname == ".env":
                    issues.append({
                        "id": check["id"], "name": check["name"],
                        "severity": check["severity"], "file": fname,
                        "line": 0, "description": check["description"],
                    })
            continue

        if check_type == "content_missing":
            all_code = " ".join(files.values()).lower()
            found = any(term.lower() in all_code for term in check.get("search_terms", []))
            if not found:
                issues.append({
                    "id": check["id"], "name": check["name"],
                    "severity": check["severity"], "file": "(project)",
                    "line": 0, "description": check["description"],
                })
            continue

        pattern = re.compile(check["pattern"], re.MULTILINE | re.IGNORECASE)
        file_filter = check.get("file_filter", None)

        for fname, code in files.items():
            if file_filter and not fname.endswith(file_filter):
                continue
            for i, line in enumerate(code.splitlines(), 1):
                if pattern.search(line):
                    issues.append({
                        "id": check["id"], "name": check["name"],
                        "severity": check["severity"], "file": fname,
                        "line": i, "description": check["description"],
                        "snippet": line.strip()[:120],
                    })

    return issues


def _compute_deployment_score(issues: list[dict]) -> int:
    score = 100
    for issue in issues:
        score -= SEVERITY_POINTS.get(issue["severity"], 5)
    return max(0, min(100, score))


def _compute_threat_report(issues: list[dict]) -> dict:
    """Builds a detailed threat report with score, breakdown, and priority ranking."""
    counts = {"critical": 0, "high": 0, "medium": 0}
    for issue in issues:
        sev = issue.get("severity", "medium")
        if sev in counts:
            counts[sev] += 1

    # Weighted score: start at 100, deduct by severity weight
    raw_score = 100
    raw_score -= counts["critical"] * 20
    raw_score -= counts["high"] * 10
    raw_score -= counts["medium"] * 5
    threat_score = max(0, min(100, raw_score))

    # Risk level label
    if threat_score >= 85:
        risk_level = "LOW"
        risk_color = "green"
    elif threat_score >= 60:
        risk_level = "MEDIUM"
        risk_color = "yellow"
    elif threat_score >= 35:
        risk_level = "HIGH"
        risk_color = "orange"
    else:
        risk_level = "CRITICAL"
        risk_color = "red"

    # Group issues by category
    categories = {}
    for issue in issues:
        cat = issue.get("id", "unknown").split("_")[0].capitalize()
        categories.setdefault(cat, []).append(issue)

    # Top priority issues (critical first, then high)
    priority_issues = sorted(
        issues,
        key=lambda x: {"critical": 0, "high": 1, "medium": 2}.get(x.get("severity", "medium"), 3)
    )[:5]

    return {
        "threat_score": threat_score,
        "risk_level": risk_level,
        "risk_color": risk_color,
        "counts": counts,
        "total": len(issues),
        "categories": {k: len(v) for k, v in categories.items()},
        "priority_issues": priority_issues,
    }


def _build_gen_prompt(user_prompt: str, existing_files: dict[str, str]) -> str:
    files_context = ""
    if existing_files:
        files_context = "Current files in the workspace:\n"
        for fname, code in existing_files.items():
            files_context += f"--- FILE: {fname} ---\n{code}\n"
    return textwrap.dedent(f"""\
        You are an expert full-stack developer.

        The user will describe a feature or application. Generate ALL the files needed.
        Use this EXACT format for EVERY file — one after another:

        --- FILE: filename.ext ---
        <code for that file>

        Rules:
        - Each file must be complete and syntactically valid.
        - Include standard placeholders for env keys, database access keys, passwords, etc. (e.g. leave them open like a normal new developer does).
        - You may provide a brief explanation or reasoning of what you did. This reasoning should be outside of the file blocks.
        - If you are updating an existing file, output the full updated file.
        - Wrap EVERY file you create or update EXACTLY like this:
          --- FILE: filename.ext ---
          <code for that file>
        
        {files_context}

        User request:
        {user_prompt}
    """)


def _build_fix_syntax_prompt(files: dict[str, str], error: str) -> str:
    files_section = ""
    for fname, code in files.items():
        files_section += f"\n--- FILE: {fname} ---\n{code}\n"
    return textwrap.dedent(f"""\
        The following code contains syntax errors.

        {files_section}

        --- SYNTAX ERROR ---
        {error}

        Fix the code so it has valid syntax.
        Output ALL files again using the exact same format:
        --- FILE: filename.ext ---
        <fixed code>

        You may provide a brief explanation or reasoning of the bug you fixed outside of the file blocks.
    """)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL, "workspace": str(WORKSPACE)}

@app.post("/save")
async def save_file(data: dict):
    if "path" in data and "code" in data:
        fpath = WORKSPACE / data["path"]
        fpath.parent.mkdir(parents=True, exist_ok=True)
        fpath.write_text(data["code"], encoding="utf-8")
    return {"status": "ok"}

@app.post("/scan")
async def scan_workspace(data: dict = None):
    # Accept files from request body (frontend FS), or fall back to disk workspace
    if data and data.get("files"):
        ws_files = {k.lstrip("/"): v for k, v in data["files"].items() if isinstance(v, str)}
    else:
        ws_files = _scan_workspace(WORKSPACE)
    if not ws_files:
        return {"issues": [], "score": 100, "message": "No files to scan", "threat_report": None}
    issues = _scan_security_issues(ws_files)
    score = _compute_deployment_score(issues)
    threat_report = _compute_threat_report(issues)
    return {"issues": issues, "score": score, "threat_report": threat_report}

@app.post("/run")
async def run_code():
    entry_points = [
        ("main.py", [sys.executable, "main.py"]),
        ("app.py", [sys.executable, "app.py"]),
        ("index.js", ["node", "index.js"]),
        ("server.js", ["node", "server.js"]),
        ("script.py", [sys.executable, "script.py"])
    ]
    
    cmd = None
    for file, c in entry_points:
        if (WORKSPACE / file).exists():
            cmd = c
            break
            
    if not cmd:
        for p in WORKSPACE.rglob("*"):
            if p.suffix == ".py":
                cmd = [sys.executable, p.relative_to(WORKSPACE).as_posix()]
                break
            elif p.suffix == ".js":
                cmd = ["node", p.relative_to(WORKSPACE).as_posix()]
                break

    if not cmd:
        return {"stdout": "", "error": "No recognizable Python or Node.js entry point found."}
        
    try:
        result = await asyncio.to_thread(
            subprocess.run, cmd, capture_output=True, text=True, timeout=10, cwd=str(WORKSPACE)
        )
        return {"stdout": result.stdout, "error": result.stderr}
    except subprocess.TimeoutExpired as e:
        return {"stdout": str(e.stdout or ""), "error": "Execution timed out after 10 seconds."}
    except Exception as e:
        return {"stdout": "", "error": f"Failed to run code: {str(e)}"}


# ---------------------------------------------------------------------------
# WebSocket Agent
# ---------------------------------------------------------------------------

async def _send(ws: WebSocket, data: dict):
    try:
        await ws.send_json(data)
    except Exception:
        pass


@app.websocket("/ws/agent")
async def agent_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            try:
                data = await websocket.receive_json()
                user_prompt: str = data.get("prompt", "").strip()
                mode: str = data.get("mode", "developer")
                if not user_prompt:
                    await _send(websocket, {"type": "error", "message": "Empty prompt.", "fatal": True})
                    continue
                await _run_agent_loop(websocket, user_prompt, mode)
            except WebSocketDisconnect:
                break
            except RuntimeError as e:
                # Starlette raises RuntimeError when socket isn't connected
                if "not connected" in str(e).lower() or "accept" in str(e).lower():
                    break
                print(f"Agent RuntimeError: {e}")
                break
            except Exception as e:
                err_str = str(type(e).__name__) + str(e)
                if any(k in err_str for k in ("WebSocketDisconnect", "ConnectionClosed", "not connected")):
                    break
                tb = traceback.format_exc()
                print(f"Agent error: {tb}")
                await _send(websocket, {"type": "error", "message": f"Agent error: {str(e)}", "fatal": True})
                await _send(websocket, {"type": "done", "files": {}, "stdout": "", "error": str(e)})
    except Exception:
        pass


async def _run_agent_loop(ws: WebSocket, user_prompt: str, mode: str = "developer"):
    existing_files = _scan_workspace(WORKSPACE)
    generation_prompt = _build_gen_prompt(user_prompt, existing_files)
    all_files = existing_files.copy()

    await _send(ws, {"type": "gen_start", "message": "Generating code…"})

    try:
        raw = await _stream_ollama(generation_prompt, ws)
    except httpx.ConnectError:
        await _send(ws, {"type": "error", "message": "Cannot connect to Ollama. Is it running? (ollama serve)", "fatal": True})
        await _send(ws, {"type": "done", "files": {}, "stdout": "", "error": "Ollama not reachable"})
        return
    except (httpx.ReadTimeout, httpx.ReadError):
        await _send(ws, {"type": "error", "message": "Ollama timed out. Try a simpler prompt.", "fatal": True})
        await _send(ws, {"type": "done", "files": {}, "stdout": "", "error": "Timeout"})
        return

    files = _parse_multi_file(raw)
    if not files:
        await _send(ws, {"type": "error", "message": "LLM returned empty output.", "fatal": True})
        await _send(ws, {"type": "done", "files": {}, "stdout": "", "error": "No files parsed"})
        return

    # Filter out invalid/dangerous filenames before writing
    _WRITE_SKIP = {".workspace", "workspace", ".git", "node_modules", "__pycache__", ".venv", "venv"}
    def _is_valid_file(fname: str) -> bool:
        parts = fname.replace("\\", "/").split("/")
        if any(p in _WRITE_SKIP or p.startswith("..") for p in parts):
            return False
        # Last segment must have a file extension
        if "." not in parts[-1]:
            return False
        return True

    files = {k: v for k, v in files.items() if _is_valid_file(k)}
    if not files:
        await _send(ws, {"type": "error", "message": "No valid files to write after filtering.", "fatal": True})
        await _send(ws, {"type": "done", "files": {}, "stdout": "", "error": "No valid files"})
        return

    await _send(ws, {"type": "log", "message": f"Parsed {len(files)} file(s): {', '.join(files.keys())}", "level": "writing"})

    for fname, code in files.items():
        fpath = WORKSPACE / fname
        # Safety check: never write if the resolved path is the workspace dir itself
        if fpath.resolve() == WORKSPACE.resolve():
            continue
        fpath.parent.mkdir(parents=True, exist_ok=True)
        fpath.write_text(code, encoding="utf-8")
        all_files[fname] = code

    await _send(ws, {"type": "files_created", "files": all_files})
    await _send(ws, {"type": "log", "message": "Files written to workspace/", "level": "writing"})

    reasoning = _extract_reasoning(raw)
    if reasoning:
        await _send(ws, {"type": "log", "message": reasoning, "level": "agent"})

    # --- AUTO EXECUTION AND SELF-CORRECTION ---
    await _send(ws, {"type": "log", "message": "Running code to check for errors...", "level": "testing"})
    entry_points = [
        ("main.py", [sys.executable, "main.py"]),
        ("app.py", [sys.executable, "app.py"]),
        ("index.js", ["node", "index.js"]),
        ("server.js", ["node", "server.js"]),
        ("script.py", [sys.executable, "script.py"])
    ]
    cmd = None
    for file, c in entry_points:
        if (WORKSPACE / file).exists():
            cmd = c
            break
    if not cmd:
        for p in WORKSPACE.rglob("*"):
            if p.suffix == ".py":
                cmd = [sys.executable, p.relative_to(WORKSPACE).as_posix()]
                break
            elif p.suffix == ".js":
                cmd = ["node", p.relative_to(WORKSPACE).as_posix()]
                break

    exec_stdout = "Code generated successfully."
    exec_stderr = ""

    if cmd:
        try:
             # Run for up to 5 seconds to catch syntax/immediate runtime errors
            result = await asyncio.to_thread(
                subprocess.run, cmd, capture_output=True, text=True, timeout=5, cwd=str(WORKSPACE)
            )
            if result.returncode != 0:
                exec_stderr = result.stderr.strip() or result.stdout.strip()
                await _send(ws, {"type": "log", "message": "Execution error detected. Attempting self-correction...", "level": "error"})
                
                fix_prompt = _build_fix_syntax_prompt(all_files, exec_stderr)
                try:
                    raw_fix = await _stream_ollama(fix_prompt, ws)
                    new_files = _parse_multi_file(raw_fix)
                    if new_files:
                        for fname, code in new_files.items():
                            fpath = WORKSPACE / fname
                            fpath.parent.mkdir(parents=True, exist_ok=True)
                            fpath.write_text(code, encoding="utf-8")
                            all_files[fname] = code
                        await _send(ws, {"type": "files_created", "files": all_files})
                        await _send(ws, {"type": "log", "message": "Self-correction applied.", "level": "success"})
                        # Re-run after correction
                        exec_stdout = "Code generated and auto-corrected."
                        exec_stderr = ""
                except Exception as e:
                    await _send(ws, {"type": "error", "message": f"Self-correction failed: {str(e)}", "fatal": False})
            else:
                exec_stdout = result.stdout
                await _send(ws, {"type": "log", "message": "Execution check passed.", "level": "success"})
        except subprocess.TimeoutExpired as e:
            exec_stdout = str(e.stdout or "")
            await _send(ws, {"type": "log", "message": "Code is running continuously (no immediate crashes).", "level": "success"})
        except Exception as e:
            exec_stderr = f"Execution failed: {str(e)}"
    # --- END AUTO EXECUTION ---

    if mode == "hacker":
        await _send(ws, {"type": "log", "message": "☠️ Running security scan...", "level": "testing"})
        issues = _scan_security_issues(all_files)
        score = _compute_deployment_score(issues)
        await _send(ws, {"type": "security_scan", "issues": issues, "score": score})

    await _send(ws, {"type": "done", "files": all_files, "stdout": exec_stdout, "error": exec_stderr})


# ---------------------------------------------------------------------------
# Terminal WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket):
    await websocket.accept()
    process = None
    
    async def read_stdout(proc):
        try:
            while True:
                line = await proc.stdout.read(1024)
                if not line:
                    break
                decoded = line.decode('utf-8', errors='replace')
                await websocket.send_json({"type": "output", "data": decoded})
            await proc.wait()
            await websocket.send_json({"type": "output", "data": f"\n[Process exited with code {proc.returncode}]\n"})
            await websocket.send_json({"type": "status", "active": False})
        except Exception:
            pass

    try:
        while True:
            data = await websocket.receive_json()
            cmd = data.get("cmd", "")
            if not cmd:
                continue
            
            if process and process.returncode is None:
                if process.stdin:
                    process.stdin.write((cmd + "\n").encode("utf-8"))
                    await process.stdin.drain()
            else:
                process = await asyncio.create_subprocess_shell(
                    cmd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    cwd=str(WORKSPACE)
                )
                await websocket.send_json({"type": "status", "active": True})
                asyncio.create_task(read_stdout(process))
                
    except WebSocketDisconnect:
        if process and process.returncode is None:
            try:
                process.terminate()
            except Exception:
                pass
    except Exception as e:
        print(f"Terminal WS Error: {e}")


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
