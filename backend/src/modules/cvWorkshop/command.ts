import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

const MAX_OUTPUT_BYTES = 1024 * 1024;

/** Runs a program with a fixed list of arguments, never through a shell (ENF-SEC-22). */
export type CommandRunner = (
  file: string,
  args: readonly string[],
  options: { timeoutMs: number },
) => Promise<{ stdout: string }>;

/*
 * The programs get a bare environment: none of the API's secrets (database URL, keys) reaches them, and tesseract
 * runs on one thread, which keeps its memory within a small container.
 */
const commandEnvironment = (): NodeJS.ProcessEnv => ({ PATH: process.env['PATH'], OMP_THREAD_LIMIT: '1' });

/** The default runner: `execFile`, killed without mercy once its time is up. */
export const runWithExecFile: CommandRunner = (file, args, { timeoutMs }) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
        encoding: 'utf8',
        env: commandEnvironment(),
      },
      (error, stdout) => {
        if (error) reject(error);
        else resolve({ stdout });
      },
    );
  });

/** Whether an `execFile` error is the kill of a program that ran out of time. */
export const isTimeout = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'killed' in error && error.killed === true;

/**
 * Runs `work` in a private folder (0700, `mkdtemp`) under `tempRoot`, removed once it ends, whatever the outcome.
 * @req ENF-SEC-22
 */
export const withPrivateFolder = async <T>(
  tempRoot: string,
  prefix: string,
  work: (folder: string) => Promise<T>,
): Promise<T> => {
  const folder = await mkdtemp(join(tempRoot, prefix));
  try {
    return await work(folder);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
};
