import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const target = resolve(process.argv[2] ?? ".tmp/pdf-studio-flow.pdf");
const pageCount = Math.max(1, Math.min(250, Number.parseInt(process.argv[3] ?? "3", 10) || 3));
const document = await PDFDocument.create();
const font = await document.embedFont(StandardFonts.Helvetica);

for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
  const page = document.addPage([595.28, 841.89]);
  page.drawText(`Documento de prueba — página ${pageNumber}`, {
    x: 64,
    y: 756,
    size: 22,
    font,
    color: rgb(0.11, 0.16, 0.25)
  });
  page.drawText("Este PDF se genera localmente para validar el flujo de PDF Studio.", {
    x: 64,
    y: 710,
    size: 12,
    font,
    color: rgb(0.35, 0.4, 0.49)
  });
}

await mkdir(dirname(target), { recursive: true });
await writeFile(target, await document.save());
const imageTarget = resolve(dirname(target), "pdf-studio-image.png");
const testImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL4RAAAAABJRU5ErkJggg==";
await writeFile(imageTarget, Buffer.from(testImage, "base64"));
console.log(target);
console.log(imageTarget);
