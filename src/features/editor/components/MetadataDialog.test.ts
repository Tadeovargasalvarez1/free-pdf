import { describe, expect, it } from "vitest";
import { metadataFromFormValues, metadataToFormValues } from "@/features/editor/components/MetadataDialog";
import type { PDFMetadata } from "@/types/pdf";

describe("MetadataDialog value adapters", () => {
  it("presents metadata keywords as a comma-separated field", () => {
    const metadata: PDFMetadata = {
      title: "Informe",
      keywords: ["PDF", "privacidad", "offline"],
      createdAt: 10,
      modifiedAt: 20
    };

    expect(metadataToFormValues(metadata)).toEqual({
      title: "Informe",
      author: "",
      subject: "",
      keywords: "PDF, privacidad, offline",
      creator: "",
      producer: ""
    });
  });

  it("splits comma-separated keywords and keeps explicit empty values for clearing", () => {
    const previous: PDFMetadata = {
      title: "Antes",
      author: "Autor",
      keywords: ["anterior"],
      createdAt: 111,
      modifiedAt: 222
    };

    const result = metadataFromFormValues({
      title: "  ",
      author: " Ada Lovelace ",
      subject: "  Resultado local ",
      keywords: " PDF, privacidad, pdf, , sin nube ",
      creator: " ",
      producer: " Free PDF " 
    }, previous);

    expect(result).toEqual({
      title: "",
      author: "Ada Lovelace",
      subject: "Resultado local",
      keywords: ["PDF", "privacidad", "sin nube"],
      creator: "",
      producer: "Free PDF",
      createdAt: 111,
      modifiedAt: 222
    });
  });
});
