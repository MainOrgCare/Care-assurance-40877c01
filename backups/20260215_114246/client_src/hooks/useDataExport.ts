import { useCallback } from "react";

interface ExportColumn {
  /** Column header label */
  header: string;
  /** Key into the row object, or a function that extracts the value */
  accessor: string | ((row: Record<string, unknown>) => unknown);
}

/**
 * Hook that provides CSV and JSON export capabilities for any tabular data.
 *
 * Usage:
 *   const { exportCSV, exportJSON } = useDataExport();
 *   exportCSV(data, columns, "compliance-report");
 */
export function useDataExport() {
  const formatValue = useCallback((value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }, []);

  const getValue = useCallback(
    (row: Record<string, unknown>, col: ExportColumn): string => {
      const raw =
        typeof col.accessor === "function"
          ? col.accessor(row)
          : row[col.accessor];
      return formatValue(raw);
    },
    [formatValue],
  );

  const escapeCSV = useCallback((value: string): string => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }, []);

  const exportCSV = useCallback(
    (
      data: Record<string, unknown>[],
      columns: ExportColumn[],
      filename: string,
    ) => {
      const header = columns.map((c) => escapeCSV(c.header)).join(",");
      const rows = data.map((row) =>
        columns.map((col) => escapeCSV(getValue(row, col))).join(","),
      );
      const csv = [header, ...rows].join("\n");
      downloadBlob(csv, `${filename}.csv`, "text/csv;charset=utf-8;");
    },
    [escapeCSV, getValue],
  );

  const exportJSON = useCallback(
    (
      data: Record<string, unknown>[],
      columns: ExportColumn[],
      filename: string,
    ) => {
      const mapped = data.map((row) => {
        const obj: Record<string, string> = {};
        for (const col of columns) {
          obj[col.header] = getValue(row, col);
        }
        return obj;
      });
      const json = JSON.stringify(mapped, null, 2);
      downloadBlob(json, `${filename}.json`, "application/json");
    },
    [getValue],
  );

  return { exportCSV, exportJSON };
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
