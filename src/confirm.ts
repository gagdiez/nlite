import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import type { Readable, Writable } from 'node:stream';

export async function confirmAll(questions: string[], input: Readable = stdin, output: Writable = stdout): Promise<boolean> {
  const rl = createInterface({ input, output });
  const answers = rl[Symbol.asyncIterator]();
  try {
    for (const question of questions) {
      output.write(`${question} (y/n) `);
      const answer = await answers.next();
      if (answer.done || !['y', 'yes'].includes(answer.value.trim().toLowerCase())) return false;
    }
    return true;
  } finally {
    rl.close();
  }
}
