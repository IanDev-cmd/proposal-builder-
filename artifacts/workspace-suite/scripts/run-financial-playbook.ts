import { formatLivePlaybookReport, runLiveFinancialPlaybook } from '../src/lib/financialPlaybook.ts';

const report = await runLiveFinancialPlaybook();
console.log(formatLivePlaybookReport(report));
if (!report.ok) process.exit(1);
