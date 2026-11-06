// Levanta la web contra los emuladores. La variable se pasa solo a este proceso:
// en un archivo .env también afectaría al build de producción.
import { spawn } from 'node:child_process';

spawn('npx expo start --web --port 8089', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, EXPO_PUBLIC_USE_EMULATORS: '1' },
}).on('exit', (code) => process.exit(code ?? 0));
