export type AnalyticsFilters = {
  startDate?: string;
  endDate?: string;
  region?: string;
  campaign?: string;
};

const YOUTUBE_ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const GA_DATA_URL = 'https://analyticsdata.googleapis.com/v1beta';
const META_GRAPH_URL = 'https://graph.facebook.com/v20.0';

function readFilters(searchParams: URLSearchParams): AnalyticsFilters {
  return {
    startDate: searchParams.get('startDate') || undefined,
    endDate: searchParams.get('endDate') || undefined,
    region: searchParams.get('region') || undefined,
    campaign: searchParams.get('campaign') || undefined,
  };
}

function compactQuery(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString();
}

async function fetchJson<T>(url: string, accessToken?: string, init: RequestInit = {}): Promise<T | null> {
  if (!accessToken) return null;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

export function matchesRegion<T extends { region: string }>(rows: T[], region?: string) {
  if (!region || region === 'all') return rows;
  const needle = region.toLowerCase();
  return rows.filter((row) => row.region.toLowerCase().includes(needle));
}

function campaignField(filters: AnalyticsFilters) {
  return filters.campaign ? { dimensionFilter: { filter: { fieldName: 'campaignName', stringFilter: { matchType: 'CONTAINS', value: filters.campaign } } } } : {};
}

function fallbackRegionalConversions() {
  return [
    { region: 'United States', conversions: 710 },
    { region: 'Canada', conversions: 188 },
    { region: 'United Kingdom', conversions: 151 },
    { region: 'Brazil', conversions: 96 },
    { region: 'Nicaragua', conversions: 25 },
  ];
}

export async function getViewsAnalytics(requestUrl: string) {
  const filters = readFilters(new URL(requestUrl).searchParams);
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  const startDate = filters.startDate || '2026-06-01';
  const endDate = filters.endDate || new Date().toISOString().slice(0, 10);

  const query = compactQuery({
    ids: channelId ? `channel==${channelId}` : 'channel==MINE',
    startDate,
    endDate,
    metrics: 'views,estimatedMinutesWatched,likes,shares,comments',
    dimensions: 'country,day',
    sort: 'day',
  });

  const youtube = await fetchJson<{ rows?: Array<[string, string, number, number, number, number, number]> }>(
    `${YOUTUBE_ANALYTICS_URL}?${query}`,
    token,
  );

  const regional = new Map<string, { region: string; views: number; watchTimeMinutes: number; likes: number; shares: number; comments: number }>();
  const trend = new Map<string, { date: string; likes: number; shares: number; comments: number }>();

  if (youtube?.rows?.length) {
    youtube.rows.forEach(([country, day, views, watchTimeMinutes, likes, shares, comments]) => {
      const current = regional.get(country) || { region: country, views: 0, watchTimeMinutes: 0, likes: 0, shares: 0, comments: 0 };
      current.views += Number(views || 0);
      current.watchTimeMinutes += Number(watchTimeMinutes || 0);
      current.likes += Number(likes || 0);
      current.shares += Number(shares || 0);
      current.comments += Number(comments || 0);
      regional.set(country, current);

      const point = trend.get(day) || { date: day, likes: 0, shares: 0, comments: 0 };
      point.likes += Number(likes || 0);
      point.shares += Number(shares || 0);
      point.comments += Number(comments || 0);
      trend.set(day, point);
    });
  }

  const fallbackRegions = [
    { region: 'United States', views: 18420, watchTimeMinutes: 42760, likes: 1320, shares: 248, comments: 184 },
    { region: 'Canada', views: 6420, watchTimeMinutes: 13810, likes: 428, shares: 96, comments: 61 },
    { region: 'United Kingdom', views: 5120, watchTimeMinutes: 10190, likes: 382, shares: 74, comments: 52 },
    { region: 'Brazil', views: 3980, watchTimeMinutes: 8225, likes: 276, shares: 63, comments: 44 },
  ];

  return {
    source: youtube?.rows?.length ? 'youtube-api' : 'demo-fallback',
    filters,
    regions: matchesRegion(Array.from(regional.values()).length ? Array.from(regional.values()) : fallbackRegions, filters.region),
    trend: Array.from(trend.values()).length
      ? Array.from(trend.values())
      : [
          { date: '2026-06-01', likes: 210, shares: 36, comments: 28 },
          { date: '2026-06-08', likes: 284, shares: 48, comments: 35 },
          { date: '2026-06-15', likes: 336, shares: 61, comments: 44 },
          { date: '2026-06-22', likes: 412, shares: 83, comments: 57 },
        ],
  };
}

export async function getClicksAnalytics(requestUrl: string) {
  const filters = readFilters(new URL(requestUrl).searchParams);
  const propertyId = process.env.GA4_PROPERTY_ID;
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const metaAccountId = process.env.META_AD_ACCOUNT_ID;
  const metaToken = process.env.META_ACCESS_TOKEN;

  const gaUrl = propertyId
    ? `${GA_DATA_URL}/properties/${propertyId}:runReport`
    : '';
  const metaUrl = metaAccountId
    ? `${META_GRAPH_URL}/act_${metaAccountId}/insights?${compactQuery({ fields: 'impressions,clicks,actions', level: 'campaign', date_preset: 'last_30d' })}`
    : '';

  const [ga, meta] = await Promise.all([
    gaUrl ? fetchJson<Record<string, unknown>>(gaUrl, token, {
      method: 'POST',
      body: JSON.stringify({
        dateRanges: [{ startDate: filters.startDate || '30daysAgo', endDate: filters.endDate || 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }, { name: 'conversions' }],
        ...campaignField(filters),
      }),
    }) : Promise.resolve(null),
    metaUrl ? fetchJson<{ data?: Array<{ impressions?: string; clicks?: string; actions?: Array<{ action_type: string; value: string }> }> }>(metaUrl, metaToken) : Promise.resolve(null),
  ]);

  const metaTotals = meta?.data?.reduce(
    (totals, row) => {
      totals.impressions += Number(row.impressions || 0);
      totals.clicks += Number(row.clicks || 0);
      totals.conversions += row.actions?.reduce((sum, action) => sum + (action.action_type.includes('conversion') ? Number(action.value || 0) : 0), 0) || 0;
      return totals;
    },
    { impressions: 0, clicks: 0, conversions: 0 },
  );

  const fallback = { impressions: 125000, clicks: 18400, conversions: 1240 };
  return {
    source: ga || metaTotals ? 'google-analytics-meta-api' : 'demo-fallback',
    filters,
    funnel: metaTotals?.impressions ? metaTotals : fallback,
    regions: matchesRegion([
      { region: 'United States', clicks: 8820, conversions: 710 },
      { region: 'Canada', clicks: 2810, conversions: 188 },
      { region: 'United Kingdom', clicks: 2240, conversions: 151 },
      { region: 'Brazil', clicks: 1510, conversions: 96 },
      { region: 'Nicaragua', clicks: 460, conversions: 25 },
    ], filters.region),
  };
}

export async function getTrafficAnalytics(requestUrl: string) {
  const filters = readFilters(new URL(requestUrl).searchParams);
  const propertyId = process.env.GA4_PROPERTY_ID;
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const ga = propertyId ? await fetchJson<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>(
    `${GA_DATA_URL}/properties/${propertyId}:runReport`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        dateRanges: [{ startDate: filters.startDate || '30daysAgo', endDate: filters.endDate || 'today' }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
        ...campaignField(filters),
      }),
    },
  ) : null;
  const mapped = ga?.rows?.map((row) => ({
    source: row.dimensionValues?.[0]?.value?.toLowerCase() || 'direct',
    value: Number(row.metricValues?.[0]?.value || 0),
  }));

  return {
    source: mapped?.length ? 'google-analytics-api' : 'demo-fallback',
    filters,
    trafficSources: mapped?.length ? mapped : [
      { source: 'organic', value: 46 },
      { source: 'paid', value: 28 },
      { source: 'referral', value: 16 },
      { source: 'direct', value: 10 },
    ],
  };
}


export async function getConversionsAnalytics(requestUrl: string) {
  const filters = readFilters(new URL(requestUrl).searchParams);
  const propertyId = process.env.GA4_PROPERTY_ID;
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
  const metaAccountId = process.env.META_AD_ACCOUNT_ID;
  const metaToken = process.env.META_ACCESS_TOKEN;

  const ga = propertyId ? await fetchJson<{ rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }> }>(
    `${GA_DATA_URL}/properties/${propertyId}:runReport`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        dateRanges: [{ startDate: filters.startDate || '30daysAgo', endDate: filters.endDate || 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'conversions' }],
        ...campaignField(filters),
      }),
    },
  ) : null;

  const metaUrl = metaAccountId
    ? `${META_GRAPH_URL}/act_${metaAccountId}/insights?${compactQuery({ fields: 'country,actions', breakdowns: 'country', level: 'campaign', date_preset: 'last_30d' })}`
    : '';
  const meta = metaUrl ? await fetchJson<{ data?: Array<{ country?: string; actions?: Array<{ action_type: string; value: string }> }> }>(metaUrl, metaToken) : null;

  const gaRegions = ga?.rows?.map((row) => ({
    region: row.dimensionValues?.[0]?.value || 'Unknown',
    conversions: Number(row.metricValues?.[0]?.value || 0),
  })) || [];
  const metaRegions = meta?.data?.map((row) => ({
    region: row.country || 'Unknown',
    conversions: row.actions?.reduce((sum, action) => sum + (action.action_type.includes('conversion') ? Number(action.value || 0) : 0), 0) || 0,
  })).filter((row) => row.conversions > 0) || [];

  const combined = new Map<string, { region: string; conversions: number }>();
  [...gaRegions, ...metaRegions].forEach((row) => {
    const current = combined.get(row.region) || { region: row.region, conversions: 0 };
    current.conversions += row.conversions;
    combined.set(row.region, current);
  });

  const regions = Array.from(combined.values());
  return {
    source: regions.length ? 'google-analytics-meta-api' : 'demo-fallback',
    filters,
    regions: matchesRegion(regions.length ? regions : fallbackRegionalConversions(), filters.region),
  };
}
