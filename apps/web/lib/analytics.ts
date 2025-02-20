import { conn } from "./planetscale";

export type IntervalProps = "1h" | "24h" | "7d" | "30d" | "90d" | "all";

export const INTERVALS = [
  {
    display: "Last hour",
    value: "1h",
  },
  {
    display: "Last 24 hours",
    value: "24h",
  },
  {
    display: "Last 7 days",
    value: "7d",
  },
  {
    display: "Last 30 days",
    value: "30d",
  },
  {
    display: "Last 3 months",
    value: "90d",
  },
  {
    display: "All Time",
    value: "all",
  },
];

export const intervalData = {
  "1h": {
    startDate: new Date(Date.now() - 3600000),
    granularity: "minute",
  },
  "24h": {
    startDate: new Date(Date.now() - 86400000),
    granularity: "hour",
  },
  "7d": {
    startDate: new Date(Date.now() - 604800000),
    granularity: "day",
  },
  "30d": {
    startDate: new Date(Date.now() - 2592000000),
    granularity: "day",
  },
  "90d": {
    startDate: new Date(Date.now() - 7776000000),
    granularity: "month",
  },
  all: {
    // Dub.co founding date
    startDate: new Date("2022-09-22"),
    granularity: "month",
  },
};

export type LocationTabs = "country" | "city";
export type TopLinksTabs = "link" | "url";
export type DeviceTabs = "device" | "browser" | "os" | "ua";

const VALID_TINYBIRD_ENDPOINTS = [
  "timeseries",
  "clicks",
  "top_links",
  "top_urls",
  // "top_aliases",
  "country",
  "city",
  "device",
  "browser",
  "os",
  "referer",
];

export const VALID_ANALYTICS_FILTERS = [
  "country",
  "city",
  "url",
  "alias",
  "device",
  "browser",
  "os",
  "referer",
  "excludeRoot",
];

export const getAnalytics = async ({
  projectId,
  linkId,
  domain,
  endpoint,
  interval,
  ...rest
}: {
  projectId?: string;
  linkId?: string;
  domain?: string;
  endpoint: string;
  interval?: string;
} & {
  [key in (typeof VALID_ANALYTICS_FILTERS)[number]]: string;
}) => {
  // Note: we're using decodeURIComponent in this function because that's how we store it in MySQL and Tinybird

  if (
    !process.env.DATABASE_URL ||
    !process.env.TINYBIRD_API_KEY ||
    !VALID_TINYBIRD_ENDPOINTS.includes(endpoint)
  ) {
    return [];
  }

  // get all-time clicks count if:
  // 1. endpoint is /clicks
  // 2. interval is not defined
  if (endpoint === "clicks" && !interval && linkId) {
    let response = await conn.execute(
      "SELECT clicks FROM Link WHERE `id` = ?",
      [linkId],
    );
    if (response.rows.length === 0) {
      response = await conn.execute(
        "SELECT clicks FROM Domain WHERE `id` = ?",
        [linkId],
      );
      if (response.rows.length === 0) {
        return "0";
      }
      return response.rows[0]["clicks"];
    }
  }

  let url = new URL(
    `${process.env.TINYBIRD_API_URL}/v0/pipes/${endpoint}.json`,
  );
  if (projectId) {
    url.searchParams.append("projectId", projectId);
  }
  if (linkId) {
    url.searchParams.append("linkId", linkId);
  } else if (domain) {
    url.searchParams.append("domain", domain);
  }
  if (interval) {
    url.searchParams.append(
      "start",
      intervalData[interval].startDate
        .toISOString()
        .replace("T", " ")
        .replace("Z", ""),
    );
    url.searchParams.append(
      "end",
      new Date(Date.now()).toISOString().replace("T", " ").replace("Z", ""),
    );

    url.searchParams.append("granularity", intervalData[interval].granularity);
  }

  VALID_ANALYTICS_FILTERS.forEach((filter) => {
    if (rest[filter]) {
      url.searchParams.append(filter, rest[filter]);
    }
  });

  return await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${process.env.TINYBIRD_API_KEY}`,
    },
  })
    .then(async (res) => {
      if (res.ok) {
        return res.json();
      }
      const error = await res.text();
      console.error(error);
    })
    .then(({ data }) => {
      if (endpoint === "clicks") {
        try {
          const clicks = data[0]["count()"];
          return clicks || "0";
        } catch (e) {
          console.log(e);
        }
      }
      return data;
    });
};
