import { RawXLSX } from "@/lib/safe-xlsx";

export function normalizeVisitHeaderKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findVisitColumnIndex(headers: string[], keywords: string[]): number {
  if (!headers.length || !keywords.length) return -1;
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (!header) continue;
    if (keywords.some((keyword) => header.includes(keyword))) {
      return index;
    }
  }
  return -1;
}

export function sanitizeVisitCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${day}/${month}@${hours}:${minutes}`.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = (RawXLSX as any).SSF?.parse_date_code?.(value);
    if (parsed) {
      const day = String(parsed.d ?? parsed.D ?? "").padStart(2, "0");
      const month = String(parsed.m ?? parsed.M ?? "").padStart(2, "0");
      const hours = String(parsed.H ?? parsed.h ?? 0).padStart(2, "0");
      const minutes = String(parsed.M ?? parsed.m ?? 0).padStart(2, "0");
      if (day && month) {
        return `${day}/${month}@${hours}:${minutes}`.trim();
      }
    }
    return String(value);
  }
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (lower === "true" || lower === "yes") return "Y";
  if (lower === "false" || lower === "no") return "N";
  const dateTimeMatch = text.match(/(\d{1,2})[\\/-](\d{1,2})[\\/-](\d{2,4}).*?(\d{1,2}:\d{2})/);
  if (dateTimeMatch) {
    const day = dateTimeMatch[1].padStart(2, "0");
    const month = dateTimeMatch[2].padStart(2, "0");
    return `${day}/${month}@${dateTimeMatch[4]}`;
  }
  const dateMatch = text.match(/(\d{1,2})[\\/-](\d{1,2})[\\/-](\d{2,4})/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    return `${day}/${month}`;
  }
  const timeMatch = text.match(/\b\d{1,2}:\d{2}\b/);
  if (timeMatch) return timeMatch[0];
  return text;
}

export function toVisitInitials(value: unknown): string {
  const text = sanitizeVisitCellValue(value).replace(/[^A-Za-z\s,'-]/g, " ").trim();
  if (!text) return "";
  const parts = text.includes(",")
    ? text.split(",").map((part) => part.trim()).filter(Boolean)
    : text.split(/\s+/).filter(Boolean);
  const ordered = parts.length >= 2 && text.includes(",") ? [parts[1], parts[0]] : parts;
  const initials = ordered.map((part) => part[0]?.toUpperCase()).filter(Boolean).join(".");
  return initials ? `${initials}.` : "";
}

export function toVisitInitialLast(value: unknown): string {
  const text = sanitizeVisitCellValue(value).replace(/[^A-Za-z\s,'-]/g, " ").trim();
  if (!text) return "";
  if (text.includes(",")) {
    const [last, first] = text.split(",").map((part) => part.trim());
    if (first && last) return `${first[0].toUpperCase()}.${last}`;
  }
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    return `${first[0].toUpperCase()}.${last}`;
  }
  return text;
}