import { describe, expect, it } from "vitest";
import { searchIndexedPages, type IndexedTextPage } from "@/features/editor/components/TextSearchDialog";

const indexedPages: IndexedTextPage[] = [
  { pageId: "page-1", pageNumber: 1, text: "Contrato de prueba con firma visual." },
  { pageId: "page-2", pageNumber: 2, text: "La FIRMA aparece otra vez en esta pagina." }
];

describe("searchIndexedPages", () => {
  it("finds case-insensitive matches with page context", () => {
    const { results, isTruncated } = searchIndexedPages(indexedPages, "firma");

    expect(isTruncated).toBe(false);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ pageId: "page-1", pageNumber: 1, match: "firma" });
    expect(results[1]).toMatchObject({ pageId: "page-2", pageNumber: 2, match: "FIRMA" });
  });

  it("reports truncation when the visible result limit is reached", () => {
    const { results, isTruncated } = searchIndexedPages(indexedPages, "a", 2);

    expect(results).toHaveLength(2);
    expect(isTruncated).toBe(true);
  });
});
