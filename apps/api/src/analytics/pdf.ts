import { BRAND, brandLogoPath } from '../brand.js';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import type { AnalyticsReport, ParticipantJourney } from '@gatecheck/shared';
import { localLabel } from './time.js';
const NAVY = BRAND.colors.indigo,
  BLUE = BRAND.colors.indigo,
  TEAL = '#16816a',
  MUTED = '#61758b',
  LIGHT = '#eef3f9',
  AMBER = '#9b6509';
const rate = (v: number | null) => (v === null ? 'N/A' : `${v.toFixed(1)}%`);
export async function pdfReport(r: AnalyticsReport, journey?: ParticipantJourney): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      bufferPages: true,
      info: {
        Title: `${r.event.name} - NovaRace Flow analytics`,
        Author: BRAND.name,
        Subject: 'Participant attendance, gate performance and recorded journeys',
      },
    });
    doc.registerFont(
      'ReportRegular',
      fileURLToPath(new URL('../../assets/fonts/NotoSans-Regular.ttf', import.meta.url)),
    );
    doc.registerFont(
      'ReportBold',
      fileURLToPath(new URL('../../assets/fonts/NotoSans-Bold.ttf', import.meta.url)),
    );
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const WIDTH = doc.page.width - 84,
      HEIGHT = doc.page.height;
    let y = 0;
    const text = (
      value: unknown,
      x: number,
      top: number,
      width: number,
      size = 9,
      color: string = NAVY,
      bold = false,
    ) => {
      doc
        .font(bold ? 'ReportBold' : 'ReportRegular')
        .fontSize(size)
        .fillColor(color)
        .text(String(value ?? 'N/A'), x, top, { width, lineGap: 2 });
    };
    const title = (label: string, sub: string) => {
      doc.roundedRect(42, 20, WIDTH, 35, 4).fill(BRAND.colors.indigo);
      doc.image(brandLogoPath, 49, 24, { width: 66, height: 27 });
      text(BRAND.product, 129, 27, 90, 15, '#ffffff', true);
      text('EVENT ANALYTICS', WIDTH - 70, 31, 100, 7, '#ffffff', true);
      text(label, 42, 66, WIDTH, 23, NAVY, true);
      text(sub, 42, 98, WIDTH, 9, MUTED);
      y = 124;
    };
    const page = (label: string, sub: string) => {
      doc.addPage();
      title(label, sub);
    };
    const ensure = (height: number) => {
      if (y + height > HEIGHT - 60) page('Report continued', r.event.name);
    };
    const paragraph = (value: string, size = 9) => {
      doc.font('ReportRegular').fontSize(size);
      const h = doc.heightOfString(value, { width: WIDTH, lineGap: 3 });
      ensure(h + 14);
      text(value, 42, y, WIDTH, size, MUTED);
      y += h + 15;
    };
    const heading = (value: string) => {
      ensure(36);
      text(value, 42, y, WIDTH, 12, NAVY, true);
      y += 25;
    };
    const gateName = (id: string) => r.allGates.find((g) => g.id === id)?.name ?? id;
    function table(headers: string[], rows: (string | number | null)[][], widths: number[]) {
      function header() {
        ensure(45);
        doc.rect(42, y, WIDTH, 30).fill(NAVY);
        let x = 42;
        for (let i = 0; i < headers.length; i++) {
          text(headers[i], x + 7, y + 7, widths[i] - 14, 8, '#ffffff', true);
          x += widths[i];
        }
        y += 30;
      }
      header();
      if (!rows.length) {
        paragraph('No records in this selection.');
        return;
      }
      for (const row of rows) {
        const heights = row.map((v, i) => {
          doc.font('ReportRegular').fontSize(8);
          return doc.heightOfString(String(v ?? 'N/A'), { width: widths[i] - 14, lineGap: 2 });
        });
        const height = Math.max(25, ...heights.map((h) => h + 14));
        if (y + height > HEIGHT - 62) {
          page('Report continued', r.event.name);
          header();
        }
        doc.rect(42, y, WIDTH, height).fill(row === rows[0] ? LIGHT : '#ffffff');
        let x = 42;
        row.forEach((v, i) => {
          text(v, x + 7, y + 7, widths[i] - 14, 8);
          x += widths[i];
        });
        doc
          .moveTo(42, y + height)
          .lineTo(42 + WIDTH, y + height)
          .strokeColor('#dce5ef')
          .lineWidth(0.4)
          .stroke();
        y += height;
      }
      y += 18;
    }
    function bars(
      rows: { name: string; value: number }[],
      maximum: number = 100,
      height: number = 150,
      suffix = '%',
    ) {
      ensure(height + 28);
      if (!rows.length) {
        paragraph('No data in this selection.');
        return;
      }
      const labelWidth = 145,
        chartWidth = WIDTH - labelWidth - 50;
      const rowHeight = Math.min(27, height / rows.length);
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i],
          top = y + i * rowHeight;
        let label = row.name;
        doc.font('ReportRegular').fontSize(8);
        while (
          label.length > 1 &&
          doc.widthOfString(label + (label.length < row.name.length ? '...' : '')) > labelWidth - 8
        )
          label = label.slice(0, -1);
        text(label + (label.length < row.name.length ? '...' : ''), 42, top + 3, labelWidth - 8, 8);
        doc.roundedRect(42 + labelWidth, top + 4, chartWidth, 10, 3).fill(LIGHT);
        if (row.value > 0)
          doc
            .roundedRect(
              42 + labelWidth,
              top + 4,
              Math.max(2, Math.min(1, row.value / Math.max(1, maximum)) * chartWidth),
              10,
              3,
            )
            .fill(BLUE);
        text(
          `${Math.round(row.value * 10) / 10}${suffix}`,
          42 + labelWidth + chartWidth + 8,
          top + 2,
          45,
          8,
        );
      }
      y += rows.length * rowHeight + 18;
    }
    function lineChart() {
      ensure(155);
      const top = y + 8,
        left = 75,
        w = WIDTH - 48,
        h = 100;
      const max = Math.max(1, ...r.buckets.map((b) => b.cumulativeArrivals));
      const ticks = Math.min(4, max);
      for (let i = 0; i <= ticks; i++) {
        const yy = top + h - (i * h) / ticks;
        doc
          .moveTo(left, yy)
          .lineTo(left + w, yy)
          .strokeColor('#e2e9f1')
          .lineWidth(0.5)
          .stroke();
        text(Math.round((max * i) / ticks), 42, yy - 4, 28, 8, MUTED);
      }
      if (r.buckets.length) {
        doc.lineWidth(2).strokeColor(TEAL);
        r.buckets.forEach((b, i) => {
          const x = left + (r.buckets.length === 1 ? 0 : (i / (r.buckets.length - 1)) * w),
            yy = top + h - (b.cumulativeArrivals / max) * h;
          i ? doc.lineTo(x, yy) : doc.moveTo(x, yy);
        });
        doc.stroke();
        if (r.buckets.length === 1)
          doc.circle(left, top + h - (r.buckets[0].cumulativeArrivals / max) * h, 3).fill(TEAL);
        const indices = Array.from(
          new Set([0, Math.floor((r.buckets.length - 1) / 2), r.buckets.length - 1]),
        );
        for (const i of indices) {
          const x = left + (r.buckets.length === 1 ? 0 : (i / (r.buckets.length - 1)) * w);
          text(
            localLabel(r.buckets[i].end, r.event.timezone),
            Math.max(42, Math.min(left + w - 95, x - 35)),
            top + h + 10,
            100,
            7,
            MUTED,
          );
        }
      }
      y = top + h + 42;
    }
    title('Attendance and gate performance', r.event.name);
    const filterLabel = [
      `Snapshot: ${r.generatedAt} | Event timezone: ${r.event.timezone} | Time basis: ${r.filters.timeBasis === 'server' ? 'server confirmation' : 'unverified device capture (fallbacks disclosed)'}`,
      `Period: ${r.filters.from ?? 'all recorded activity'} to ${r.filters.to ?? 'latest submitted activity'} (To is exclusive)`,
      `Cohort: ${r.filters.cohort}; ticket: ${r.filters.ticketType ?? 'all'}; company: ${r.filters.company ?? 'all'}`,
      `Gates: ${r.gates.length} selected (listed in gate scorecards)`,
      `Participant: ${r.filters.participantId ?? (r.filters.q || 'all')}`,
    ];
    paragraph(filterLabel.join('\n'), 8);
    const cards = [
      ['Attendance', rate(r.summary.attendancePercent)],
      ['Arrivals / registered', `${r.summary.arrived ?? 'N/A'} / ${r.summary.registered}`],
      ['Net collections', String(r.summary.collections)],
      ['Any gate visitors', String(r.summary.anyGateVisitors)],
      ['Scan success', rate(r.summary.successPercent)],
      ['Rejected / duplicate', `${r.summary.denied} / ${r.summary.duplicates}`],
    ];
    ensure(132);
    cards.forEach(([label, value], i) => {
      const x = 42 + (i % 3) * (WIDTH / 3 + 1),
        top = y + Math.floor(i / 3) * 63;
      doc.roundedRect(x, top, WIDTH / 3 - 9, 55, 6).fill(LIGHT);
      text(label, x + 10, top + 9, WIDTH / 3 - 29, 8, MUTED);
      text(value, x + 10, top + 26, WIDTH / 3 - 29, 17, NAVY, true);
    });
    y += 137;
    heading('Cumulative first arrivals in the selected period');
    paragraph(
      'Points show cumulative arrivals through each interval end, using submitted records in this snapshot.',
      8,
    );
    if (r.entranceGateId) lineChart();
    else
      paragraph(
        'Configure an entrance gate in Analytics settings to measure attendance. Any-gate visitors are a separate metric.',
      );
    heading('Leadership observations (up to 4)');
    for (const i of r.insights.slice(0, 4)) paragraph(`${i.title}: ${i.detail}`);
    page(
      'Gate scorecards',
      'Unique visitors, net collections and participation use the same selected cohort and period.',
    );
    paragraph(
      'Cohort % = unique gate visitors / registered cohort. Arrival % = gate visitors within the arrival cohort / arrivals. Scan % = successful attempts / all attempts, including successes later undone. Targets are current participation targets; optional counters should be interpreted accordingly.',
    );
    table(
      ['Gate', 'People', 'Net qty', 'Cohort %', 'Arrival %', 'Scan %', 'Target'],
      r.gates.map((g) => [
        g.name,
        g.visitors,
        g.collections,
        rate(g.participationPercent),
        rate(g.attendeeConversionPercent),
        rate(g.successPercent),
        g.targetPercent === null ? 'Unrated' : `${rate(g.targetPercent)} ${g.targetStatus}`,
      ]),
      [131, 43, 46, 57, 57, 57, WIDTH - 391],
    );
    heading('Gate participation - top 10 by unique visitors');
    bars(
      [...r.gates]
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 10)
        .map((g) => ({ name: g.name, value: g.participationPercent ?? 0 })),
      100,
      230,
    );
    heading('Peak 15-minute demand by gate');
    table(
      ['Gate', 'Peak interval start (event timezone)', 'Net collections'],
      r.gates.map((g) => [
        g.name,
        g.peak ? localLabel(g.peak.start, r.event.timezone) : 'No activity',
        g.peak?.collections ?? 0,
      ]),
      [150, WIDTH - 220, 70],
    );
    page(
      'Participant movement',
      'First-visit routes and sequential completion help explain recorded participant flow.',
    );
    paragraph(
      'Transitions use consecutive first visits in the selected period. Repeated gate visits are excluded, and tied timestamps have no inferred order. Elapsed minutes measure time between scans, not queue or service time.',
    );
    table(
      ['From', 'To', 'People', 'Median min', 'P90 min'],
      r.transitions
        .slice(0, 20)
        .map((t) => [gateName(t.from), gateName(t.to), t.people, t.medianMinutes, t.p90Minutes]),
      [135, 135, 55, 85, WIDTH - 410],
    );
    heading('Selected ordered funnel');
    if (r.funnel.length)
      table(
        ['Step', 'Sequential visitors', 'From previous', 'From first'],
        r.funnel.map((f) => [
          f.name,
          f.people,
          rate(f.fromPreviousPercent),
          rate(f.fromStartPercent),
        ]),
        [180, 100, 110, WIDTH - 390],
      );
    else
      paragraph(
        'No ordered funnel selected. Independent counters are not automatically treated as a linear funnel.',
      );
    heading('Ticket segments - top 10 by registrations');
    table(
      ['Ticket type', 'Registered', 'Arrivals', 'Attendance'],
      r.segments.ticketTypes
        .slice(0, 10)
        .map((s) => [
          s.name,
          s.registered,
          r.entranceGateId ? s.arrived : null,
          rate(s.attendancePercent),
        ]),
      [200, 95, 95, WIDTH - 390],
    );
    heading('Company segments - top 10 by registrations');
    table(
      ['Company', 'Registered', 'Arrivals', 'Attendance'],
      r.segments.companies
        .slice(0, 10)
        .map((s) => [
          s.name,
          s.registered,
          r.entranceGateId ? s.arrived : null,
          rate(s.attendancePercent),
        ]),
      [200, 95, 95, WIDTH - 390],
    );
    paragraph(
      'The PDF shows up to 20 transitions and 10 segments per grouping. Download Excel for complete filtered detail.',
    );
    page(
      'Exceptions and data quality',
      'Use these details to investigate process issues before changing gate rules.',
    );
    table(
      ['Exception / audit category', 'Count'],
      r.exceptions.map((e) => [e.reason, e.count]),
      [WIDTH - 75, 75],
    );
    heading('Device activity');
    table(
      ['Tablet', 'Gate', 'Attempts', 'Scan success', 'Last seen (event timezone)'],
      r.devices.map((d) => [
        d.name,
        gateName(d.gateId),
        d.attempts,
        rate(d.successPercent),
        d.lastSeen ? localLabel(d.lastSeen, r.event.timezone) : 'Never',
      ]),
      [110, 100, 60, 75, WIDTH - 345],
    );
    paragraph(
      `Unassigned pass attempts: ${r.quality.unknownPassAttempts}. Capture times used: ${r.quality.captureTimesUsed}; fallbacks: ${r.quality.captureFallbacks}. Median / P90 reported capture-to-confirmation delay: ${r.quality.medianCaptureDelaySeconds ?? 'N/A'} / ${r.quality.p90CaptureDelaySeconds ?? 'N/A'} seconds. Ambiguous transition pairs omitted: ${r.quality.ambiguousTransitions}.`,
    );
    page('Metric definitions', 'Denominators, timing and limits of the recorded evidence.');
    for (const n of r.quality.notes) paragraph(n, 8);
    if (journey) {
      page('Participant journey', `${journey.participant.fullName} | ${journey.participant.email}`);
      paragraph(
        `Gates visited in period: ${journey.summary.completed} / ${journey.summary.total}. Recorded visit span: ${journey.summary.elapsedMinutes ?? 'N/A'} minutes. This is not measured queue waiting time.`,
      );
      table(
        ['Gate', 'In-period state', 'First visit (event timezone)', 'Net qty'],
        journey.gates.map((g) => [
          g.name,
          g.state.replaceAll('_', ' '),
          g.firstVisitAt ? localLabel(g.firstVisitAt, r.event.timezone) : 'No visit in period',
          g.collections,
        ]),
        [150, 110, WIDTH - 310, 50],
      );
      heading('Recorded attempts');
      table(
        ['Analysis time', 'Gate', 'Result', 'Detail'],
        journey.timeline.map((s) => [
          localLabel(s.time, r.event.timezone),
          gateName(s.gateId),
          s.status,
          `${s.message}${s.manual ? ` (manual: ${s.reason})` : ''}${s.undoneAt ? ` (undone ${s.undoneAt} by ${s.undoActorEmail ?? s.undoneBy ?? 'admin'}: ${s.undoReason}; reset ${s.resetId ?? 'legacy'})` : ''}`,
        ]),
        [110, 105, 65, WIDTH - 280],
      );
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc
        .moveTo(42, HEIGHT - 37)
        .lineTo(42 + WIDTH, HEIGHT - 37)
        .strokeColor('#dce5ef')
        .lineWidth(0.5)
        .stroke();
      text(
        'NovaRace Flow | Filtered snapshot | Full detail available in Excel',
        42,
        HEIGHT - 29,
        WIDTH - 55,
        7,
        MUTED,
      );
      text(`${i + 1} / ${range.count}`, 42 + WIDTH - 45, HEIGHT - 29, 45, 7, MUTED);
      doc.page.margins.bottom = savedBottom;
    }
    doc.end();
  });
}
