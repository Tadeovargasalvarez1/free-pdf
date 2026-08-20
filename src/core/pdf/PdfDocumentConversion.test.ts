import { describe, expect, it } from "vitest";
import { createDocumentFromTextPages, extractPdfTextPages } from "@/core/pdf/PdfDocumentConversion";
import type { PDFPageModel } from "@/types/pdf";

const pages = [
  { pageNumber: 1, text: "Hola mundo\nPrimera página" },
  { pageNumber: 2, text: "Segunda página & símbolos <>" }
];

const tablePages = [
  {
    pageNumber: 1,
    text: "Producto Cantidad Total\nManzanas 2 10.50\nPeras 3 15,75",
    table: [
      ["Producto", "Cantidad", "Total"],
      ["Manzanas", "2", "10.50"],
      ["Peras", "3", "15,75"]
    ]
  },
  {
    pageNumber: 2,
    text: "Nota Valor\nA,B \"especial\" 4",
    table: [
      ["Nota", "Valor"],
      ["A,B \"especial\"", "4"]
    ]
  }
];

describe("PdfDocumentConversion", () => {
  it("reconstructs table-like rows from PDF.js text coordinates", async () => {
    const document = {
      getPage: async () => ({
        getTextContent: async () => ({
          items: [
            textItem("Producto", 50, 700, 46),
            textItem("Cantidad", 170, 700, 44),
            textItem("Total", 270, 700, 25),
            textItem("Manzanas", 50, 680, 52),
            textItem("2", 170, 680, 7),
            textItem("10.50", 270, 680, 30),
            textItem("Peras", 50, 660, 30),
            textItem("3", 170, 660, 7),
            textItem("15,75", 270, 660, 30)
          ]
        })
      })
    };
    const pdfPages: PDFPageModel[] = [{ id: "page-1", sourcePageIndex: 0, size: { width: 612, height: 792 }, rotation: 0 }];

    const [page] = await extractPdfTextPages(document as never, pdfPages);

    expect(page?.table).toEqual([
      ["Producto", "Cantidad", "Total"],
      ["Manzanas", "2", "10.50"],
      ["Peras", "3", "15,75"]
    ]);
  });

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

  it("creates csv tables that Excel can open", () => {
    const result = createDocumentFromTextPages(tablePages, { format: "csv", sourceName: "tabla.pdf" });
    const csv = new TextDecoder().decode(result.bytes);

    expect(result.name).toBe("tabla-convertido.csv");
    expect(result.mimeType).toContain("text/csv");
    expect(Array.from(result.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain("Producto,Cantidad,Total");
    expect(csv).toContain('"A,B ""especial""",4');
  });

  it("creates an xlsx package with workbook and worksheet parts", () => {
    const result = createDocumentFromTextPages(tablePages, { format: "xlsx", sourceName: "tabla.pdf" });
    const latin1 = Array.from(result.bytes, (byte) => String.fromCharCode(byte)).join("");

    expect(result.name).toBe("tabla-convertido.xlsx");
    expect(result.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.bytes[0]).toBe(0x50);
    expect(result.bytes[1]).toBe(0x4b);
    expect(latin1).toContain("xl/workbook.xml");
    expect(latin1).toContain("xl/worksheets/sheet1.xml");
    expect(latin1).toContain("Manzanas");
  });

  it("rejects scanned PDFs without selectable text", () => {
    expect(() => createDocumentFromTextPages([{ pageNumber: 1, text: "   " }], { format: "docx", sourceName: "scan.pdf" }))
      .toThrow(/OCR/);
  });
});

function textItem(str: string, x: number, y: number, width: number) {
  return { str, width, height: 10, transform: [10, 0, 0, 10, x, y] };
}
