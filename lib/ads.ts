// Google Ads → portfolio attribution, in version control so it can't silently drift
// like the stale BQ mapping tables. Most Google Ads labels equal the portfolio name
// (identity); only these multi-city / typo'd labels need remapping. Keyed on the real
// `label_name` from ads_CampaignLabel (verified against live data).

export const LABEL_TO_PORTFOLIO: Record<string, string> = {
  "Christiansburg/Moneta": "Christiansburg",
  "Erie/Corry/Union": "Erie",
  "Fairview/McKean": "Fairview",
  "Ithaca/Freeville": "Ithaca",
  "Risign Fawn": "Rising Fawn", // typo in Google Ads
  "Robinsonville/Walls": "Robinsonville",
  "Trion/Summerville/Lyerly": "Trion",
  "Troy/Cropseyville": "Troy",
};

export const CHANNEL_TYPE_LABELS: Record<string, string> = {
  SEARCH: "Search",
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Demand Gen",
  DISPLAY: "Display",
  VIDEO: "Video",
  SHOPPING: "Shopping",
};

export function channelLabel(type: string | null | undefined): string {
  if (!type) return "Other";
  return CHANNEL_TYPE_LABELS[type] ?? type;
}

function sqlStr(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/** SQL CASE mapping a `label_name` column to its canonical portfolio (identity by default). */
export function labelToPortfolioCase(col: string): string {
  const whens = Object.entries(LABEL_TO_PORTFOLIO)
    .map(([label, portfolio]) => `WHEN ${sqlStr(label)} THEN ${sqlStr(portfolio)}`)
    .join(" ");
  return `CASE ${col} ${whens} ELSE ${col} END`;
}
