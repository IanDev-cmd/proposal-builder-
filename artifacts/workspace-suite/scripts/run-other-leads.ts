import { formatLivePlaybookReport, runOtherLiveLeadSample } from '../src/lib/financialPlaybook.ts';

const report = await runOtherLiveLeadSample(10);
console.log(formatLivePlaybookReport(report));
console.log('\n== Compact for Gemini ==');
for (const l of report.leads.filter((r) => r.kind === 'sample')) {
  console.log(
    [
      l.ref,
      l.name,
      l.vessel || '',
      `guests=${l.guests || ''}`,
      `${l.weeklyPeriod || ''} ${l.dayPeriod || ''}`.trim(),
      `${l.departure || ''}–${l.returnTime || ''}`,
      `hours=${l.hours ?? ''}`,
      `margin=${l.marginPercent ?? ''}%`,
      `WEOTT=${(l.weott ?? 0).toFixed(2)}`,
      `IncVAT=${(l.grand ?? 0).toFixed(2)}`,
      `YES=${l.yesLabels.join(' | ')}`,
    ].join('\t'),
  );
}
if (!report.ok) process.exit(1);
