# Free PDF

Editor de PDF gratuito, privado y ejecutado localmente en el navegador. Free PDF está pensado para abrir documentos, organizarlos y añadir contenido sin cuentas, anuncios ni un servidor que reciba los archivos.

> Estado: MVP en desarrollo activo. Las capacidades visibles de la aplicación deben corresponder siempre a operaciones que puedan ejecutarse de forma fiable en el navegador.

## Privacidad

El flujo principal procesa los documentos en el dispositivo del usuario. La aplicación no requiere registro ni envía PDFs, imágenes, texto, metadatos o firmas a un servicio propio. Las funciones que no puedan garantizar este comportamiento se documentarán y no se presentarán como locales ni seguras.

## Funcionalidades del núcleo

- Abrir PDFs mediante selector de archivos o arrastrar y soltar.
- Visualizar páginas, navegar, aplicar zoom y trabajar con miniaturas.
- Buscar texto localmente en la capa de texto del PDF abierto, sin OCR para escaneos.
- Añadir texto, imágenes PNG/JPG/WebP, rectángulos, dibujos, firmas visuales dibujadas, escritas o desde imagen, y sellos de estado visuales.
- Organizar páginas: seleccionar, reordenar, rotar, duplicar y eliminar.
- Unir varios PDFs locales y abrir el resultado en el mismo editor.
- Extraer rangos como `1, 3, 5-9` y dividir un documento en PDFs nuevos por cantidad de páginas.
- Recortar una página mediante su `CropBox`, añadir números de página y aplicar una marca de agua visual sobre las páginas actuales.
- Crear un PDF nuevo desde imágenes PNG/JPEG o desde texto escrito y archivos `.txt` UTF-8; exportar páginas del PDF abierto como PNG; extraer texto del PDF abierto a Word `.docx`, `.txt`, `.html` o Markdown `.md`.
- Rellenar formularios AcroForm estándar compatibles y, opcionalmente, aplanarlos en una copia nueva.
- Consultar y editar los campos básicos del diccionario PDF Info: título, autor, asunto, palabras clave, creador y productor.
- Deshacer y rehacer operaciones; exportar una copia nueva del PDF.
- Interfaz responsive, tema claro/oscuro y atajos de teclado principales.

Los números, sellos y marcas de agua se exportan como contenido visual permanente: no son anotaciones PDF nativas, aprobaciones verificables ni firmas digitales. La marca de agua actual se dibuja sobre el contenido; no es una protección ni una redacción.

El recorte cambia la `CropBox` de la copia exportada y oculta el exterior al abrirla, pero no elimina de forma segura el contenido que queda fuera del área. Tampoco se debe usar como redacción.

Los conversores producen documentos o imágenes nuevos de forma local. Imagen a PDF admite PNG/JPEG y texto a PDF admite texto escrito o `.txt` UTF-8. PDF a imagen exporta PNG, no JPEG ni WebP. PDF a documento extrae texto seleccionable a `.docx`, `.txt`, `.html` o `.md`; no ofrece OCR, no reconstruye una maquetación Word perfecta y no recupera texto que sólo exista como imagen.

El rellenado cubre campos AcroForm habituales (texto, casilla, radio, lista y desplegable) en PDFs sin cifrar. No modifica XFA, acciones de botones, campos de firma digital, texto enriquecido o selectores de archivos. Aplanar es irreversible en la copia resultante y se rechaza si el PDF contiene un campo de firma digital para no afectar su posible validez. La edición de metadatos solo modifica los campos Info indicados: no garantiza limpiar XMP, IDs del documento, adjuntos ni historial de revisiones.

Funciones complejas —como modificar texto existente arbitrario, firma digital certificada, redacción segura, OCR, compresión profunda y cifrado avanzado— no se ofrecen hasta que una implementación local sea técnicamente verificable. Consulta la documentación de capacidades antes de interpretar una herramienta como soporte completo.

## Arquitectura

La aplicación separa la interfaz del motor de documentos:

```text
UI React → acciones de dominio → historial/comandos → motor PDF → exportación
                                 ↘ almacenamiento local y workers
```

- **React + TypeScript** para la interfaz y el estado de interacción.
- **Motor PDF abstraído** para impedir que los componentes dependan directamente de una biblioteca concreta.
- **Comandos inmutables** para operaciones editables, undo/redo y pruebas.
- **Workers y carga diferida** para procesamiento pesado sin bloquear la interfaz.
- **IndexedDB y APIs del navegador** solo para datos locales que el usuario decida conservar.

Para el diseño completo, consulta [docs/architecture.md](docs/architecture.md).

## Requisitos

- Node.js 22 o superior; CI usa Node.js 24 por compatibilidad con `pdfjs-dist` 6.
- npm incluido con Node.js.
- Un navegador moderno basado en Chromium, Firefox o Safari reciente.

## Instalación y desarrollo

```bash
npm ci
npm run dev
```

La aplicación quedará disponible en la dirección que indique Vite, normalmente `http://localhost:5173`.

### Calidad y compilación

```bash
npm test
npm run build
```

La compilación estática se genera en `dist/`. Antes de integrar cambios que afecten documentos deben verificarse el flujo real de abrir, editar, exportar y volver a abrir el PDF resultante.

## Despliegue en GitHub Pages

El repositorio incluye un flujo de GitHub Actions en `.github/workflows/deploy-pages.yml`. En cada envío a `main`, el flujo instala dependencias de forma reproducible, ejecuta pruebas, construye el sitio y publica `dist/` con las acciones oficiales de GitHub Pages.

Para habilitarlo en GitHub:

1. Ve a **Settings → Pages** del repositorio.
2. En **Build and deployment**, selecciona **GitHub Actions**.
3. Confirma que la rama de publicación del flujo sea `main`, o actualízala si el repositorio usa otra rama.
4. La configuración usa `base: "./"`, por lo que los assets se resuelven de forma relativa y funcionan tanto en un proyecto Pages como bajo otra ruta estática.
5. Sustituye el marcador de URL canónica en `index.html` y los marcadores de `public/robots.txt` y `public/sitemap.xml` por la URL pública real.

El workflow necesita que los scripts `test` y `build` estén definidos en `package.json`.

## PWA y funcionamiento sin conexión

El manifiesto y service worker se generan con `vite-plugin-pwa`; el shell, el editor diferido y el worker local de PDF.js se precachean en la build. Las futuras funciones con OCR/WASM deberán añadir explícitamente sus modelos, idiomas y workers a la estrategia de caché antes de anunciarlas como offline.

## Dependencias y licencias

Se priorizan dependencias mantenidas, compatibles con una aplicación estática y con licencias revisadas. Antes de incorporar una biblioteca para PDF, OCR o WebAssembly hay que validar su licencia, tamaño, seguridad, soporte de navegadores y comportamiento offline.

La licencia del proyecto está **pendiente de decisión**. No se ha añadido una licencia por defecto para no asumir una elección que corresponde a los responsables del repositorio.

## Contribuir

Las contribuciones son bienvenidas. Para facilitar revisiones:

1. Mantén los cambios acotados por dominio.
2. Añade o actualiza pruebas para operaciones PDF y transformaciones de coordenadas.
3. No introduzcas botones ni mensajes que prometan una operación no verificada.
4. Ejecuta `npm test` y `npm run build` antes de abrir una propuesta.
5. Explica las limitaciones técnicas y el impacto en privacidad cuando corresponda.

## Limitaciones importantes

Un PDF no es un formato de edición semántica uniforme. La edición perfecta de texto existente, la eliminación irreversible de contenido sensible y la firma digital certificada requieren capacidades que no siempre pueden garantizarse en un sitio estático. Free PDF debe comunicar estas diferencias claramente y conservar el archivo original: toda exportación se entrega como un archivo nuevo.
