export type AnalyticsFilters = {
  startDate?: string;
  endDate?: string;
  region?: string;
  campaign?: string;
};

export type RegionalViews = { region: string; views: number };
export type RegionalClicks = { region: string; clicks: number };
export type RegionalConversions = { region: string; conversions: number };
export type TrafficSource = { source: 'organic' | 'paid' | 'referral' | 'direct' | string; count: number };

const YOUTUBE_ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
const GA_DATA_URL = 'https://analyticsdata.googleapis.com/v1beta';
const META_GRAPH_URL = 'https://graph.facebook.com/v20.0';

const mockViews: RegionalViews[] = [
  { region: 'US', views: 5400 },
  { region: 'Brazil', views: 2800 },
  { region: 'Nicaragua', views: 1200 },
];

const mockClicks: RegionalClicks[] = [
  { region: 'US', clicks: 1100 },
  { region: 'Brazil', clicks: 600 },
  { region: 'Nicaragua', clicks: 300 },
];

const mockTraffic: TrafficSource[] = [
  { source: 'organic', count: 3200 },
  { source: 'paid', count: 1800 },
  { source: 'referral', count: 900 },
];

const mockConversions: RegionalConversions[] = [
  { region: 'US', conversions: 90 },
  { region: 'Brazil', conversions: 40 },
  { region: 'Nicaragua', conversions: 25 },
];

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
  return filters.campaign
    ? { dimensionFilter: { filter: { fieldName: 'campaignName', stringFilter: { matchType: 'CONTAINS', value: filters.campaign } } } }
    : {};
}

export async function getViewsAnalytics(requestUrl: string): Promise<RegionalViews[]> {
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
    dimensions: 'country',
    sort: '-views',
  });

  const youtube = await fetchJson<{ rows?: Array<[string, number, number, number, number, number]> }>(
    `${YOUTUBE_ANALYTICS_URL}?${query}`,
    token,
  );

  const regions = youtube?.rows?.map(([region, views]) => ({ region, views: Number(views || 0) })) || [];
  return matchesRegion(regions.length ? regions : mockViews, filters.region);
}

export async function getClicksAnalytics(requestUrl: string): Promise<RegionalClicks[]> {
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
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'sessions' }],
        ...campaignField(filters),
      }),
    },
  ) : null;

  const regions = ga?.rows?.map((row) => ({
    region: row.dimensionValues?.[0]?.value || 'Unknown',
    clicks: Number(row.metricValues?.[0]?.value || 0),
  })) || [];

  return matchesRegion(regions.length ? regions : mockClicks, filters.region);
}

export async function getTrafficAnalytics(requestUrl: string): Promise<TrafficSource[]> {
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

  const sources = ga?.rows?.map((row) => ({
    source: row.dimensionValues?.[0]?.value?.toLowerCase() || 'direct',
    count: Number(row.metricValues?.[0]?.value || 0),
  })) || [];

  return sources.length ? sources : mockTraffic;
}

export async function getConversionsAnalytics(requestUrl: string): Promise<RegionalConversions[]> {
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

  const combined = new Map<string, RegionalConversions>();
  ga?.rows?.forEach((row) => {
    const region = row.dimensionValues?.[0]?.value || 'Unknown';
    combined.set(region, { region, conversions: Number(row.metricValues?.[0]?.value || 0) });
  });
  meta?.data?.forEach((row) => {
    const region = row.country || 'Unknown';
    const conversions = row.actions?.reduce((sum, action) => sum + (action.action_type.includes('conversion') ? Number(action.value || 0) : 0), 0) || 0;
    const current = combined.get(region) || { region, conversions: 0 };
    current.conversions += conversions;
    combined.set(region, current);
  });

  const regions = Array.from(combined.values()).filter((row) => row.conversions > 0);
  return matchesRegion(regions.length ? regions : mockConversions, filters.region);
}
