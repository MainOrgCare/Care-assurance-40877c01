export interface CarePlanSectionLike {
  title: string;
  priority: "high" | "medium" | "low";
  content: string;
  steps?: string[];
  risks?: string[];
  equipment?: string[];
}

export interface IndexedCarePlanSection<T extends CarePlanSectionLike = CarePlanSectionLike> {
  section: T;
  index: number;
}

export interface CarePlanSectionSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  steps: number;
  risks: number;
  equipment: number;
}

export function countPlaceholders(text: string): number {
  const matches = text.match(/\[([^\]]+)\]/g);
  return matches ? matches.length : 0;
}

export function summarizeCarePlanSections(
  sectionsWithIndex: Array<IndexedCarePlanSection>,
): CarePlanSectionSummary {
  const summary: CarePlanSectionSummary = {
    total: sectionsWithIndex.length,
    high: 0,
    medium: 0,
    low: 0,
    steps: 0,
    risks: 0,
    equipment: 0,
  };

  sectionsWithIndex.forEach(({ section }) => {
    if (section.priority === "high") summary.high += 1;
    if (section.priority === "medium") summary.medium += 1;
    if (section.priority === "low") summary.low += 1;
    summary.steps += Array.isArray(section.steps) ? section.steps.length : 0;
    summary.risks += Array.isArray(section.risks) ? section.risks.length : 0;
    summary.equipment += Array.isArray(section.equipment) ? section.equipment.length : 0;
  });

  return summary;
}

export function filterVisibleCarePlanSections<T extends CarePlanSectionLike>(
  sectionsWithIndex: Array<IndexedCarePlanSection<T>>,
  priorityFilter: "all" | "high" | "medium" | "low",
  searchQuery: string,
  sortMode: "default" | "priority",
): Array<IndexedCarePlanSection<T>> {
  const query = searchQuery.trim().toLowerCase();
  let filtered = sectionsWithIndex.filter(({ section }) => {
    if (priorityFilter !== "all" && section.priority !== priorityFilter) {
      return false;
    }
    if (!query) return true;

    const haystack = [
      section.title,
      section.content,
      ...(section.steps || []),
      ...(section.risks || []),
      ...(section.equipment || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  if (sortMode === "priority") {
    const priorityRank = { high: 0, medium: 1, low: 2 } as const;
    filtered = [...filtered].sort((a, b) => {
      const rankA = priorityRank[a.section.priority] ?? 3;
      const rankB = priorityRank[b.section.priority] ?? 3;
      if (rankA !== rankB) return rankA - rankB;
      return a.index - b.index;
    });
  }

  return filtered;
}

export function hasActiveCarePlanFilters(
  searchQuery: string,
  priorityFilter: "all" | "high" | "medium" | "low",
  sortMode: "default" | "priority",
): boolean {
  return searchQuery.trim().length > 0 || priorityFilter !== "all" || sortMode !== "default";
}

export function extractServiceUserNameFromDocumentContent(documentContent: string): string | null {
  const nameMatch = documentContent.match(
    /(?:Name|Known as|Full name)[:;]?[\s]*([A-Z][A-Za-z'’-]+(?:[\s]+(?:[A-Z][A-Za-z'’-]+|(?:van|von|de|del|da|di|la|le|st\.?))){1,4})/i,
  );
  return nameMatch?.[1] || null;
}