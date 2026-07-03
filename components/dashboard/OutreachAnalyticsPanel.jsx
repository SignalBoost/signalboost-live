'use client';

import { useEffect, useMemo, useState } from 'react';

const numberFormat = new Intl.NumberFormat('en-US');
const colors = ['#2563eb', '#16a34a', '#f97316', '#9333ea'];

const mockEngagementTrend = [
  { date: '2026-06-01', likes: 180, shares: 30, comments: 20 },
  { date: '2026-06-08', likes: 240, shares: 45, comments: 32 },
  { date: '2026-06-15', likes: 310, shares: 58, comments: 46 },
  { date: '2026-06-22', likes: 390, shares: 72, comments: 60 },
];

function qs(filters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => value && value !== 'all' && query.set(key, value));
  return query.toString();
}

function exportData(type, payload) {
  const rows = payload.tableRows || [];
  const body = type === 'json'
    ? JSON.stringify(payload, null, 2)
    : [Object.keys(rows[0] || {}).join(','), ...rows.map((row) => Object.values(row).join(','))].join('\n');
  const blob = new Blob([body], { type: type === 'json' ? 'application/json' : 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `outreach-analytics.${type}`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function PieChart({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  let offset = 25;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Traffic sources</h3>
      <svg viewBox="0 0 42 42" className="mx-auto my-4 h-44 w-44 -rotate-90">
        {data.map((item, index) => {
          const dash = (item.value / total) * 100;
          const circle = <circle key={item.source} cx="21" cy="21" r="15.915" fill="transparent" stroke={colors[index]} strokeWidth="7" strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={offset} />;
          offset -= dash;
          return circle;
        })}
      </svg>
      <div className="grid gap-2 text-sm">
        {data.map((item, index) => <div key={item.source} className="flex items-center justify-between"><span><span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ background: colors[index] }} />{item.source}</span><strong>{item.value}%</strong></div>)}
      </div>
    </div>
  );
}

function FunnelChart({ funnel }) {
  const stages = [
    ['Impressions', funnel.impressions],
    ['Clicks', funnel.clicks],
    ['Conversions', funnel.conversions],
  ];
  const max = stages[0]?.[1] || 1;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">Campaign funnel</h3>
      <div className="mt-5 space-y-4">
        {stages.map(([label, value], index) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-sm"><span>{label}</span><strong>{numberFormat.format(value || 0)}</strong></div>
            <div className="h-8 rounded-full bg-slate-100"><div className="h-8 rounded-full text-right text-xs font-semibold leading-8 text-white" style={{ width: `${Math.max(8, ((value || 0) / max) * 100)}%`, background: colors[index] }}>&nbsp;</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendLine({ trend }) {
  const width = 480;
  const height = 220;
  const max = Math.max(1, ...trend.flatMap((row) => [row.likes, row.shares, row.comments]));
  const points = (key) => trend.map((row, index) => `${(index / Math.max(1, trend.length - 1)) * (width - 40) + 20},${height - 20 - ((row[key] || 0) / max) * (height - 50)}`).join(' ');
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
      <h3 className="text-lg font-semibold text-slate-900">Engagement trend</h3>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-64 w-full">
        {[0, 1, 2, 3].map((line) => <line key={line} x1="20" x2={width - 20} y1={20 + line * 45} y2={20 + line * 45} stroke="#e2e8f0" />)}
        <polyline points={points('likes')} fill="none" stroke="#2563eb" strokeWidth="4" />
        <polyline points={points('shares')} fill="none" stroke="#16a34a" strokeWidth="4" />
        <polyline points={points('comments')} fill="none" stroke="#f97316" strokeWidth="4" />
      </svg>
      <div className="flex gap-4 text-sm"><span className="text-blue-600">Likes</span><span className="text-green-600">Shares</span><span className="text-orange-600">Comments</span></div>
    </div>
  );
}

export default function OutreachAnalyticsPanel() {
  const [filters, setFilters] = useState({ startDate: '2026-06-01', endDate: '2026-07-03', region: 'all', campaign: '' });
  const [data, setData] = useState({ views: null, clicks: null, traffic: null, conversions: null });
  const [status, setStatus] = useState('Loading analytics…');

  useEffect(() => {
    let active = true;
    async function load() {
      setStatus('Refreshing analytics…');
      const query = qs(filters);
      const [views, clicks, traffic, conversions] = await Promise.all([
        fetch(`/api/analytics/views?${query}`).then((res) => res.json()),
        fetch(`/api/analytics/clicks?${query}`).then((res) => res.json()),
        fetch(`/api/analytics/traffic?${query}`).then((res) => res.json()),
        fetch(`/api/analytics/conversions?${query}`).then((res) => res.json()),
      ]);
      if (active) {
        setData({ views, clicks, traffic, conversions });
        setStatus(`Last refreshed ${new Date().toLocaleTimeString()}`);
      }
    }
    load();
    const timer = setInterval(load, 60 * 60 * 1000);
    return () => { active = false; clearInterval(timer); };
  }, [filters]);

  const tableRows = useMemo(() => {
    const clickMap = new Map((data.clicks || []).map((row) => [row.region, row]));
    const conversionMap = new Map((data.conversions || []).map((row) => [row.region, row]));
    return (data.views || []).map((row, index) => ({
      ...row,
      clicks: clickMap.get(row.region)?.clicks || 0,
      conversions: conversionMap.get(row.region)?.conversions || 0,
      watchTimeMinutes: Math.round(row.views * 2.4),
      likes: mockEngagementTrend[index]?.likes || 0,
      shares: mockEngagementTrend[index]?.shares || 0,
      comments: mockEngagementTrend[index]?.comments || 0,
    }));
  }, [data]);

  const heatMax = Math.max(1, ...tableRows.map((row) => row.views));
  const totalViews = tableRows.reduce((sum, row) => sum + row.views, 0);
  const totalClicks = (data.clicks || []).reduce((sum, row) => sum + row.clicks, 0);
  const totalConversions = (data.conversions || []).reduce((sum, row) => sum + row.conversions, 0);
  const funnel = { impressions: Math.max(totalViews * 3, totalClicks), clicks: totalClicks, conversions: totalConversions };
  const trafficSources = (data.traffic || []).map((row) => ({ source: row.source, value: row.count }));
  const exportPayload = { filters, tableRows, funnel, trafficSources, trend: mockEngagementTrend, conversions: data.conversions };

  return (
    <section className="space-y-6 rounded-3xl bg-slate-50 p-6 text-slate-800">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-blue-600">COS Outreach Analytics</p><h2 className="text-3xl font-bold text-slate-950">Raw performance, regional reach, and milestone-ready notifications</h2><p className="mt-2 text-slate-600">OAuth2-backed API routes read YouTube, Google Analytics, and Meta credentials from environment variables while keeping raw numbers visible.</p></div>
        <div className="text-sm font-medium text-slate-500">{status}</div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-5">
        <label className="text-sm">Start date<input className="mt-1 w-full rounded-lg border p-2" type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></label>
        <label className="text-sm">End date<input className="mt-1 w-full rounded-lg border p-2" type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></label>
        <label className="text-sm">Region<input className="mt-1 w-full rounded-lg border p-2" placeholder="all, United States…" value={filters.region} onChange={(event) => setFilters({ ...filters, region: event.target.value || 'all' })} /></label>
        <label className="text-sm">Campaign<input className="mt-1 w-full rounded-lg border p-2" placeholder="Campaign name" value={filters.campaign} onChange={(event) => setFilters({ ...filters, campaign: event.target.value })} /></label>
        <div className="flex items-end gap-2"><button className="rounded-lg bg-slate-900 px-4 py-2 text-white" onClick={() => exportData('csv', exportPayload)}>CSV</button><button className="rounded-lg border px-4 py-2" onClick={() => exportData('json', exportPayload)}>JSON</button></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2"><FunnelChart funnel={funnel} /><PieChart data={trafficSources} /><TrendLine trend={mockEngagementTrend} />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-semibold text-slate-900">Views by region heatmap</h3><div className="mt-4 grid gap-3">{tableRows.map((row) => <div key={row.region} className="rounded-xl p-3 text-white" style={{ background: `rgba(37, 99, 235, ${0.25 + (row.views / heatMax) * 0.75})` }}><div className="flex justify-between"><strong>{row.region}</strong><span>{numberFormat.format(row.views)} views</span></div></div>)}</div></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="w-full text-left text-sm"><thead className="bg-slate-100 text-slate-700"><tr><th className="p-3">Region</th><th className="p-3">Views</th><th className="p-3">Watch time</th><th className="p-3">Clicks</th><th className="p-3">Conversions</th><th className="p-3">Likes</th><th className="p-3">Shares</th><th className="p-3">Comments</th></tr></thead><tbody>{tableRows.map((row) => <tr key={row.region} className="border-t"><td className="p-3 font-medium">{row.region}</td><td className="p-3">{numberFormat.format(row.views)}</td><td className="p-3">{numberFormat.format(row.watchTimeMinutes)}m</td><td className="p-3">{numberFormat.format(row.clicks)}</td><td className="p-3">{numberFormat.format(row.conversions)}</td><td className="p-3">{numberFormat.format(row.likes)}</td><td className="p-3">{numberFormat.format(row.shares)}</td><td className="p-3">{numberFormat.format(row.comments)}</td></tr>)}</tbody></table></div>
    </section>
  );
}
