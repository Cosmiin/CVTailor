const text = (value: unknown) => String(value ?? "").trim();
const tokens = (value: unknown) => new Set(text(value).toLowerCase().split(/[^\p{L}\p{N}+#.]+/u).filter((item) => item.length >= 2));

export const selectRelevantExperienceEvidence = (
  all: any[],
  roleById: Map<string, any>,
  jobBrief: unknown,
  fingerprint: (role: any) => string,
  totalLimit = 20,
  perRoleLimit = 6,
) => {
  const jobText = JSON.stringify(jobBrief).toLowerCase();
  const jobTokens = tokens(jobText);
  const scored = all.map((item) => {
    const role = roleById.get(String(item.experience_id));
    if (!role) return null;
    const terms = [...new Set([item.label, ...(item.search_terms ?? [])].map((term) => text(term).toLowerCase()).filter(Boolean))].slice(0, 16);
    const exact = terms.reduce((sum, term) => sum + (term.length > 2 && jobText.includes(term) ? 5 : 0), 0);
    const overlap = [...tokens(`${item.label} ${item.statement} ${(item.search_terms ?? []).join(" ")}`)].filter((term) => jobTokens.has(term)).length;
    return { item, role, stale: item.role_fingerprint !== fingerprint(role), score: exact + overlap };
  }).filter((item): item is any => Boolean(item && item.score > 0))
    .sort((a, b) => b.score - a.score || String(b.item.updated_at).localeCompare(String(a.item.updated_at)));
  const counts = new Map<string, number>(); const selected: any[] = [];
  for (const value of scored) {
    const id = String(value.item.experience_id);
    if ((counts.get(id) ?? 0) >= perRoleLimit || selected.length >= totalLimit) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1); selected.push(value);
  }
  return selected;
};

export const budgetEvidenceItems = (items: any[], maxChars = 6000) => {
  const selected: any[] = []; let size = 2;
  for (const item of items) {
    const next = JSON.stringify(item).length + 1;
    if (size + next > maxChars) break;
    selected.push(item); size += next;
  }
  return selected;
};
