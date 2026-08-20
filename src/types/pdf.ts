/**
 * Canonical data structures for the editable layer of a PDF project.
 *
 * Geometry stored in this module is always expressed in PDF points with a
 * bottom-left origin. Conversion to a browser or canvas coordinate system is
 * deliberately handled by `CoordinateTransformer`.
 */

export interface PDFPoint {
  x: number;
  y: number;
}

export interface CSSPoint {
  x: number;
  y: number;
}

export interface PDFSize {
  width: number;
  height: number;
}

/** A rectangle in PDF coordinates. Width and height should be non-negative. */
export interface PDFRect extends PDFPoint, PDFSize {}

/** A rectangle expressed as fractions of an asset's own width and height. */
export interface NormalizedRect extends PDFRect {}

export type PDFPageRotation = 0 | 90 | 180 | 270;

/**
 * Metadata that identifies the immutable input file. Raw bytes belong in the
 * document engine or persistence layer rather than in the editable project.
 */
export interface PDFSource {
  id: string;
  name: string;
  mimeType: string;
  byteLength: number;
  fingerprint?: string;
}

export interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  createdAt?: number;
  modifiedAt?: number;
}

/**
 * A page in its current project order. `sourcePageIndex` is zero-based and
 * refers to the page in the immutable source document.
 */
export interface PDFPageModel {
  id: string;
  sourcePageIndex: number;
  size: PDFSize;
  rotation: PDFPageRotation;
  cropBox?: PDFRect;
  label?: string;
}

export type EditorObjectType =
  | "text"
  | "image"
  | "shape"
  | "drawing"
  | "signature"
  | "note"
  | "stamp";

export type TextAlignment = "left" | "center" | "right" | "justify";
export type TextDecoration = "none" | "underline" | "line-through";
export type ShapeKind =
  | "rectangle"
  | "rounded-rectangle"
  | "circle"
  | "ellipse"
  | "line"
  | "arrow"
  | "triangle"
  | "polygon"
  | "star";
export type StrokeLineCap = "butt" | "round" | "square";
export type StrokeLineJoin = "miter" | "round" | "bevel";

export interface StrokeStyle {
  color: string;
  width: number;
  dashArray?: number[];
  lineCap?: StrokeLineCap;
  lineJoin?: StrokeLineJoin;
}

/** Shared visual properties for every editable overlay. */
export interface EditorObjectBase {
  id: string;
  pageId: string;
  type: EditorObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees in PDF-space, normalized by consumers to [0, 360). */
  rotation: number;
  /** Value from 0 (transparent) to 1 (opaque). */
  opacity: number;
  zIndex: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface TextEditorObject extends EditorObjectBase {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  textDecoration: TextDecoration;
  textAlign: TextAlignment;
  lineHeight: number;
  letterSpacing: number;
  backgroundColor?: string;
}

/** `assetId` is resolved locally by the asset store; it is never a remote URL. */
export interface ImageEditorObject extends EditorObjectBase {
  type: "image";
  assetId: string;
  mimeType: string;
  preserveAspectRatio: boolean;
  /** Crop coordinates are normalized from 0 to 1 within the original asset. */
  crop?: NormalizedRect;
}

export interface ShapeEditorObject extends EditorObjectBase {
  type: "shape";
  shape: ShapeKind;
  fillColor: string | null;
  stroke: StrokeStyle | null;
  /** Used by rounded rectangles; ignored by other shapes. */
  cornerRadius?: number;
  /** Local points used by polygonal and star shapes. */
  points?: PDFPoint[];
}

export interface DrawingPoint extends PDFPoint {
  /** Pointer pressure normalized from 0 to 1 when the input device provides it. */
  pressure?: number;
}

export interface DrawingEditorObject extends EditorObjectBase {
  type: "drawing";
  /** Points are absolute PDF-space coordinates. */
  points: DrawingPoint[];
  stroke: StrokeStyle;
}

export type SignatureContent =
  | {
      kind: "drawn";
      strokes: DrawingPoint[][];
      stroke: StrokeStyle;
    }
  | {
      kind: "typed" | "initials";
      text: string;
      fontFamily: string;
      color: string;
    }
  | {
      kind: "image";
      assetId: string;
      mimeType: string;
    };

/** A visual signature only; it does not represent a cryptographic signature. */
export interface SignatureEditorObject extends EditorObjectBase {
  type: "signature";
  signature: SignatureContent;
}

/**
 * A local visual sticky note. It is flattened into the exported page rather
 * than presented as a native PDF annotation in another reader.
 */
export interface NoteEditorObject extends EditorObjectBase {
  type: "note";
  content: string;
  color: string;
  textColor: string;
  fontSize: number;
}

/**
 * Presets for visual status stamps. They intentionally describe appearance
 * only: a stamp is flattened into the exported PDF and is not a native PDF
 * annotation, approval workflow, or cryptographic assertion.
 */
export type StampKind =
  | "approved"
  | "reviewed"
  | "confidential"
  | "draft"
  | "final"
  | "paid"
  | "rejected";

export type StampStyle = "outline" | "filled";

/**
 * Serializable visual data for a stamp. A future canvas/DOM renderer can use
 * this directly without having to infer colours or label text from the kind.
 */
export interface StampContent {
  kind: StampKind;
  label: string;
  style: StampStyle;
  color: string;
  fillColor: string | null;
  textColor: string;
  borderWidth: number;
}

/**
 * A visual status stamp. `signature` is a text-only compatibility fallback
 * for the currently generic overlay renderer; consumers should render the
 * richer `stamp` payload when they support stamp-specific presentation.
 */
export interface StampEditorObject extends EditorObjectBase {
  type: "stamp";
  stamp: StampContent;
  signature: Extract<SignatureContent, { kind: "typed" | "initials" }>;
}

export type EditorObject =
  | TextEditorObject
  | ImageEditorObject
  | ShapeEditorObject
  | DrawingEditorObject
  | SignatureEditorObject
  | NoteEditorObject
  | StampEditorObject;

/** A compact, serializable representation of undo/redo availability. */
export interface PDFHistoryState {
  undoDepth: number;
  redoDepth: number;
  capacity: number;
}

/**
 * The editable project is an overlay model: the source PDF remains immutable
 * and a writer applies these edits only when the user exports a new file.
 */
export interface PDFProject {
  id: string;
  source: PDFSource;
  pages: PDFPageModel[];
  overlays: EditorObject[];
  metadata: PDFMetadata;
  history: PDFHistoryState;
  createdAt: number;
  updatedAt: number;
}

export type EditorTool =
  | "select"
  | "hand"
  | "zoom-in"
  | "zoom-out"
  | "text"
  | "image"
  | "shape"
  | "draw"
  | "eraser"
  | "highlight"
  | "note"
  | "signature";

export type EditorViewMode =
  | "single-page"
  | "continuous"
  | "two-page"
  | "book";

export type EditorMode = "simple" | "advanced";

export interface EditorSelectionState {
  activePageId: string | null;
  selectedPageIds: string[];
  selectedObjectIds: string[];
}

export interface PDFEditorState extends EditorSelectionState {
  activeTool: EditorTool;
  mode: EditorMode;
  viewMode: EditorViewMode;
  zoom: number;
  /** Pan offset in CSS pixels relative to the editor viewport. */
  pan: CSSPoint;
  isDirty: boolean;
}
