import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GOOGLE_CLIENT_ID_PLACEHOLDER = 'your-google-oauth-client-id.apps.googleusercontent.com';

const ALLOWED_BROWSER_KEYS = new Set([
  'VITE_GOOGLE_CLIENT_ID',
]);

const SERVER_ONLY_KEYS = new Set([
  'APP_RETURN_URL',
  'CALENDAR_CRON_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_STATE_SECRET',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_SERVICE_ROLE_KEY',
]);

function assignedEnvironmentEntries(source) {
  return source
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) return null;
      return { key: match[1], value: match[2].trim(), line: index + 1 };
    })
    .filter(Boolean);
}

function browserKeyErrors(entries, sourceLabel) {
  const errors = [];
  for (const entry of entries) {
    if (entry.key.startsWith('VITE_') && !ALLOWED_BROWSER_KEYS.has(entry.key)) {
      errors.push(
        `${sourceLabel}:${entry.line} 不允許 ${entry.key}。公開前端只允許 VITE_GOOGLE_CLIENT_ID；VITE_ 值會被打包進瀏覽器。`,
      );
    }
  }
  return errors;
}

export function validateRuntimeEnvironment(environment = process.env) {
  const entries = Object.entries(environment).map(([key, value]) => ({
    key,
    value: String(value ?? ''),
    line: 0,
  }));
  const errors = browserKeyErrors(entries, 'process.env');
  const clientId = environment.VITE_GOOGLE_CLIENT_ID?.trim();

  if (clientId) {
    if (clientId === GOOGLE_CLIENT_ID_PLACEHOLDER) {
      errors.push('VITE_GOOGLE_CLIENT_ID 仍是範例值，請在部署平台設定真正的 Web OAuth Client ID。');
    } else if (!/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      errors.push('VITE_GOOGLE_CLIENT_ID 格式不正確，必須以 .apps.googleusercontent.com 結尾。');
    }
  }

  return errors;
}

export function validateEnvironmentFile(source, sourceLabel, options = {}) {
  const entries = assignedEnvironmentEntries(source);
  const errors = browserKeyErrors(entries, sourceLabel);

  for (const entry of entries) {
    if (SERVER_ONLY_KEYS.has(entry.key)) {
      errors.push(
        `${sourceLabel}:${entry.line} 不應包含 ${entry.key}。伺服器設定只能放在 Supabase Edge Function secrets。`,
      );
    }
  }

  if (options.template) {
    const clientIdEntries = entries.filter((entry) => entry.key === 'VITE_GOOGLE_CLIENT_ID');
    if (clientIdEntries.length !== 1 || clientIdEntries[0].value !== GOOGLE_CLIENT_ID_PLACEHOLDER) {
      errors.push(
        `${sourceLabel} 必須保留 VITE_GOOGLE_CLIENT_ID 的公開範例值；請複製為 .env.local 後再填入真實 Client ID。`,
      );
    }
  }

  return errors;
}

export function validateGitIgnore(source, sourceLabel = '.gitignore') {
  const lines = new Set(source.split(/\r?\n/).map((line) => line.trim()));
  const errors = [];
  if (!lines.has('.env') || !lines.has('.env.*')) {
    errors.push(`${sourceLabel} 必須忽略 .env 與 .env.*。`);
  }
  if (!lines.has('!.env.example')) {
    errors.push(`${sourceLabel} 必須只讓不含真實值的 .env.example 進入版本控制。`);
  }
  return errors;
}

function environmentFiles(projectRoot) {
  return readdirSync(projectRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (entry.name === '.env' || entry.name.startsWith('.env.')))
    .map((entry) => entry.name)
    .sort();
}

export function validatePublicEnvironment(projectRoot = process.cwd()) {
  const errors = validateRuntimeEnvironment();
  const files = environmentFiles(projectRoot);

  if (!files.includes('.env.example')) {
    errors.push('.env.example 不存在，缺少安全的前端設定範例。');
  }

  for (const fileName of files) {
    const source = readFileSync(resolve(projectRoot, fileName), 'utf8');
    errors.push(...validateEnvironmentFile(source, fileName, { template: fileName === '.env.example' }));
  }

  const gitIgnorePath = resolve(projectRoot, '.gitignore');
  if (!existsSync(gitIgnorePath)) {
    errors.push('.gitignore 不存在，無法確認本機環境檔不會被提交。');
  } else {
    errors.push(...validateGitIgnore(readFileSync(gitIgnorePath, 'utf8')));
  }

  return errors;
}

function run() {
  const errors = validatePublicEnvironment();
  if (errors.length > 0) {
    console.error('公開版環境變數安全檢查失敗：');
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('公開版環境變數安全檢查通過。');
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedFile && pathToFileURL(invokedFile).href === pathToFileURL(currentFile).href) run();
