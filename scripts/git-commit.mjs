import { execSync } from 'child_process';

const cwd = '/Users/masashisasaki/Desktop/名称未設定フォルダ/pace-platform';
const opts = { cwd, stdio: 'inherit' };

try {
  execSync('git add src/lib/auth.ts src/lib/mock-data.ts "src/app/(dashboard)/dashboard/page.tsx" "src/app/(dashboard)/players/page.tsx" "src/app/(dashboard)/players/[id]/page.tsx" "src/app/(dashboard)/schedule/ScheduleClient.tsx" "src/app/(dashboard)/schedule/page.tsx" "src/app/(dashboard)/team-training/page.tsx" "src/app/api/schedule-events/route.ts"', opts);

  const message = `feat: remove mock fallbacks, implement schedule creation, fix ESLint warnings

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`;

  execSync(`git commit -m ${JSON.stringify(message)}`, opts);
  execSync('git push origin main', opts);
  console.log('Done!');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
