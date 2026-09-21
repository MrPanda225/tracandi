#!/usr/bin/env node
/** PostToolUse: formats the edited TS/TSX file with the Prettier of its package. Never blocks. */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const { tool_input: tool = {} } = JSON.parse(readFileSync(0, 'utf8'));
const filePath = tool.file_path ?? '';
if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const packageName = path.relative(projectDir, filePath).split(path.sep)[0];
const prettier = path.join(projectDir, packageName, 'node_modules', '.bin', 'prettier');
if (!existsSync(prettier)) process.exit(0);

try {
  execFileSync(prettier, ['--write', '--config', path.join(projectDir, '.prettierrc.json'), filePath], { stdio: 'ignore' });
} catch {
  // Formatting failures must not interrupt the session; lint will report them.
}
