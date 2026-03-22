// Hook PostToolUse: uruchamia prisma db push po edycji schema.prisma
const { execSync } = require('child_process');

const stripAnsi = s => s.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');

const c = [];
process.stdin.on('data', d => c.push(d));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(c));
  const f = input.tool_input?.file_path || '';

  if (!f.includes('schema.prisma')) return;

  try {
    const raw = execSync('npx prisma db push 2>&1', {
      cwd: 'D:/mes',
      timeout: 60000,
      stdio: 'pipe'
    }).toString().trim();

    const out = stripAnsi(raw);
    // Weź ostatnią linię sukcesu
    const success = out.split('\n').find(l => l.includes('in sync') || l.includes('Done')) || out.split('\n').pop();
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `prisma db push: ${success.trim()}`
      }
    }));
  } catch (e) {
    const raw = ((e.stdout || Buffer.alloc(0)).toString() +
                 (e.stderr || Buffer.alloc(0)).toString()).trim();
    const out = stripAnsi(raw);
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `prisma db push FAILED:\n${out.split('\n').slice(0, 20).join('\n')}`
      }
    }));
  }
});
