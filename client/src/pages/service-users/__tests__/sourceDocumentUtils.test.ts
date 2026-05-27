import { describe, expect, it } from "vitest";

import {
  hasUsableSourceData,
  isReadySourceDocument,
  summarizeSourceDocuments,
} from "../sourceDocumentUtils";

describe("sourceDocumentUtils", () => {
  const readyDocument = { contentLength: 1200, isParsing: false };
  const parsingDocument = { contentLength: 0, isParsing: true };
  const failedDocument = { contentLength: 0, isParsing: false, parseError: "OCR failed" };

  it("summarizes ready, parsing, and failed source documents", () => {
    expect(summarizeSourceDocuments([readyDocument, parsingDocument, failedDocument])).toEqual({
      total: 3,
      ready: 1,
      parsing: 1,
      failed: 1,
    });
  });

  it("treats parsed content without errors as ready", () => {
    expect(isReadySourceDocument(readyDocument)).toBe(true);
    expect(isReadySourceDocument({ contentLength: 1, isParsing: false, parseError: "Parse failed" })).toBe(false);
    expect(isReadySourceDocument(parsingDocument)).toBe(false);
  });

  it("requires notes, ready documents, or pending parsing for a usable input state", () => {
    expect(hasUsableSourceData([], false)).toBe(false);
    expect(hasUsableSourceData([failedDocument], false)).toBe(false);
    expect(hasUsableSourceData([readyDocument], false)).toBe(true);
    expect(hasUsableSourceData([parsingDocument], false)).toBe(true);
    expect(hasUsableSourceData([], true)).toBe(true);
  });
});