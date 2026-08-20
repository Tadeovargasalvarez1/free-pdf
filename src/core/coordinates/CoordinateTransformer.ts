import type {
  CSSPoint,
  PDFPageModel,
  PDFPageRotation,
  PDFPoint,
  PDFRect,
  PDFSize,
} from "../../types/pdf";

export type RotationDirection = "pdf-to-css" | "css-to-pdf";

export interface CoordinateTransformerOptions {
  /** Size of the visible PDF box in PDF points before page rotation. */
  pageSize: PDFSize;
  /** Lower-left origin of the visible PDF box. Defaults to (0, 0). */
  pageOrigin?: PDFPoint;
  /** Browser zoom multiplier. Defaults to 1. */
  zoom?: number;
  /** PDF points to CSS pixels at 100% zoom. Defaults to 1. */
  cssPixelsPerPoint?: number;
  /** Device pixel ratio for canvas backing stores. Defaults to 1. */
  devicePixelRatio?: number;
  /** Clockwise page rotation in degrees. Must resolve to a quarter turn. */
  rotation?: number;
}

export interface CoordinateSize {
  width: number;
  height: number;
}

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ZERO_POINT: PDFPoint = { x: 0, y: 0 };

/** Normalizes an angle to the half-open interval [0, 360). */
export function normalizeRotation(rotation: number): number {
  assertFinite(rotation, "rotation");

  const normalized = ((rotation % 360) + 360) % 360;
  return Object.is(normalized, -0) ? 0 : normalized;
}

/** Normalizes and validates a PDF page rotation. */
export function normalizePageRotation(rotation: number): PDFPageRotation {
  const normalized = normalizeRotation(rotation);

  if (normalized !== 0 && normalized !== 90 && normalized !== 180 && normalized !== 270) {
    throw new RangeError("Page rotation must be a multiple of 90 degrees.");
  }

  return normalized as PDFPageRotation;
}

/** Returns a new rectangle with a non-negative width and height. */
export function normalizeRect(rect: RectLike): PDFRect {
  assertFinite(rect.x, "rect.x");
  assertFinite(rect.y, "rect.y");
  assertFinite(rect.width, "rect.width");
  assertFinite(rect.height, "rect.height");

  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
}

/**
 * Converts a point from PDF-space to unscaled, top-left CSS-space after page
 * rotation. This helper is useful when a consumer needs to supply its own
 * scale; most callers should use `CoordinateTransformer.pdfToCss` instead.
 */
export function rotatePdfPointToCss(
  point: PDFPoint,
  pageSize: PDFSize,
  rotation: number,
  pageOrigin: PDFPoint = ZERO_POINT,
): CSSPoint {
  validatePoint(point, "point");
  validateSize(pageSize, "pageSize");
  validatePoint(pageOrigin, "pageOrigin");

  const pageRotation = normalizePageRotation(rotation);
  const x = point.x - pageOrigin.x;
  const y = point.y - pageOrigin.y;

  switch (pageRotation) {
    case 0:
      return { x, y: pageSize.height - y };
    case 90:
      return { x: y, y: x };
    case 180:
      return { x: pageSize.width - x, y };
    case 270:
      return { x: pageSize.height - y, y: pageSize.width - x };
  }
}

/**
 * Coordinate service for a single rendered PDF page.
 *
 * PDF uses a bottom-left origin. CSS and canvas use a top-left origin. Page
 * rotation is clockwise, matching the PDF `/Rotate` convention. DPR affects
 * canvas backing-store coordinates only; it never changes CSS coordinates.
 */
export class CoordinateTransformer {
  public readonly pageSize: PDFSize;
  public readonly pageOrigin: PDFPoint;
  public readonly zoom: number;
  public readonly cssPixelsPerPoint: number;
  public readonly devicePixelRatio: number;
  public readonly rotation: PDFPageRotation;

  public constructor(options: CoordinateTransformerOptions) {
    validateSize(options.pageSize, "pageSize");

    const pageOrigin = options.pageOrigin ?? ZERO_POINT;
    validatePoint(pageOrigin, "pageOrigin");

    const zoom = options.zoom ?? 1;
    const cssPixelsPerPoint = options.cssPixelsPerPoint ?? 1;
    const devicePixelRatio = options.devicePixelRatio ?? 1;
    assertPositive(zoom, "zoom");
    assertPositive(cssPixelsPerPoint, "cssPixelsPerPoint");
    assertPositive(devicePixelRatio, "devicePixelRatio");

    this.pageSize = { ...options.pageSize };
    this.pageOrigin = { ...pageOrigin };
    this.zoom = zoom;
    this.cssPixelsPerPoint = cssPixelsPerPoint;
    this.devicePixelRatio = devicePixelRatio;
    this.rotation = normalizePageRotation(options.rotation ?? 0);
  }

  /** Creates a transformer using a page model and its visible crop box, if any. */
  public static fromPage(
    page: Pick<PDFPageModel, "size" | "rotation" | "cropBox">,
    options: Omit<CoordinateTransformerOptions, "pageSize" | "pageOrigin" | "rotation"> = {},
  ): CoordinateTransformer {
    const visibleBox = page.cropBox;

    return new CoordinateTransformer({
      ...options,
      pageSize: visibleBox
        ? { width: visibleBox.width, height: visibleBox.height }
        : page.size,
      pageOrigin: visibleBox ? { x: visibleBox.x, y: visibleBox.y } : ZERO_POINT,
      rotation: page.rotation,
    });
  }

  /** CSS pixels per PDF point after applying the current zoom. */
  public get scale(): number {
    return this.zoom * this.cssPixelsPerPoint;
  }

  /** Dimensions of the rotated PDF page in CSS pixels. */
  public get cssPageSize(): CoordinateSize {
    const width = this.pageSize.width * this.scale;
    const height = this.pageSize.height * this.scale;

    return this.rotation === 90 || this.rotation === 270
      ? { width: height, height: width }
      : { width, height };
  }

  /** Dimensions of a canvas backing store for the rendered page. */
  public get canvasPageSize(): CoordinateSize {
    const cssSize = this.cssPageSize;
    return {
      width: cssSize.width * this.devicePixelRatio,
      height: cssSize.height * this.devicePixelRatio,
    };
  }

  public pdfToCss(point: PDFPoint): CSSPoint {
    const unscaled = rotatePdfPointToCss(
      point,
      this.pageSize,
      this.rotation,
      this.pageOrigin,
    );

    return {
      x: unscaled.x * this.scale,
      y: unscaled.y * this.scale,
    };
  }

  public cssToPdf(point: CSSPoint): PDFPoint {
    validatePoint(point, "point");

    const x = point.x / this.scale;
    const y = point.y / this.scale;

    switch (this.rotation) {
      case 0:
        return this.withPageOrigin({ x, y: this.pageSize.height - y });
      case 90:
        return this.withPageOrigin({ x: y, y: x });
      case 180:
        return this.withPageOrigin({ x: this.pageSize.width - x, y });
      case 270:
        return this.withPageOrigin({
          x: this.pageSize.width - y,
          y: this.pageSize.height - x,
        });
    }
  }

  public cssToCanvas(point: CSSPoint): CSSPoint {
    validatePoint(point, "point");
    return {
      x: point.x * this.devicePixelRatio,
      y: point.y * this.devicePixelRatio,
    };
  }

  public canvasToCss(point: CSSPoint): CSSPoint {
    validatePoint(point, "point");
    return {
      x: point.x / this.devicePixelRatio,
      y: point.y / this.devicePixelRatio,
    };
  }

  public pdfToCanvas(point: PDFPoint): CSSPoint {
    return this.cssToCanvas(this.pdfToCss(point));
  }

  public canvasToPdf(point: CSSPoint): PDFPoint {
    return this.cssToPdf(this.canvasToCss(point));
  }

  /** Converts a PDF rectangle to the axis-aligned CSS bounds that contain it. */
  public pdfRectToCss(rect: RectLike): PDFRect {
    const normalized = normalizeRect(rect);
    return this.boundsForPoints([
      this.pdfToCss({ x: normalized.x, y: normalized.y }),
      this.pdfToCss({ x: normalized.x + normalized.width, y: normalized.y }),
      this.pdfToCss({ x: normalized.x, y: normalized.y + normalized.height }),
      this.pdfToCss({ x: normalized.x + normalized.width, y: normalized.y + normalized.height }),
    ]);
  }

  /** Converts a CSS rectangle to the axis-aligned PDF bounds that contain it. */
  public cssRectToPdf(rect: RectLike): PDFRect {
    const normalized = normalizeRect(rect);
    return this.boundsForPoints([
      this.cssToPdf({ x: normalized.x, y: normalized.y }),
      this.cssToPdf({ x: normalized.x + normalized.width, y: normalized.y }),
      this.cssToPdf({ x: normalized.x, y: normalized.y + normalized.height }),
      this.cssToPdf({ x: normalized.x + normalized.width, y: normalized.y + normalized.height }),
    ]);
  }

  /**
   * Converts an object's rotation between PDF and CSS angle conventions.
   * Both directions use the same equation because one axis is reflected.
   */
  public transformRotation(
    rotation: number,
    direction: RotationDirection = "pdf-to-css",
  ): number {
    assertFinite(rotation, "rotation");

    // `direction` intentionally remains part of the API: conversion is an
    // involution here because moving from PDF to CSS reflects the y-axis.
    void direction;
    return normalizeRotation(this.rotation - rotation);
  }

  public pdfRotationToCss(rotation: number): number {
    return this.transformRotation(rotation, "pdf-to-css");
  }

  public cssRotationToPdf(rotation: number): number {
    return this.transformRotation(rotation, "css-to-pdf");
  }

  private withPageOrigin(point: PDFPoint): PDFPoint {
    return {
      x: point.x + this.pageOrigin.x,
      y: point.y + this.pageOrigin.y,
    };
  }

  private boundsForPoints(points: readonly PDFPoint[]): PDFRect {
    const [firstPoint, ...remainingPoints] = points;

    if (!firstPoint) {
      throw new RangeError("At least one point is required to compute bounds.");
    }

    let minX = firstPoint.x;
    let maxX = firstPoint.x;
    let minY = firstPoint.y;
    let maxY = firstPoint.y;

    for (const point of remainingPoints) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
}

function assertPositive(value: number, name: string): void {
  assertFinite(value, name);

  if (value <= 0) {
    throw new RangeError(`${name} must be greater than zero.`);
  }
}

function validatePoint(point: PDFPoint | CSSPoint, name: string): void {
  assertFinite(point.x, `${name}.x`);
  assertFinite(point.y, `${name}.y`);
}

function validateSize(size: PDFSize, name: string): void {
  assertPositive(size.width, `${name}.width`);
  assertPositive(size.height, `${name}.height`);
}
