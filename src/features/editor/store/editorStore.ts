import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { CommandHistory } from "@/core/history/CommandHistory";
import type { LocalAsset, OpenedPdf } from "@/core/pdf/PdfEngine";
import type {
  EditorObject,
  EditorTool,
  PDFEditorState,
  PDFMetadata,
  PDFPageModel,
  PDFPageRotation,
  PDFProject,
  PDFRect
} from "@/types/pdf";

interface EditorStore extends PDFEditorState {
  project: PDFProject | null;
  sourceBytes: Uint8Array | null;
  document: PDFDocumentProxy | null;
  assets: Map<string, LocalAsset>;
  isLoading: boolean;
  error: string | null;
  isTransactionActive: boolean;
  setOpenedPdf: (openedPdf: OpenedPdf, initialTool?: EditorTool) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setActiveTool: (tool: EditorTool) => void;
  setActivePage: (pageId: string) => void;
  setSelectedObjects: (objectIds: string[]) => void;
  selectObject: (objectId: string | null) => void;
  setZoom: (zoom: number) => void;
  addAsset: (asset: LocalAsset) => void;
  addObject: (object: EditorObject) => void;
  /** Adds related overlays as one undoable document operation. */
  addObjects: (objects: readonly EditorObject[]) => void;
  updateMetadata: (metadata: PDFMetadata) => void;
  updateObject: (objectId: string, update: (object: EditorObject) => EditorObject) => void;
  removeObject: (objectId: string) => void;
  removeSelectedObjects: () => void;
  beginTransaction: () => void;
  updateObjectLive: (objectId: string, update: (object: EditorObject) => EditorObject) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  rotatePage: (pageId: string, degrees: 90 | 180 | 270) => void;
  cropPage: (pageId: string, cropBox: PDFRect) => void;
  duplicatePage: (pageId: string) => void;
  deletePage: (pageId: string) => boolean;
  reorderPage: (sourcePageId: string, targetPageId: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

let projectHistory: CommandHistory<PDFProject> | null = null;

const INITIAL_EDITOR_STATE: PDFEditorState = {
  activePageId: null,
  selectedPageIds: [],
  selectedObjectIds: [],
  activeTool: "select",
  mode: "simple",
  viewMode: "continuous",
  zoom: 1,
  pan: { x: 0, y: 0 },
  isDirty: false
};

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...INITIAL_EDITOR_STATE,
  project: null,
  sourceBytes: null,
  document: null,
  assets: new Map(),
  isLoading: false,
  error: null,
  isTransactionActive: false,

  setOpenedPdf: (openedPdf, initialTool = "select") => {
    const initialProject = setProjectHistory(openedPdf.project);
    set({
      ...INITIAL_EDITOR_STATE,
      project: initialProject,
      sourceBytes: openedPdf.sourceBytes,
      document: openedPdf.document,
      assets: new Map(),
      activePageId: initialProject.pages[0]?.id ?? null,
      selectedPageIds: initialProject.pages[0] ? [initialProject.pages[0].id] : [],
      activeTool: initialTool,
      isLoading: false,
      error: null,
      isTransactionActive: false
    });
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  setActiveTool: (activeTool) => set({ activeTool, selectedObjectIds: activeTool === "select" ? get().selectedObjectIds : [] }),
  setActivePage: (pageId) => set({ activePageId: pageId, selectedPageIds: [pageId], selectedObjectIds: [] }),
  setSelectedObjects: (selectedObjectIds) => set({ selectedObjectIds }),
  selectObject: (objectId) => set({ selectedObjectIds: objectId ? [objectId] : [], activeTool: "select" }),
  setZoom: (zoom) => set({ zoom: clamp(zoom, 0.25, 4) }),

  addAsset: (asset) => {
    const assets = new Map(get().assets);
    assets.set(asset.id, asset);
    set({ assets });
  },

  addObject: (object) => {
    commitProject(set, get, (project) => ({
      ...project,
      overlays: [...project.overlays, object],
      updatedAt: Date.now()
    }));
    set({ selectedObjectIds: [object.id], activeTool: "select" });
  },

  addObjects: (objects) => {
    if (objects.length === 0) return;
    const batch = [...objects];
    commitProject(set, get, (project) => ({
      ...project,
      overlays: [...project.overlays, ...batch],
      updatedAt: Date.now()
    }));
    set({ selectedObjectIds: [], activeTool: "select" });
  },

  updateMetadata: (metadata) => {
    const normalizedMetadata: PDFMetadata = {
      ...metadata,
      ...(metadata.keywords ? { keywords: [...metadata.keywords] } : {})
    };
    commitProject(set, get, (project) => ({
      ...project,
      metadata: normalizedMetadata,
      updatedAt: Date.now()
    }));
  },

  updateObject: (objectId, update) => {
    commitProject(set, get, (project) => updateProjectObject(project, objectId, update));
  },

  removeObject: (objectId) => {
    commitProject(set, get, (project) => ({
      ...project,
      overlays: project.overlays.filter((object) => object.id !== objectId),
      updatedAt: Date.now()
    }));
    set((state) => ({ selectedObjectIds: state.selectedObjectIds.filter((id) => id !== objectId) }));
  },

  removeSelectedObjects: () => {
    const selected = new Set(get().selectedObjectIds);
    if (selected.size === 0) return;
    commitProject(set, get, (project) => ({
      ...project,
      overlays: project.overlays.filter((object) => !selected.has(object.id)),
      updatedAt: Date.now()
    }));
    set({ selectedObjectIds: [] });
  },

  beginTransaction: () => {
    if (!get().project || !projectHistory || get().isTransactionActive) return;
    set({ isTransactionActive: true });
  },

  updateObjectLive: (objectId, update) => {
    if (!get().isTransactionActive) {
      get().updateObject(objectId, update);
      return;
    }

    const project = get().project;
    if (!project) return;
    set({ project: updateProjectObject(project, objectId, update) });
  },

  commitTransaction: () => {
    const project = get().project;
    if (!project || !projectHistory || !get().isTransactionActive) return;
    const didCommit = projectHistory.commit(project);
    set({
      project: withHistory(project),
      isTransactionActive: false,
      isDirty: didCommit ? projectHistory.undoDepth > 0 : get().isDirty
    });
  },

  cancelTransaction: () => {
    if (!projectHistory || !get().isTransactionActive) return;
    set({ project: withHistory(projectHistory.current), isTransactionActive: false });
  },

  rotatePage: (pageId, rotation) => {
    commitProject(set, get, (project) => ({
      ...project,
      pages: project.pages.map((page) => page.id === pageId
        ? { ...page, rotation: rotatePage(page.rotation, rotation) }
        : page),
      updatedAt: Date.now()
    }));
  },

  cropPage: (pageId, cropBox) => {
    if (!isValidCropBox(cropBox)) return;
    commitProject(set, get, (project) => ({
      ...project,
      pages: project.pages.map((page) => page.id === pageId ? { ...page, cropBox: { ...cropBox } } : page),
      updatedAt: Date.now()
    }));
  },

  duplicatePage: (pageId) => {
    let copiedPageId: string | null = null;
    commitProject(set, get, (project) => {
      const sourceIndex = project.pages.findIndex((page) => page.id === pageId);
      const sourcePage = project.pages[sourceIndex];
      if (!sourcePage || sourceIndex < 0) return project;
      copiedPageId = createId();
      const duplicate = { ...sourcePage, id: copiedPageId, label: undefined };
      const overlays = project.overlays.flatMap((object) => object.pageId === pageId
        ? [object, { ...object, id: createId(), pageId: copiedPageId! }]
        : [object]);
      return {
        ...project,
        pages: [...project.pages.slice(0, sourceIndex + 1), duplicate, ...project.pages.slice(sourceIndex + 1)],
        overlays,
        updatedAt: Date.now()
      };
    });
    if (copiedPageId) {
      set({ activePageId: copiedPageId, selectedPageIds: [copiedPageId], selectedObjectIds: [] });
    }
  },

  deletePage: (pageId) => {
    const project = get().project;
    if (!project || project.pages.length <= 1 || !project.pages.some((page) => page.id === pageId)) {
      return false;
    }

    const deletedIndex = project.pages.findIndex((page) => page.id === pageId);
    commitProject(set, get, (currentProject) => ({
      ...currentProject,
      pages: currentProject.pages.filter((page) => page.id !== pageId),
      overlays: currentProject.overlays.filter((object) => object.pageId !== pageId),
      updatedAt: Date.now()
    }));

    const nextProject = get().project;
    const nextPage = nextProject?.pages[Math.min(deletedIndex, (nextProject?.pages.length ?? 1) - 1)];
    set({ activePageId: nextPage?.id ?? null, selectedPageIds: nextPage ? [nextPage.id] : [], selectedObjectIds: [] });
    return true;
  },

  reorderPage: (sourcePageId, targetPageId) => {
    if (sourcePageId === targetPageId) return;
    commitProject(set, get, (project) => {
      const fromIndex = project.pages.findIndex((page) => page.id === sourcePageId);
      const toIndex = project.pages.findIndex((page) => page.id === targetPageId);
      if (fromIndex < 0 || toIndex < 0) return project;
      const pages = [...project.pages];
      const [movedPage] = pages.splice(fromIndex, 1);
      if (!movedPage) return project;
      pages.splice(toIndex, 0, movedPage);
      return { ...project, pages, updatedAt: Date.now() };
    });
  },

  undo: () => {
    if (!projectHistory || get().isTransactionActive) return;
    const project = projectHistory.undo();
    if (!project) return;
    const resolvedActivePage = project.pages.some((page) => page.id === get().activePageId)
      ? get().activePageId
      : project.pages[0]?.id ?? null;
    set({
      project: withHistory(project),
      activePageId: resolvedActivePage,
      selectedPageIds: resolvedActivePage ? [resolvedActivePage] : [],
      selectedObjectIds: [],
      isDirty: projectHistory.undoDepth > 0
    });
  },

  redo: () => {
    if (!projectHistory || get().isTransactionActive) return;
    const project = projectHistory.redo();
    if (!project) return;
    const resolvedActivePage = project.pages.some((page) => page.id === get().activePageId)
      ? get().activePageId
      : project.pages[0]?.id ?? null;
    set({
      project: withHistory(project),
      activePageId: resolvedActivePage,
      selectedPageIds: resolvedActivePage ? [resolvedActivePage] : [],
      selectedObjectIds: [],
      isDirty: true
    });
  },

  reset: () => {
    projectHistory = null;
    set({
      ...INITIAL_EDITOR_STATE,
      project: null,
      sourceBytes: null,
      document: null,
      assets: new Map(),
      isLoading: false,
      error: null,
      isTransactionActive: false
    });
  }
}));

function setProjectHistory(project: PDFProject): PDFProject {
  projectHistory = new CommandHistory(project, { clone: cloneProject });
  return withHistory(project);
}

function commitProject(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>), replace?: false) => void,
  get: () => EditorStore,
  update: (project: PDFProject) => PDFProject
): void {
  const project = get().project;
  if (!project || !projectHistory || get().isTransactionActive) return;
  const nextProject = update(project);
  const didCommit = projectHistory.commit(nextProject);
  if (!didCommit) return;
  set({ project: withHistory(nextProject), isDirty: projectHistory.undoDepth > 0 });
}

function updateProjectObject(
  project: PDFProject,
  objectId: string,
  update: (object: EditorObject) => EditorObject
): PDFProject {
  return {
    ...project,
    overlays: project.overlays.map((object) => object.id === objectId ? update(object) : object),
    updatedAt: Date.now()
  };
}

function withHistory(project: PDFProject): PDFProject {
  return {
    ...project,
    history: {
      undoDepth: projectHistory?.undoDepth ?? 0,
      redoDepth: projectHistory?.redoDepth ?? 0,
      capacity: projectHistory?.capacity ?? 100
    }
  };
}

function cloneProject(project: PDFProject): PDFProject {
  return structuredClone(project);
}

function rotatePage(rotation: PDFPageRotation, degrees: 90 | 180 | 270): PDFPageRotation {
  const next = (rotation + degrees) % 360;
  return next as PDFPageRotation;
}

function isValidCropBox(cropBox: PDFRect): boolean {
  return Number.isFinite(cropBox.x)
    && Number.isFinite(cropBox.y)
    && Number.isFinite(cropBox.width)
    && Number.isFinite(cropBox.height)
    && cropBox.width > 0
    && cropBox.height > 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `free-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function selectActivePage(project: PDFProject | null, activePageId: string | null): PDFPageModel | null {
  if (!project || !activePageId) return null;
  return project.pages.find((page) => page.id === activePageId) ?? null;
}
