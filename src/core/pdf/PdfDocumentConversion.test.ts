import { describe, expect, it } from "vitest";
import { createDocumentFromTextPages } from "@/core/pdf/PdfDocumentConversion";

const pages = [
  { pageNumber: 1, text: "Hola mundo\nPrimera página" },
  { pageNumber: 2, text: "Segunda página & símbolos <>" }
];

describe("PdfDocumentConversion", () => {
  it("creates plain text and markdown exports from extracted pages", () => {
    const text = createDocumentFromTextPages(pages, { format: "txt", sourceName: "demo.pdf" });
    const markdown = createDocumentFromTextPages(pages, { format: "md", sourceName: "demo.pdf" });

    expect(text.name).toBe("demo-convertido.txt");
    expect(text.mimeType).toContain("text/plain");
    expect(new TextDecoder().decode(text.bytes)).toContain("Hola mundo");
    expect(new TextDecoder().decode(markdown.bytes)).toContain("## Página 2");
  });

  it("creates escaped html", () => {
    const result = createDocumentFromTextPages(pages, { format: "html", sourceName: "demo.pdf" });
    const html = new TextDecoder().decode(result.bytes);

    expect(result.name).toBe("demo-convertido.html");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Segunda página &amp; símbolos &lt;&gt;");
  });

  it("creates a docx package with Word document parts", () => {
    const result = createDocumentFromTextPages(pages, { format: "docx", sourceName: "demo.pdf" });
    const latin1 = Array.from(result.bytes, (byte) => String.fromCharCode(byte)).join("");

    expect(result.name).toBe("demo-convertido.docx");
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(result.bytes[0]).toBe(0x50);
    expect(result.bytes[1]).toBe(0x4b);
    expect(latin1).toContain("[Content_Types].xml");
    expect(latin1).toContain("word/document.xml");
  });

  it("rejects scanned PDFs without selectable text", () => {
    expect(() => createDocumentFromTextPages([{ pageNumber: 1, text: "   " }], { format: "docx", sourceName: "scan.pdf" }))
      .toThrow(/OCR/);
  });
});
