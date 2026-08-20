import { lazy, Suspense, type ChangeEvent, type DragEvent, useRef, useState } from "react";
import {
  ArrowRight,
  FileImage,
  FilePenLine,
  FileText,
  Files,
  ImagePlus,
  Layers3,
  LockKeyhole,
  PenLine,
  Scissors,
  ShieldCheck,
  Sparkles,
  Split,
  UploadCloud
} from "lucide-react";
import type { ThemePreference } from "@/app/App";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { MergeDialog } from "@/features/merge/MergeDialog";

const ConversionDialog = lazy(async () => ({ default: (await import("@/features/convert/ConversionDialog")).ConversionDialog }));
const FormFillDialog = lazy(async () => ({ default: (await import("@/features/forms/FormFillDialog")).FormFillDialog }));

export type EditorLaunchIntent = "select" | "text" | "image" | "shape" | "draw" | "signature" | "pages" | "extract" | "split";

interface HomeScreenProps {
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  onOpen: (file: File, intent: EditorLaunchIntent) => void;
}

interface ToolCard {
  icon: typeof FilePenLine;
  title: string;
  description: string;
  intent?: EditorLaunchIntent;
  action?: "merge" | "convert-images" | "convert-text" | "fill-form";
  accent: "indigo" | "teal" | "coral" | "violet" | "amber";
}

const AVAILABLE_TOOLS: ToolCard[] = [
  {
    icon: Files,
    title: "Unir PDFs",
    description: "Combina documentos en el orden que elijas.",
    action: "merge",
    accent: "violet"
  },
  {
    icon: FilePenLine,
    title: "Editar PDF",
    description: "Añade texto, formas y notas visuales.",
    intent: "text",
    accent: "indigo"
  },
  {
    icon: PenLine,
    title: "Firmar PDF",
    description: "Crea y coloca una firma visual.",
    intent: "signature",
    accent: "teal"
  },
  {
    icon: Layers3,
    title: "Organizar páginas",
    description: "Reordena, rota o elimina páginas.",
    intent: "pages",
    accent: "violet"
  },
  {
    icon: Split,
    title: "Dividir PDF",
    description: "Crea PDFs nuevos por cantidad de páginas.",
    intent: "split",
    accent: "indigo"
  },
  {
    icon: Scissors,
    title: "Extraer páginas",
    description: "Guarda sólo las páginas que necesitas.",
    intent: "extract",
    accent: "teal"
  },
  {
    icon: ImagePlus,
    title: "Añadir imagen",
    description: "Inserta una imagen sin salir del documento.",
    intent: "image",
    accent: "coral"
  },
  {
    icon: FileImage,
    title: "Imagen a PDF",
    description: "Crea un PDF local desde PNG o JPEG.",
    action: "convert-images",
    accent: "coral"
  },
  {
    icon: FileText,
    title: "Texto a PDF",
    description: "Convierte texto o un archivo .txt UTF-8.",
    action: "convert-text",
    accent: "indigo"
  },
  {
    icon: FileText,
    title: "Rellenar formulario",
    description: "Completa campos AcroForm sin subir el PDF.",
    action: "fill-form",
    accent: "teal"
  },
  {
    icon: Sparkles,
    title: "Dibujar y anotar",
    description: "Marca ideas con lápiz y formas.",
    intent: "draw",
    accent: "amber"
  }
];

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function HomeScreen({ theme, onThemeChange, onOpen }: HomeScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIntent, setPendingIntent] = useState<EditorLaunchIntent>("select");
  const [showMerge, setShowMerge] = useState(false);
  const [conversionMode, setConversionMode] = useState<"images" | "text" | null>(null);
  const [formFile, setFormFile] = useState<File | null>(null);

  const selectFile = (intent: EditorLaunchIntent) => {
    setPendingIntent(intent);
    inputRef.current?.click();
  };

  const openCandidate = (file: File | undefined, intent = pendingIntent) => {
    if (!file) {
      return;
    }

    if (!isPdf(file)) {
      setError("Selecciona un archivo PDF para abrir el editor.");
      return;
    }

    setError(null);
    onOpen(file, intent);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    openCandidate(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleFormFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isPdf(file)) {
      setError("Selecciona un archivo PDF para rellenar un formulario.");
      return;
    }
    setError(null);
    setFormFile(file);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    openCandidate(event.dataTransfer.files[0], "select");
  };

  const openTool = (action: ToolCard["action"] | undefined, intent: EditorLaunchIntent | undefined) => {
    if (action === "merge") {
      setShowMerge(true);
      return;
    }
    if (action === "convert-images") {
      setConversionMode("images");
      return;
    }
    if (action === "convert-text") {
      setConversionMode("text");
      return;
    }
    if (action === "fill-form") {
      formInputRef.current?.click();
      return;
    }
    selectFile(intent ?? "select");
  };

  return (
    <main className="home-shell">
      <header className="home-nav">
        <a className="brand" href="./" aria-label="Free PDF, inicio">
          <span className="brand-mark"><FilePenLine aria-hidden="true" size={19} /></span>
          <span>Free PDF</span>
        </a>
        <div className="home-nav__actions">
          <span className="privacy-pill"><LockKeyhole aria-hidden="true" size={14} /> 100% local</span>
          <ThemeToggle value={theme} onChange={onThemeChange} />
        </div>
      </header>

      <section className="home-hero" aria-labelledby="home-heading">
        <div className="eyebrow"><Sparkles aria-hidden="true" size={15} /> PDF sin límites innecesarios</div>
        <h1 id="home-heading">Edita tu PDF.<br /><span>En privado.</span></h1>
        <p className="home-hero__intro">Organiza, anota y firma documentos directamente en tu navegador. Sin cuentas, anuncios ni subidas de archivos.</p>

        <div
          className={`dropzone ${isDragging ? "is-dragging" : ""}`}
          role="button"
          tabIndex={0}
          aria-label="Seleccionar un PDF o soltarlo aquí"
          onClick={() => selectFile("select")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectFile("select");
            }
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) {
              setIsDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          <div className="dropzone__icon"><UploadCloud aria-hidden="true" size={28} /></div>
          <div className="dropzone__content">
            <strong>Seleccionar PDF</strong>
            <span>o arrástralo aquí para comenzar</span>
          </div>
          <ArrowRight aria-hidden="true" className="dropzone__arrow" size={20} />
        </div>
        <input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={handleChange} />
        <input ref={formInputRef} hidden type="file" accept="application/pdf,.pdf" onChange={handleFormFile} />
        {error && <p className="inline-error" role="alert">{error}</p>}

        <div className="local-note"><ShieldCheck aria-hidden="true" size={17} /><span><strong>Procesamiento local.</strong> Tus documentos no salen de este dispositivo.</span></div>
      </section>

      <section className="tools-section" aria-labelledby="available-tools-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Disponible ahora</p>
            <h2 id="available-tools-heading">Todo empieza en un solo editor.</h2>
          </div>
          <p>Abre el archivo una vez y sigue trabajando sin cambiar de herramienta.</p>
        </div>
        <div className="tool-grid">
          {AVAILABLE_TOOLS.map(({ icon: Icon, title, description, intent, action, accent }) => (
            <button className="tool-card" type="button" key={action ?? intent} onClick={() => openTool(action, intent)}>
              <span className={`tool-card__icon tool-card__icon--${accent}`}><Icon aria-hidden="true" size={21} /></span>
              <span className="tool-card__body"><strong>{title}</strong><small>{description}</small></span>
              <ArrowRight aria-hidden="true" className="tool-card__arrow" size={17} />
            </button>
          ))}
        </div>
      </section>

      <footer className="home-footer">
        <span>Free PDF · Gratis y local</span>
        <span>Tu archivo original nunca se modifica.</span>
      </footer>
      {showMerge && <MergeDialog onClose={() => setShowMerge(false)} onOpenResult={(file) => { setShowMerge(false); onOpen(file, "select"); }} />}
      {conversionMode && <Suspense fallback={null}><ConversionDialog
        mode={conversionMode}
        onClose={() => setConversionMode(null)}
        onOpenResult={(file) => {
          setConversionMode(null);
          onOpen(file, "select");
        }}
      /></Suspense>}
      {formFile && <Suspense fallback={null}><FormFillDialog
        file={formFile}
        onClose={() => setFormFile(null)}
        onOpenResult={(file) => {
          setFormFile(null);
          onOpen(file, "select");
        }}
      /></Suspense>}
    </main>
  );
}
