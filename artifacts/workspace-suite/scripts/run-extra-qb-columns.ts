import { formatLivePlaybookReport, runExtraQbColumns } from '../src/lib/financialPlaybook.ts';

const report = await runExtraQbColumns('live');
console.log(formatLivePlaybookReport(report));
if (!report.ok) process.exit(1);
