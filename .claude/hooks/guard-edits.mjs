#!/usr/bin/env node
/**
 * PreToolUse guard for Edit / MultiEdit / Write.
 * Exit code 2 blocks the tool call and sends stderr back to Claude.
 *  1. An already-committed migration must never be modified (ENF-MAI-05) — create a new one instead.
 *  2. Content that looks like a secret must never be written to the repo (ENF-SEC-03).
 */
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const tool = input.tool_input ?? {};
const filePath = tool.file_path ?? '';
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const relative = path.relative(projectDir, path.resolve(projectDir, filePath));

const block = (reason) => {
  process.stderr.write(`Blocked by .claude/hooks/guard-edits.mjs: ${reason}\n`);
  process.exit(2);
};

const isTrackedByGit = (file) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', file], { cwd: projectDir, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

if (relative.startsWith(path.join('database', 'migrations')) && existsSync(filePath) && isTrackedByGit(relative)) {
  block(`${relative} is a committed migration. Create database/migrations/NNN_description.sql instead (see /project:new-migration).`);
}

const written = [tool.content, tool.new_string, ...(tool.edits ?? []).map((e) => e.new_string)].filter(Boolean).join('\n');
const SECRET_PATTERNS = [
  /sk-ant-[a-zA-Z0-9_-]{20,}/, // Anthropic
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /GOCSPX-[0-9A-Za-z_-]{20,}/, // Google OAuth client secret
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
if (SECRET_PATTERNS.some((pattern) => pattern.test(written))) {
  block('the content looks like a real secret. Secrets belong in .env only (ENF-SEC-03).');
}
