export type CapturedJob = {
  url: string;
  title: string;
  company: string;
  description: string;
  pageTitle: string;
  sourceLanguage: string;
  structuredMetadata: unknown[];
};

export const extractVisibleJob = (): CapturedJob => {
  const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const metas = (names: string[]) => names
    .map((name) => document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute("content") || "")
    .find(Boolean) || "";
  const candidates = [
    document.querySelector("[itemprop='description']"),
    document.querySelector("[class*='job-description']"),
    document.querySelector("[class*='jobDescription']"),
    document.querySelector("main"),
    document.querySelector("article"),
    document.body,
  ].filter(Boolean) as HTMLElement[];
  const ranked = candidates
    .map((element) => ({ element, length: clean(element.innerText || element.textContent || "").length }))
    .filter((item) => item.length >= 80);
  const selected = ranked[0]?.element;
  const headingElement = document.querySelector("h1") as HTMLElement | null;
  const heading = clean(headingElement?.innerText || headingElement?.textContent || metas(["og:title", "twitter:title"]) || document.title);
  const companyElement = document.querySelector("[itemprop='hiringOrganization'] [itemprop='name'],[class*='company-name'],[class*='companyName']") as HTMLElement | null;
  const structuredMetadata = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).flatMap((element) => {
    try {
      const value = JSON.parse(element.textContent || "null");
      const values = Array.isArray(value) ? value : [value];
      return values.filter((item) => item && (item["@type"] === "JobPosting" || item["@graph"]));
    } catch { return []; }
  }).slice(0, 10);
  return {
    url: location.href,
    title: heading.slice(0, 240) || "Untitled role",
    company: clean(companyElement?.innerText || companyElement?.textContent || "").slice(0, 240),
    description: clean(selected?.innerText || selected?.textContent || "").slice(0, 100_000),
    pageTitle: clean(document.title).slice(0, 500),
    sourceLanguage: clean(document.documentElement.lang).slice(0, 80),
    structuredMetadata,
  };
};
