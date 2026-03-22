// Hook PostToolUse: sprawdza TypeScript po edycji plików .ts/.tsx
const { execSync } = require('child_process');

const stripAnsi = s => s.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');

const c = [];
process.stdin.on('data', d => c.push(d));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(c));
  const f = input.tool_input?.file_path || '';

  // Tylko .ts/.tsx, pomijaj schema.prisma
  if (!/\.(tsx?)$/.test(f) || f.includes('schema.prisma')) return;

  try {
    execSync('npx tsc --noEmit', { cwd: 'D:/mes', timeout: 30000, stdio: 'pipe' });
    // Brak błędów — cicho
  } catch (e) {
    const raw = ((e.stdout || Buffer.alloc(0)).toString() +
                 (e.stderr || Buffer.alloc(0)).toString()).trim();
    const lines = stripAnsi(raw).split('\n').slice(0, 30).join('\n');
    if (lines) {
      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `Bledy TypeScript po edycji ${f.split('/').pop()}:\n${lines}`
        }
      }));
    }
  }
});
