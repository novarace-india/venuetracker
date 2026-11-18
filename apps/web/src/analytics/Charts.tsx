import type { ReactNode } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import type { AnalyticsDashboard, GateMetric, SegmentMetric } from '@gatecheck/shared';
import { formatTime } from '../api';
import { Empty } from '../components';
export const palette = [
  '#282462',
  '#E6007D',
  '#3FA9F5',
  '#FBB03B',
  '#C7CC00',
  '#333333',
  '#606060',
];
export const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)}%`);
const zonedChartTime = (value: string, zone: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
export interface Drill {
  outcome?:
    | 'all'
    | 'visited'
    | 'unvisited'
    | 'arrived'
    | 'not_arrived'
    | 'denied'
    | 'duplicate'
    | 'override';
  gateId?: string;
  hour?: number;
  transitionFrom?: string;
  transitionTo?: string;
  funnelStage?: number;
  reason?: string;
  label?: string;
}
export function ChartCard({
  title,
  description,
  children,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel analytics-chart ${className}`}>
      <div className="section-title">
        <div>
          <h2>{title}</h2>
          {description && <p className="small muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function AttendanceRing({
  data,
  onDrill,
}: {
  data: AnalyticsDashboard;
  onDrill: (d: Drill) => void;
}) {
  if (!data.entranceGateId) return <Empty>Set an entrance gate to measure attendance.</Empty>;
  const rows = [
    { name: 'Arrivals in period', value: data.summary.arrived ?? 0 },
    { name: 'No arrival in period', value: data.summary.notArrived ?? 0 },
  ];
  if (!data.summary.registered) return <Empty>No participants match this cohort.</Empty>;
  return (
    <div className="attendance-ring">
      <div className="ring-chart">
        <ResponsiveContainer width="100%" height={215}>
          <PieChart>
            <Pie
              isAnimationActive={false}
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={66}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
              onClick={(_, index) =>
                onDrill({ outcome: index ? 'not_arrived' : 'arrived', label: rows[index].name })
              }
            >
              {rows.map((r, i) => (
                <Cell key={r.name} fill={i ? '#e7edf5' : '#16816a'} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
        <div className="ring-caption">
          <strong>{pct(data.summary.attendancePercent)}</strong>
          <span>attendance</span>
        </div>
      </div>
      <div className="ring-legend">
        {rows.map((r, i) => (
          <button
            key={r.name}
            onClick={() => onDrill({ outcome: i ? 'not_arrived' : 'arrived', label: r.name })}
          >
            <span style={{ background: i ? '#d3deec' : '#16816a' }} />
            {r.name}
            <strong>{r.value}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
export function ArrivalChart({
  data,
  onInterval,
}: {
  data: AnalyticsDashboard;
  onInterval?: (index: number) => void;
}) {
  if (!data.buckets.length) return <Empty>No submitted activity in this period.</Empty>;
  return (
    <ResponsiveContainer width="100%" height={285}>
      <AreaChart
        onClick={(state) => {
          const i = Number(state.activeTooltipIndex);
          if (state.activeTooltipIndex !== null && Number.isInteger(i) && data.buckets[i])
            onInterval?.(i);
        }}
        data={data.buckets}
        margin={{ top: 8, right: 10, left: -18, bottom: 8 }}
      >
        <defs>
          <linearGradient id="arrivals-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16816a" stopOpacity={0.24} />
            <stop offset="100%" stopColor="#16816a" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e4eaf2" />
        <XAxis
          dataKey="end"
          tickFormatter={(v) =>
            new Intl.DateTimeFormat(undefined, {
              timeZone: data.event.timezone,
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short',
            }).format(new Date(v))
          }
          tick={{ fontSize: 10 }}
          minTickGap={40}
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip
          labelFormatter={(v) =>
            `Interval ending ${zonedChartTime(String(v), data.event.timezone)}`
          }
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          isAnimationActive={false}
          dot={data.buckets.length === 1 ? { r: 4 } : false}
          type="stepAfter"
          dataKey="cumulativeArrivals"
          name="Cumulative through interval end"
          stroke="#16816a"
          fill="url(#arrivals-fill)"
          strokeWidth={2.5}
        />
        <Area
          isAnimationActive={false}
          type="monotone"
          dataKey="arrivals"
          name="New arrivals per interval"
          fill="none"
          stroke="#282462"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
export function ParticipationChart({
  gates,
  onDrill,
}: {
  gates: GateMetric[];
  onDrill: (d: Drill) => void;
}) {
  if (!gates.length) return <Empty>Create a gate to analyse participation.</Empty>;
  const sorted = [...gates].sort((a, b) => b.visitors - a.visitors);
  return (
    <ResponsiveContainer width="100%" height={Math.max(230, gates.length * 43)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 4" stroke="#e4eaf2" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10 }}
        />
        <YAxis
          dataKey="name"
          type="category"
          width={110}
          tickFormatter={(v) => (String(v).length > 18 ? String(v).slice(0, 16) + '…' : String(v))}
          tick={{ fontSize: 11 }}
        />
        <Tooltip formatter={(v) => [`${v}%`, 'Registered cohort participation']} />
        <Bar
          isAnimationActive={false}
          dataKey="participationPercent"
          name="Registered cohort participation"
          fill="#282462"
          radius={[0, 5, 5, 0]}
          maxBarSize={18}
          cursor="pointer"
          onClick={(_, index) =>
            onDrill({
              gateId: sorted[index].id,
              outcome: 'visited',
              label: `${sorted[index].name}: visitors`,
            })
          }
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
export function ThroughputChart({
  data,
  onInterval,
}: {
  data: AnalyticsDashboard;
  onInterval?: (index: number) => void;
}) {
  if (!data.buckets.length) return <Empty>No activity for the selected period.</Empty>;
  return (
    <ResponsiveContainer width="100%" height={290}>
      <LineChart
        onClick={(state) => {
          const i = Number(state.activeTooltipIndex);
          if (state.activeTooltipIndex !== null && Number.isInteger(i) && data.buckets[i])
            onInterval?.(i);
        }}
        data={data.buckets}
        margin={{ right: 15, left: -18, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e4eaf2" />
        <XAxis
          dataKey="start"
          tickFormatter={(v) =>
            new Intl.DateTimeFormat(undefined, {
              timeZone: data.event.timezone,
              hour: '2-digit',
              minute: '2-digit',
              month: 'short',
              day: 'numeric',
            }).format(new Date(v))
          }
          tick={{ fontSize: 10 }}
          minTickGap={50}
        />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip labelFormatter={(v) => zonedChartTime(String(v), data.event.timezone)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {data.gates.map((g, i) => (
          <Line
            isAnimationActive={false}
            key={g.id}
            type="monotone"
            dataKey={(b) => b.gates[g.id] ?? 0}
            name={g.name}
            stroke={palette[i % palette.length]}
            strokeWidth={2}
            dot={data.buckets.length === 1 ? { r: 4 } : false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
export function Heatmap({
  data,
  onDrill,
}: {
  data: AnalyticsDashboard;
  onDrill: (d: Drill) => void;
}) {
  if (!data.gates.length) return <Empty>No gates in this selection.</Empty>;
  const max = Math.max(1, ...data.heatmap.map((h) => h.collections));
  const counts = new Map(data.heatmap.map((h) => [`${h.gateId}:${h.hour}`, h.collections]));
  return (
    <div className="heatmap-scroll">
      <div className="heatmap" style={{ gridTemplateColumns: '120px repeat(24,minmax(22px,1fr))' }}>
        <div className="heatmap-label">Local hour</div>
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="heatmap-hour">
            {String(h).padStart(2, '0')}
          </span>
        ))}
        {data.gates.map((g) => (
          <div className="heatmap-row" key={g.id}>
            <span className="heatmap-label">{g.name}</span>
            {Array.from({ length: 24 }, (_, h) => {
              const n = counts.get(`${g.id}:${h}`) ?? 0;
              return (
                <button
                  key={h}
                  aria-label={`${g.name}, ${h}:00: ${n} collections`}
                  title={`${g.name} · ${h}:00–${h}:59 · ${n} net collections`}
                  onClick={() =>
                    onDrill({
                      gateId: g.id,
                      hour: h,
                      outcome: 'visited',
                      label: `${g.name}: ${h}:00–${h}:59 (${data.event.timezone})`,
                    })
                  }
                  style={{
                    background: n ? `rgba(40,36,98,${0.15 + (0.85 * n) / max})` : '#f0f3f8',
                    color: n / max > 0.55 ? '#fff' : '#54708d',
                  }}
                >
                  {n || ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="heatmap-key">
        <span>Fewer</span>
        <i />
        <span>More collections</span>
      </div>
    </div>
  );
}
export function FlowChart({
  data,
  onDrill,
}: {
  data: AnalyticsDashboard;
  onDrill: (d: Drill) => void;
}) {
  const edges = data.transitions;
  if (!edges.length)
    return <Empty>No distinct, ordered first-visit transitions in this selection.</Empty>;
  const nodes = data.gates.filter((g) => edges.some((e) => e.from === g.id || e.to === g.id));
  const height = Math.max(230, nodes.length * 60 + 30);
  const max = Math.max(...edges.map((e) => e.people));
  const position = (id: string) => 40 + nodes.findIndex((n) => n.id === id) * 60;
  const name = (id: string) => nodes.find((n) => n.id === id)?.name ?? '';
  return (
    <div className="flow-scroll">
      <svg
        viewBox={`0 0 760 ${height}`}
        className="flow-svg"
        style={{ height }}
        role="img"
        aria-label="Observed first-visit transitions between gates"
      >
        <text x={15} y={15} className="flow-heading">
          PREVIOUS FIRST VISIT
        </text>
        <text x={560} y={15} className="flow-heading">
          NEXT FIRST VISIT
        </text>
        {edges.map((edge, i) => (
          <path
            key={`${edge.from}:${edge.to}`}
            d={`M 210 ${position(edge.from)} C 350 ${position(edge.from)}, 410 ${position(edge.to)}, 550 ${position(edge.to)}`}
            fill="none"
            stroke={
              palette[
                Math.max(
                  0,
                  nodes.findIndex((n) => n.id === edge.from),
                ) % palette.length
              ]
            }
            strokeWidth={2 + 12 * Math.sqrt(edge.people / max)}
            opacity={0.48}
            tabIndex={0}
            role="button"
            aria-label={`${name(edge.from)} to ${name(edge.to)}: ${edge.people} people`}
            onClick={() =>
              onDrill({
                transitionFrom: edge.from,
                transitionTo: edge.to,
                label: `${name(edge.from)} → ${name(edge.to)}`,
              })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter')
                onDrill({
                  transitionFrom: edge.from,
                  transitionTo: edge.to,
                  label: `${name(edge.from)} → ${name(edge.to)}`,
                });
            }}
          >
            <title>
              {name(edge.from)} → {name(edge.to)}: {edge.people} people; median {edge.medianMinutes}{' '}
              min; P90 {edge.p90Minutes} min
            </title>
          </path>
        ))}
        {nodes.map((node, i) => (
          <g key={node.id}>
            {[0, 1].map((side) => (
              <g
                key={side}
                role="button"
                tabIndex={0}
                aria-label={`Show ${node.name} visitors`}
                onClick={() => onDrill({ gateId: node.id, outcome: 'visited', label: node.name })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')
                    onDrill({ gateId: node.id, outcome: 'visited', label: node.name });
                }}
              >
                <rect
                  x={side ? 550 : 198}
                  y={position(node.id) - 13}
                  width={12}
                  height={26}
                  rx={4}
                  fill={palette[i % palette.length]}
                />
                <text
                  x={side ? 575 : 185}
                  y={position(node.id) + 4}
                  textAnchor={side ? 'start' : 'end'}
                  className="flow-node"
                >
                  {node.name.length > 24 ? node.name.slice(0, 22) + '…' : node.name}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
export function SegmentChart({
  segments,
  onSelect,
}: {
  segments: SegmentMetric[];
  onSelect: (name: string) => void;
}) {
  const rows = segments.slice(0, 10);
  if (!rows.length) return <Empty>No participants in this selection.</Empty>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(230, rows.length * 35)}>
      <BarChart layout="vertical" data={rows} margin={{ right: 16, left: 0 }}>
        <CartesianGrid strokeDasharray="3 4" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tickFormatter={(v) => (String(v).length > 18 ? String(v).slice(0, 16) + '…' : String(v))}
          tick={{ fontSize: 10 }}
        />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar
          isAnimationActive={false}
          dataKey="registered"
          name="Registered"
          fill="#d1deee"
          maxBarSize={14}
          cursor="pointer"
          onClick={(_, index) => onSelect(rows[index].name)}
        />
        <Bar
          isAnimationActive={false}
          dataKey="arrived"
          name="Arrivals"
          fill="#16816a"
          maxBarSize={14}
          cursor="pointer"
          onClick={(_, index) => onSelect(rows[index].name)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
export function FunnelChart({
  data,
  onDrill,
}: {
  data: AnalyticsDashboard;
  onDrill: (d: Drill) => void;
}) {
  if (!data.funnel.length)
    return <Empty>Select an ordered route to analyse sequential completion.</Empty>;
  return (
    <div className="funnel-stages">
      {data.funnel.map((f, i) => (
        <button
          key={f.gateId}
          className="funnel-stage"
          onClick={() => onDrill({ funnelStage: i, label: `Sequential route through ${f.name}` })}
        >
          <span className="funnel-number">{i + 1}</span>
          <div>
            <strong>{f.name}</strong>
            <div className="funnel-track">
              <span style={{ width: `${f.fromStartPercent ?? 0}%` }} />
            </div>
            <small>
              {i ? `${pct(f.fromPreviousPercent)} of previous step` : 'First selected step'}
            </small>
          </div>
          <b>
            {f.people}
            <small>{pct(f.fromStartPercent)} of first step</small>
          </b>
        </button>
      ))}
    </div>
  );
}
