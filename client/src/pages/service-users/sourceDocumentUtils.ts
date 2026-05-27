export interface SourceDocumentLike {
  contentLength: number;
  isParsing: boolean;
  parseError?: string | null;
}

export interface SourceDocumentSummary {
  total: number;
  ready: number;
  parsing: number;
  failed: number;
}

export function isReadySourceDocument(document: SourceDocumentLike): boolean {
  return document.contentLength > 0 && !document.parseError && !document.isParsing;
}

export function summarizeSourceDocuments(
  sourceDocuments: SourceDocumentLike[],
): SourceDocumentSummary {
  return {
    total: sourceDocuments.length,
    ready: sourceDocuments.filter(isReadySourceDocument).length,
    parsing: sourceDocuments.filter((document) => document.isParsing).length,
    failed: sourceDocuments.filter((document) => Boolean(document.parseError)).length,
  };
}

export function hasUsableSourceData(
  sourceDocuments: SourceDocumentLike[],
  hasAdditionalNotes: boolean,
): boolean {
  return Boolean(
    hasAdditionalNotes ||
      sourceDocuments.some((document) => document.isParsing || isReadySourceDocument(document)),
  );
}