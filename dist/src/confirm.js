import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
export async function confirmAll(questions, input = stdin, output = stdout) {
    const rl = createInterface({ input, output });
    const answers = rl[Symbol.asyncIterator]();
    try {
        for (const question of questions) {
            output.write(`${question} (y/n) `);
            const answer = await answers.next();
            if (answer.done || !['y', 'yes'].includes(answer.value.trim().toLowerCase()))
                return false;
        }
        return true;
    }
    finally {
        rl.close();
    }
}
