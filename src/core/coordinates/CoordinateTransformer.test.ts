import { describe, expect, it } from "vitest";

import {
  CoordinateTransformer,
  normalizePageRotation,
  normalizeRect,
  normalizeRotation,
} from "./CoordinateTransformer";

describe("CoordinateTransformer", () => {
  it("converts between bottom-left PDF and top-left CSS coordinates", () => {
    const transformer = new CoordinateTransformer({
      pageSize: { width: 612, height: 792 },
      zoom: 2,
    });

    expect(transformer.pdfToCss({ x: 72, y: 144 })).toEqual({
      x: 144,
      y: 1296,
    });
    expect(transformer.cssToPdf({ x: 144, y: 1296 })).toEqual({
      x: 72,
      y: 144,
    });
  });

  it.each([
    [90, { x: 20, y: 10 }, { width: 200, height: 100 }],
    [180, { x: 90, y: 20 }, { width: 100, height: 200 }],
    [270, { x: 180, y: 90 }, { width: 200, height: 100 }],
  ] as const)(
    "maps a point and page dimensions for %i° rotation",
    (rotation, expectedPoint, expectedPageSize) => {
      const transformer = new CoordinateTransformer({
        pageSize: { width: 100, height: 200 },
        rotation,
      });

      expect(transformer.pdfToCss({ x: 10, y: 20 })).toEqual(expectedPoint);
      expect(transformer.cssToPdf(expectedPoint)).toEqual({ x: 10, y: 20 });
      expect(transformer.cssPageSize).toEqual(expectedPageSize);
    },
  );

  it("transforms rectangles and canvas coordinates without mixing DPR into CSS", () => {
    const transformer = new CoordinateTransformer({
      pageSize: { width: 100, height: 200 },
      rotation: 90,
      zoom: 1.5,
      devicePixelRatio: 2,
    });

    expect(transformer.pdfRectToCss({ x: 10, y: 20, width: 30, height: 40 })).toEqual({
      x: 30,
      y: 15,
      width: 60,
      height: 45,
    });
    expect(transformer.pdfToCanvas({ x: 10, y: 20 })).toEqual({ x: 60, y: 30 });
    expect(transformer.canvasToPdf({ x: 60, y: 30 })).toEqual({ x: 10, y: 20 });
    expect(transformer.canvasPageSize).toEqual({ width: 600, height: 300 });
  });

  it("handles crop-box origins and object rotation angle conventions", () => {
    const transformer = new CoordinateTransformer({
      pageSize: { width: 100, height: 200 },
      pageOrigin: { x: 50, y: 25 },
      rotation: 90,
    });

    expect(transformer.pdfToCss({ x: 60, y: 45 })).toEqual({ x: 20, y: 10 });
    expect(transformer.cssToPdf({ x: 20, y: 10 })).toEqual({ x: 60, y: 45 });
    expect(transformer.pdfRotationToCss(20)).toBe(70);
    expect(transformer.cssRotationToPdf(70)).toBe(20);
  });
});

describe("coordinate helpers", () => {
  it("normalizes angles and rectangles", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizePageRotation(450)).toBe(90);
    expect(() => normalizePageRotation(45)).toThrow(RangeError);
    expect(normalizeRect({ x: 9, y: 4, width: -5, height: -2 })).toEqual({
      x: 4,
      y: 2,
      width: 5,
      height: 2,
    });
  });
});
