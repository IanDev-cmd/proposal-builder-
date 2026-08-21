import { formatLivePlaybookReport, runLiveFinancialPlaybook } from '../src/lib/financialPlaybook.ts';

const mode = process.env.PLAYBOOK_MODE === 'demo' ? 'demo' : 'live';
const report = await runLiveFinancialPlaybook(mode);
console.log(formatLivePlaybookReport(report));
if (!report.ok) process.exit(1);
