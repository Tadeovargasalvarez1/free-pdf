# Arquitectura de Free PDF

## Propósito

Free PDF es una aplicación estática, offline-first y centrada en la privacidad. Su arquitectura separa el editor visual, las operaciones de documento y los adaptadores de bibliotecas PDF para que el producto pueda crecer sin que la interfaz quede acoplada a un motor concreto.

El principio operativo es simple: el archivo original se trata como fuente inmutable; la sesión almacena un proyecto con cambios declarativos y la exportación crea un PDF nuevo.

## Capas

```text
┌─────────────────────────────────────────────────────────────────┐
│ Aplicación y UI: landing, editor, diálogos, accesibilidad, i18n │
├─────────────────────────────────────────────────────────────────┤
│ Features: texto, imágenes, dibujo, firma, páginas, exportación  │
├─────────────────────────────────────────────────────────────────┤
│ Dominio: proyecto PDF, comandos, historial, selección, estado   │
├─────────────────────────────────────────────────────────────────┤
│ Core: motor PDF, coordenadas, renderizado, persistencia, workers│
├─────────────────────────────────────────────────────────────────┤
│ Adaptadores: PDF.js, pdf-lib, Canvas, IndexedDB, File System API│
└─────────────────────────────────────────────────────────────────┘
```

Las capas superiores pueden depender de las inferiores, nunca al revés. En particular, los componentes de React no deben invocar directamente PDF.js ni pdf-lib.

## Modelo de documento

El proyecto representa el estado de edición sin sobrescribir el archivo de entrada.

```ts
interface PDFProject {
  id: string
  source: PDFSource
  pages: PageModel[]
  overlays: EditorObject[]
  annotations: AnnotationModel[]
  metadata: MetadataModel
  history: HistoryState
  createdAt: number
  updatedAt: number
}
```

Los objetos colocados por el usuario conservan la página a la que pertenecen, sus coordenadas en el espacio del PDF, tamaño, rotación, opacidad y orden de apilamiento. La UI nunca toma sus coordenadas CSS como fuente de verdad.

## Motor PDF

El dominio expone una interfaz propia, en vez de propagar APIs de terceros:

```ts
interface PDFEngine {
  open(source: ArrayBuffer): Promise<PDFDocumentModel>
  renderPage(page: number, options: RenderOptions): Promise<ImageBitmap | HTMLCanvasElement>
  addText(input: AddTextInput): Promise<void>
  addImage(input: AddImageInput): Promise<void>
  reorderPages(order: number[]): Promise<void>
  export(options: ExportOptions): Promise<Uint8Array>
}
```

Un adaptador de renderizado puede usar PDF.js, mientras que otro de escritura puede usar pdf-lib. Cada capacidad se valida de forma independiente; no se debe declarar soporte solo porque una biblioteca esté incluida en el bundle.

## Operaciones, historial y estado

Las modificaciones se expresan como comandos reversibles:

```ts
interface PDFCommand {
  execute(): Promise<void> | void
  undo(): Promise<void> | void
}
```

Ejemplos: añadir o mover texto, insertar imagen, rotar, eliminar y reordenar páginas. El historial conserva los comandos aplicados y descartados para implementar undo/redo. El estado de interacción efímero (arrastre actual, hover, panel abierto) se mantiene separado de los datos exportables del proyecto.

## Coordenadas y renderizado

Un único servicio convierte entre coordenadas PDF, CSS y canvas considerando zoom, rotación y `devicePixelRatio`:

```ts
interface CoordinateTransformer {
  pdfToScreen(point: PDFPoint, viewport: Viewport): ScreenPoint
  screenToPdf(point: ScreenPoint, viewport: Viewport): PDFPoint
  normalizeRect(rect: PDFRect): PDFRect
  transformRotation(rotation: number, viewport: Viewport): number
}
```

Esta regla evita errores de colocación al cambiar el zoom, girar páginas o usar pantallas HiDPI. El renderizado de páginas se virtualiza: solo se dibujan las páginas cercanas al área visible y las miniaturas usan resoluciones separadas.

## Rendimiento y aislamiento

- Las tareas de renderizado, OCR, conversión o procesamiento intensivo se ejecutan en Web Workers cuando sea posible.
- Las funciones pesadas se cargan de forma diferida con `import()`.
- Canvas y `OffscreenCanvas` se usan solo donde aporten una mejora medible.
- Se establecen advertencias para documentos, imágenes o dimensiones inusualmente grandes sin bloquear arbitrariamente al usuario.

PDFs y contenido importado se consideran no confiables. No se ejecuta JavaScript incrustado del documento; los errores se aíslan y se comunican con mensajes comprensibles, con detalles técnicos opcionales.

## Persistencia y privacidad

La sesión en memoria es la fuente principal de trabajo. IndexedDB solo guarda preferencias, proyectos o firmas si el usuario lo solicita. La File System Access API es una mejora opcional; la exportación universal se realiza mediante `Blob` y descarga local.

No hay backend obligatorio ni telemetría invasiva. Cualquier futuro servicio remoto debe ser optativo, explícito y aislado del flujo principal.

## Publicación estática

Vite genera `dist/` y GitHub Pages sirve ese resultado. La configuración de Vite debe respetar la base del repositorio para que rutas, assets, workers, WASM, manifiesto y service worker funcionen bajo `https://Tadeovargasalvarez1.github.io/free-pdf/`.

El workflow de Pages instala dependencias con `npm ci`, ejecuta pruebas, construye el sitio y despliega el artefacto estático. La aplicación no depende de procesos de servidor en tiempo de ejecución.

## Verificación

Las pruebas unitarias deben cubrir comandos, historial, serialización, operaciones de páginas y transformaciones de coordenadas. Las pruebas end-to-end deben abrir un PDF real, editarlo, exportarlo y abrir de nuevo la salida para comprobar el resultado persistente. Las funciones de seguridad o fidelidad documental requieren validación específica antes de mostrarse como completas.
