export type CapturedJob = { url: string; title: string; company: string; description: string };

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
  const selected = candidates
    .map((element) => ({ element, length: clean(element.innerText || element.textContent || "").length }))
    .filter((item) => item.length >= 80)
    .sort((a, b) => b.length - a.length)[0]?.element;
  const headingElement = document.querySelector("h1") as HTMLElement | null;
  const heading = clean(headingElement?.innerText || headingElement?.textContent || metas(["og:title", "twitter:title"]) || document.title);
  const companyElement = document.querySelector("[itemprop='hiringOrganization'] [itemprop='name'],[class*='company-name'],[class*='companyName']") as HTMLElement | null;
  return {
    url: location.href,
    title: heading.slice(0, 240) || "Untitled role",
    company: clean(companyElement?.innerText || companyElement?.textContent || "").slice(0, 240),
    description: clean(selected?.innerText || selected?.textContent || "").slice(0, 100_000),
  };
};
