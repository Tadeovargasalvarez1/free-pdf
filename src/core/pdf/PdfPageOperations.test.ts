import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  extractPages,
  extractRanges,
  getPdfPageCount,
  mergePdfFiles,
  parsePageRange,
  splitPdfByCount
} from "@/core/pdf/PdfPageOperations";

async function createPdf(pageWidths: readonly number[]): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (const width of pageWidths) document.addPage([width, 300]);
  return document.save({ addDefaultPage: false });
}

async function pageWidths(bytes: Uint8Array): Promise<number[]> {
  const document = await PDFDocument.load(bytes);
  return document.getPages().map((page) => page.getWidth());
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

describe("parsePageRange", () => {
  it("accepts one-based individual pages and inclusive ranges and returns zero-based indexes", () => {
    expect(parsePageRange("1, 3, 5 - 7", 7)).toEqual([0, 2, 4, 5, 6]);
  });

  it("rejects malformed, reversed, repeated and out-of-bounds ranges with human messages", () => {
    expect(() => parsePageRange("1,,3", 4)).toThrow("elemento vacío");
    expect(() => parsePageRange("4-2", 4)).toThrow("termina antes de empezar");
    expect(() => parsePageRange("1-3,3", 4)).toThrow("aparece más de una vez");
    expect(() => parsePageRange("5", 4)).toThrow("no existe");
    expect(() => parsePageRange("0", 4)).toThrow("empiezan en 1");
  });
});

describe("local PDF page operations", () => {
  it("reads the local page count without changing the source", async () => {
    const source = await createPdf([201, 202, 203]);
    const before = source.slice();

    await expect(getPdfPageCount(source)).resolves.toBe(3);
    expect(source).toEqual(before);
  });

  it("merges multiple fresh PDFs in order without mutating their input bytes", async () => {
    const first = await createPdf([201, 202]);
    const second = await createPdf([301]);
    const firstBefore = first.slice();
    const secondBefore = second.slice();

    const merged = await mergePdfFiles([first, toArrayBuffer(second)]);

    expect(await pageWidths(merged)).toEqual([201, 202, 301]);
    expect(first).toEqual(firstBefore);
    expect(second).toEqual(secondBefore);
    expect(merged).not.toBe(first);
  });

  it("extracts requested pages in the requested order from indexes or a user range", async () => {
    const source = await createPdf([210, 220, 230, 240, 250]);
    const sourceBefore = source.slice();

    const fromIndexes = await extractPages(source, [4, 1]);
    const fromRange = await extractRanges(source, "4,2-3");

    expect(await pageWidths(fromIndexes)).toEqual([250, 220]);
    expect(await pageWidths(fromRange)).toEqual([240, 220, 230]);
    expect(source).toEqual(sourceBefore);
  });

  it("splits every N pages into independently reopenable PDF files", async () => {
    const source = await createPdf([101, 102, 103, 104, 105]);
    const parts = await splitPdfByCount(source, 2);

    expect(parts).toHaveLength(3);
    await expect(Promise.all(parts.map(pageWidths))).resolves.toEqual([
      [101, 102],
      [103, 104],
      [105]
    ]);
  });

  it("rejects invalid operation arguments before producing an unusable PDF", async () => {
    const source = await createPdf([200]);

    await expect(mergePdfFiles([source])).rejects.toThrow("al menos dos PDFs");
    await expect(extractPages(source, [])).rejects.toThrow("al menos una página");
    await expect(splitPdfByCount(source, 0)).rejects.toThrow("número entero mayor que cero");
  });
});
