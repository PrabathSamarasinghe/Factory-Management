#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMAND = basename(fileURLToPath(import.meta.url));
const MAX_FILES = 3000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_DEPTH = 10;
const MAX_CONTEXT_LENGTH = 160;
const MIN_CREDENTIAL_LENGTH = 20;
const MIN_CREDENTIAL_ENTROPY = 3.5;
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  '.ruff_cache',
  '.next',
  '.venv',
  'dist',
  'build',
  'coverage',
  'generated',
  'vendor',
]);
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.env',
  '.example',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.prisma',
  '.py',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const ALLOWED_FILE_NAMES = new Set(['CODEOWNERS', 'Dockerfile', 'Makefile']);
const SENSITIVE_NAME_PARTS = ['SECRET', 'PASSWORD', 'TOKEN', 'API_KEY', 'PRIVATE_KEY'];
const CREDENTIAL_LITERAL_PATTERN =
  /(^|[\s;,{])([A-Za-z_$][\w$]*)\s*(?:=|:)\s*(["'`])((?:\\.|(?!\3)[^\\])*)\3/gi;
const BARE_CREDENTIAL_LITERAL_PATTERN =
  /(^|[\s;,{])([A-Za-z_$][\w$]*)\s*(?:=|:)\s*([A-Za-z0-9+/=_-]+)/gi;
const PLACEHOLDER_PATTERN =
  /placeholder|example|dummy|fake|sample|mock|test|changeme|change[-_]?me|replace|your|redacted|xxxx|env\s*\(|process\.env|\$\(|\$\{|^\$[A-Za-z_]|<|>|^\[|\[$|\]$/i;
const RAW_SQL_PATTERN = new RegExp(
  '\\$(?:queryRaw|executeRaw)(?:Unsafe)?\\s*(?:`[^`]*\\$\\{[^}]*\\}[^`]*`|\\(\\s*`[^`]*\\$\\{[^}]*\\}[^`]*`\\s*[,)])',
  'g',
);
const RAW_SQL_CONCAT_PATTERN = new RegExp(
  '\\$(?:queryRaw|executeRaw)(?:Unsafe)?\\s*\\([^)]*\\+[^)]*\\)',
  'g',
);
const FREE_PLAN_PATTERN = /^-?\s*plan(?:Id)?\s*:\s*['"]?(free|starter|hobby|0)['"]?(?:\s+#.*)?$/i;
const PRODUCTION_DATA_MARKERS = [
  /\bRAW[_-]?PROD(?:UCTION)?[_-]?DATA\b/i,
  /\b(?:PROD|PRODUCTION)[_-]?(?:DB|DATABASE)[_-]?DUMP\b/i,
  /\bproduction database dump\b/i,
  /\bprod dump\b/i,
  /\blive[_-]?prod[_-]?pii\b/i,
  /\breal[_-]?customer[_-]?(?:data|pii)\b/i,
  /\braw[_-]?(?:face|biometric)[_-]?(?:frames?|images?)\b/i,
  /\bactual[_-]?nic\b/i,
  /\breal[_-]?bank[_-]?account[_-]?numbers?\b/i,
];
const DENIAL_PATTERN =
  /\b(?:no|not|never|without|forbid(?:den)?|prohibit(?:ed)?|avoid|bann?ed|deny|denies|cannot|can't|must not|do not|don't)\b/i;

const options = parseArgs(process.argv.slice(2));

if (!existsSync(options.root) || !statSync(options.root).isDirectory()) {
  console.error(`${COMMAND}: --root must be an existing directory.`);
  process.exit(2);
}

const report = scanRoot(options.root, options.strict);

if (options.json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  for (const finding of report.findings) {
    console.log(
      `${finding.id} ${finding.path}:${finding.line} [${finding.rule}] ${finding.severity} context=${finding.context}`,
    );
  }
  if (report.findings.length === 0) {
    console.log(`Security check passed (${report.scannedFiles} files scanned).`);
  } else {
    const mode = report.strict ? '' : ' Strict mode is off.';
    console.log(
      `Security check found ${report.findings.length} finding(s) (${report.scannedFiles} files scanned).${mode}`,
    );
  }
}

process.exit(report.findings.length > 0 && report.strict ? 1 : 0);

function parseArgs(argv) {
  let root = process.cwd();
  let json = false;
  let strict = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--root requires a path');
      }
      root = value;
      index += 1;
    } else if (arg.startsWith('--root=')) {
      root = arg.slice('--root='.length);
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--strict') {
      strict = true;
    } else if (arg === '--no-strict') {
      strict = false;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  return { root: resolve(root), json, strict };
}

function scanRoot(root, strict) {
  const findings = [];
  const seen = new Set();
  const state = { files: 0 };
  walk(root, root, 0, findings, seen, state);
  findings.sort((left, right) => {
    if (left.path !== right.path) {
      return left.path.localeCompare(right.path);
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.rule.localeCompare(right.rule);
  });

  return {
    root: toPosix(root),
    strict,
    scannedFiles: state.files,
    findings,
    status: findings.length === 0 ? 'pass' : 'fail',
  };
}

function walk(dir, root, depth, findings, seen, state) {
  if (depth > MAX_DEPTH || state.files >= MAX_FILES) {
    return;
  }

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (state.files >= MAX_FILES) {
      return;
    }
    if (entry.isSymbolicLink()) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(entry.name)) {
        walk(path, root, depth + 1, findings, seen, state);
      }
      continue;
    }
    if (!entry.isFile() || !isCandidateFile(entry.name)) {
      continue;
    }
    if (scanFile(path, relativePath(root, path), findings, seen)) {
      state.files += 1;
    }
  }
}

function scanFile(path, relPath, findings, seen) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return false;
  }
  if (!stats.isFile() || stats.size > MAX_FILE_BYTES) {
    return false;
  }

  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  if (text.includes('\u0000')) {
    return false;
  }

  const lines = text.split(/\r?\n/);
  const lineStarts = buildLineStarts(text);
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];
    checkCredentialLine(line, relPath, lineNumber, findings, seen);
    checkRenderPlanLine(line, relPath, lineNumber, findings, seen);
    checkProductionMarkerLine(line, relPath, lineNumber, findings, seen);
  }
  checkRawSql(text, lines, lineStarts, relPath, findings, seen);
  return true;
}

function checkCredentialLine(line, relPath, lineNumber, findings, seen) {
  const trimmed = line.trim();
  if (isCommentLine(trimmed)) {
    return;
  }

  for (const match of trimmed.matchAll(CREDENTIAL_LITERAL_PATTERN)) {
    if (hasSensitiveName(match[2]) && isHighEntropyLiteral(match[4])) {
      addFinding(findings, seen, relPath, lineNumber, 'SEC001', 'high', `${match[2]}=[REDACTED]`);
    }
  }
  for (const match of trimmed.matchAll(BARE_CREDENTIAL_LITERAL_PATTERN)) {
    if (hasSensitiveName(match[2]) && isHighEntropyLiteral(match[3])) {
      addFinding(findings, seen, relPath, lineNumber, 'SEC001', 'high', `${match[2]}=[REDACTED]`);
    }
  }
}

function checkRawSql(text, lines, lineStarts, relPath, findings, seen) {
  for (const pattern of [RAW_SQL_PATTERN, RAW_SQL_CONCAT_PATTERN]) {
    for (const match of text.matchAll(pattern)) {
      const lineNumber = lineNumberAt(lineStarts, match.index);
      const line = lines[lineNumber - 1] ?? '';
      addFinding(findings, seen, relPath, lineNumber, 'SEC002', 'high', redactLine(line));
    }
  }
}

function checkRenderPlanLine(line, relPath, lineNumber, findings, seen) {
  if (relPath !== 'infra/render/render.yaml') {
    return;
  }
  const trimmed = line.trim();
  if (trimmed.startsWith('#')) {
    return;
  }
  if (FREE_PLAN_PATTERN.test(trimmed)) {
    addFinding(findings, seen, relPath, lineNumber, 'SEC003', 'medium', redactLine(line));
  }
}

function checkProductionMarkerLine(line, relPath, lineNumber, findings, seen) {
  if (!isStagingDocOrScript(relPath)) {
    return;
  }
  if (DENIAL_PATTERN.test(line)) {
    return;
  }
  for (const marker of PRODUCTION_DATA_MARKERS) {
    if (marker.test(line)) {
      addFinding(findings, seen, relPath, lineNumber, 'SEC004', 'high', '[REDACTED]');
      return;
    }
  }
}

function addFinding(findings, seen, path, line, rule, severity, context) {
  const key = `${rule}|${path}|${line}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  findings.push({ id: `${rule}:${path}:${line}`, path, line, rule, severity, context });
}

function hasSensitiveName(name) {
  const upper = name.toUpperCase();
  return SENSITIVE_NAME_PARTS.some((part) => upper.includes(part));
}

function isHighEntropyLiteral(value) {
  if (typeof value !== 'string' || value.length < MIN_CREDENTIAL_LENGTH) {
    return false;
  }
  if (PLACEHOLDER_PATTERN.test(value) || /^(.)\1+$/.test(value)) {
    return false;
  }
  if (!/[0-9]/.test(value) || !/[A-Za-z]/.test(value)) {
    return false;
  }
  return entropy(value) >= MIN_CREDENTIAL_ENTROPY;
}

function entropy(value) {
  const counts = new Map();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let total = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    total -= probability * Math.log2(probability);
  }
  return total;
}

function isCommentLine(line) {
  return (
    line.startsWith('#') ||
    line.startsWith('//') ||
    line.startsWith('/*') ||
    line.startsWith('*') ||
    line.startsWith('--')
  );
}

function shouldSkipDirectory(name) {
  return SKIP_DIRS.has(name) || (name.startsWith('.') && name !== '.github');
}

function isCandidateFile(name) {
  if (name === 'pnpm-lock.yaml') {
    return false;
  }
  if (name.startsWith('.env') && name !== '.env.example') {
    return false;
  }
  return ALLOWED_FILE_NAMES.has(name) || TEXT_EXTENSIONS.has(extname(name).toLowerCase());
}

function isStagingDocOrScript(relPath) {
  const parts = relPath.split('/');
  return (
    parts[0] === 'docs' ||
    parts.includes('scripts') ||
    parts.some((part) => part.includes('staging'))
  );
}

function relativePath(root, path) {
  return toPosix(relative(root, path));
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function buildLineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

function lineNumberAt(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (starts[middle] <= index) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low + 1;
}

function redactLine(line) {
  const redacted = line.replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '[REDACTED]').trim();
  return redacted.length > MAX_CONTEXT_LENGTH
    ? `${redacted.slice(0, MAX_CONTEXT_LENGTH)}...`
    : redacted;
}
