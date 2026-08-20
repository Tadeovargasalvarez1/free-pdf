# Capacidades PDF verificadas

Este documento separa las capacidades que el producto puede afirmar hoy de
aproximaciones visuales, experimentos y funciones que requieren otro motor.
Todos los flujos descritos pueden ejecutarse localmente en el navegador; eso no
significa que todas las clases de PDF se puedan editar de forma arbitraria.
La matriz distingue el soporte técnico del stack de las funciones que ya tienen
una herramienta visible; una API disponible no convierte por sí sola una
operación en una promesa de producto.

## Estado de implementación

- **Disponible y verificado en la interfaz:** apertura/render local, miniaturas
  virtualizadas, zoom, búsqueda de texto local, overlays de texto/imagen/forma/
  dibujo/firma visual/sello visual, números de página y marca de agua visual sobre el contenido;
  undo/redo, exportación de una copia, reordenar/rotar/duplicar/eliminar
  páginas, unir PDFs, extraer rangos, dividir por cantidad de páginas y
  recortar mediante `CropBox`.
- **Conversión local disponible:** PDF a PNG (página actual, todas o un rango);
  PNG/JPEG a PDF y texto escrito o `.txt` UTF-8 a PDF. No se anuncian como
  OCR, conversión de Word ni conversión genérica de formatos.
- **Formularios y metadatos disponibles con límites:** rellenado y aplanado
  de AcroForm estándar compatible, y edición de los campos básicos de PDF
  Info. Ambos flujos crean una copia nueva y comunican sus restricciones.
- **Organización visual:** la cuadrícula de páginas permite reordenar,
  rotar, duplicar, eliminar y extraer una selección; las miniaturas se
  renderizan localmente y de forma diferida.
- **No disponible en la interfaz:** OCR, cifrado, redacción segura, firma
  digital, edición semántica de texto existente, compresión profunda,
  conversiones complejas y creación de AcroForms. Que una fila de la matriz
  marque soporte técnico no significa que ya sea una función del producto.

## Inventario auditado

| Componente | Versión / estado | Licencia | Decisión |
| --- | --- | --- | --- |
| `pdfjs-dist` | `6.2.108`, instalado | Apache-2.0 | Lector, renderizador, extracción de texto, búsqueda y detección de estructura. |
| `pdf-lib` | `1.17.1`, instalado | MIT | Escritor estable para operaciones de páginas sin cifrar y contenido añadido. |
| `@pdf-lib/fontkit` | No instalado | MIT | Añadir sólo cuando se habiliten fuentes TTF/OTF personalizadas. |
| `tesseract.js` | No instalado | Apache-2.0 | Carga diferida para la fase OCR; no debe entrar en el bundle inicial. |
| MuPDF.js / MuPDF WASM | No instalado | AGPL-3.0 o licencia comercial | No integrar hasta resolver expresamente la licencia del proyecto. |

Las cifras no son una estimación de bundle final, pero sí alertan del coste de
carga: los artefactos minificados instalados de PDF.js son aproximadamente
444 KiB para la API y 1.23 MiB para el worker; `pdf-lib.esm.min.js` ronda
511 KiB, antes de compresión HTTP. El renderizador debe ir en worker y OCR,
WASM, CMaps, fuentes estándar y datos de idioma se cargan bajo demanda.

## Leyenda

- **Confirmado**: API pública instalada y adecuada para el flujo indicado.
- **Parcial**: funciona con una restricción de producto que debe mostrarse.
- **Experimental**: existe en la versión instalada, pero necesita corpus y
  pruebas de regresión antes de ser el camino predeterminado.
- **No disponible**: no se debe presentar como función del producto actual.

## Matriz de capacidades

| Función | Motor principal | Soporte | Limitación y comportamiento honesto |
| --- | --- | --- | --- |
| Abrir, renderizar y navegar PDFs | PDF.js | **Confirmado** | Renderiza a Canvas, expone viewport, rotación, anotaciones y número de páginas. Se virtualizan páginas y miniaturas; nunca se renderiza un documento completo a máxima resolución. |
| Zoom, HiDPI y miniaturas | PDF.js + servicio propio de coordenadas | **Confirmado** | El modelo canónico usa unidades PDF y el `PageViewport` de PDF.js para convertir a CSS/Canvas; no se hacen conversiones manuales por componente. El desplazamiento se realiza con el scroll del visor; no se anuncia una herramienta de pan independiente. |
| Buscar texto del documento | PDF.js `getTextContent` | **Disponible en la interfaz** | La búsqueda local devuelve página y contexto, pero no modifica ni extrae el flujo de texto. El orden puede variar en PDFs complejos, ligaduras, columnas o contenido escaneado. |
| Detectar enlaces, anotaciones, adjuntos, marcadores, capas y JavaScript | PDF.js | **API disponible; diferido de la interfaz** | El stack puede inspeccionar estas estructuras de lectura, pero Free PDF todavía no ofrece un explorador ni editor de ellas. No se debe prometer su preservación exacta tras exportar con `pdf-lib`. |
| Abrir PDF con contraseña conocida | PDF.js | **Diferido de la interfaz** | PDF.js puede solicitarla localmente, pero el editor actual no expone ese flujo ni promete exportación: `pdf-lib` no admite documentos cifrados. |
| Añadir texto nuevo | `pdf-lib` | **Confirmado** | Inserta contenido permanente, con posición, tamaño, color, opacidad y rotación. Negrita/cursiva son variantes de fuente; subrayado/tachado se dibujan como geometría. |
| Fuentes estándar y personalizadas | `pdf-lib`; `@pdf-lib/fontkit` opcional | **Parcial** | Las 14 fuentes estándar están disponibles. Para TTF/OTF, UTF-8 completo y apariencias de formularios se debe añadir `@pdf-lib/fontkit` y empaquetar las fuentes permitidas, no depender del sistema del usuario. |
| Editar texto existente fuera de un formulario | PDF.js + `pdf-lib` | **Parcial (reemplazo visual)** | `pdf-lib` declara que no edita ni elimina texto de contenido de página. La alternativa fiable es cubrir y superponer texto nuevo; el texto subyacente sigue existiendo y jamás se denomina redacción segura. |
| Insertar, mover, rotar y escalar imágenes | `pdf-lib` + Canvas | **Confirmado** | `pdf-lib` incrusta PNG y JPEG. WebP se decodifica localmente y se rasteriza a PNG tras validar el origen; no hay incrustación directa de WebP ni soporte SVG en la interfaz actual. No se anuncia recorte de imagen exportable todavía. |
| Formas y trazos | `pdf-lib` + geometría propia | **Disponible en la interfaz: rectángulo y trazo libre** | El modelo puede crecer a líneas, elipses, flechas o polígonos, pero la interfaz publicada hoy crea rectángulos y trazos. Eliminar sólo afecta objetos creados por el usuario, nunca contenido original. |
| Dibujo, sello, firma visual y anotaciones del producto | Escena propia + `pdf-lib` | **Confirmado como contenido aplanado** | Se guardan como objetos editables del proyecto y al exportar se dibujan de forma permanente. Es portable visualmente, pero no equivale a crear anotaciones PDF nativas editables en otros lectores. |
| Comentarios con autor y estado «resuelto» | Modelo de proyecto / IndexedDB | **No disponible en la interfaz** | La nota adhesiva actual es un objeto visual editable, no un hilo de comentarios ni una anotación PDF nativa. Un panel de comentarios requerirá persistencia local consentida y navegación propia. |
| Anotaciones PDF nativas | Editor de anotaciones de PDF.js | **Experimental / diferido** | PDF.js 6 incluye `annotationStorage` y `saveDocument`, pero su editor está orientado a su visor y cambia con frecuencia. No será la fuente de verdad del editor propio hasta superar pruebas de compatibilidad. |
| Firma dibujada, escrita o desde imagen | Canvas + `pdf-lib` | **Confirmado** | Se exporta como apariencia visual. Las iniciales se pueden insertar como texto escrito, pero la UI debe decir «firma visual», no certificado ni firma digital. |
| Firma digital PKCS#12/PFX | Ninguno instalado | **No disponible** | `PDFSignature` de `pdf-lib` no ofrece APIs especializadas para crear, leer ni firmar firmas digitales. No activar una opción de firma criptográfica sin un motor auditado, validación entre lectores y manejo seguro de claves. |
| Leer y editar metadatos Info básicos | PDF.js + `pdf-lib` | **Disponible en la interfaz** | La interfaz edita título, autor, asunto, palabras clave, creador y productor en la copia exportada; las fechas existentes se conservan. No es una limpieza exhaustiva: no garantiza eliminar XMP, IDs, adjuntos ni historial de revisiones. |
| AcroForm existente: texto, checkbox, radio, dropdown y listas | `pdf-lib`, con PDF.js para detección/render | **Disponible en la interfaz con límites** | Rellena campos AcroForm habituales en PDFs sin cifrar y actualiza apariencias. No ejecuta JavaScript; no modifica XFA, botones con acciones, campos de firma, texto enriquecido ni selectores de archivos. Apariencias inusuales o caracteres no admitidos por la fuente pueden impedir el resultado. |
| Crear AcroForms | `pdf-lib` | **No disponible en la interfaz** | La biblioteca puede crear algunos campos, pero Free PDF no ofrece un creador de formularios ni lo anuncia como función del producto. |
| Aplanar formularios AcroForm | `pdf-lib` | **Disponible en la interfaz con límites** | Convierte apariencias compatibles a contenido en una copia nueva. Es irreversible; se rechaza el aplanado si existe un campo de firma digital para no afectar su posible validez. XFA y formularios con widgets o apariencias no compatibles pueden no aplanarse. |
| Rotar, eliminar, duplicar, reordenar, extraer, dividir y unir páginas | `pdf-lib` | **Confirmado para PDFs sin cifrar** | `copyPages`, eliminar y rotación cubren el flujo visible. No hay una interfaz de insertar/reemplazar páginas individuales aún. Se prueban documentos con formularios, enlaces, etiquetas, adjuntos y marcadores porque esas estructuras avanzadas pueden no conservarse como el usuario espera. |
| Reordenar / extraer / unir con PDF.js 6.2.108 | PDF.js `PagesMapper` + `extractPages` | **Experimental, smoke test aprobado** | La API instalada puede copiar, borrar, reordenar, extraer y mezclar páginas. Se comprobó localmente un resultado de tres páginas reordenadas y fusionadas (`C`, `Y`, `A`) que volvió a abrir correctamente. Mantener detrás de un adaptador y habilitarlo tras pruebas con un corpus diverso; no es el escritor canónico de Fase 1. |
| Recortar mediante `CropBox` | `pdf-lib` | **Disponible en la interfaz con límite de seguridad** | Cambia la caja visible de la copia exportada y oculta el exterior al abrirla, pero no borra necesariamente datos fuera de la caja. No se llama redacción segura ni elimina contenido sensible. |
| Números de página y marca de agua delante | Objetos visuales propios + `pdf-lib` | **Disponible en la interfaz** | Se añaden a las páginas actuales como objetos visuales editables y se hacen permanentes al exportar una copia. La marca actual se dibuja encima del contenido; no es una protección, una redacción ni una reconstrucción detrás del contenido. |
| Marca de agua detrás del contenido | Reconstrucción de página con `pdf-lib` | **Parcial / diferido** | Dibujar en el orden normal la deja encima. Para ponerla detrás hay que reconstruir la página, lo que puede afectar interactividad; ofrecerlo sólo tras pruebas, claramente como modo de compatibilidad. |
| PDF a PNG | PDF.js + Canvas | **Disponible en la interfaz** | Exporta la página actual, todas las páginas o un rango como PNG local a escala 1× o 2×. La calidad y memoria dependen de escala, DPR, dimensiones de Canvas y del documento; no ofrece JPEG ni WebP. |
| Imagen a PDF y texto a PDF | Canvas + `pdf-lib` | **Disponible en la interfaz** | Crea un PDF local nuevo con PNG/JPEG o con texto escrito/archivo `.txt` UTF-8. No modifica el original y no es OCR, Word ni una conversión genérica de formatos. |
| OCR de imágenes | Tesseract.js en worker, cuando se instale | **Parcial / diferido** | Tesseract.js trabaja sobre imágenes, no abre PDFs directamente. PDF.js debe renderizar cada página; los idiomas, worker y WASM se autoalojan y se cargan sólo al pedir OCR. La escritura manual no se promete. |
| PDF escaneado a PDF buscable | PDF.js + Tesseract.js | **Parcial / diferido** | Tesseract puede producir salida PDF de una imagen. Al procesar un PDF así se obtiene una copia rasterizada con capa OCR, que puede perder vectores, enlaces, formularios y aumentar el tamaño. No se llamará «OCR sin pérdida sobre el PDF original». |
| Comprimir / optimizar PDF existente | `pdf-lib` base | **Parcial / diferido** | Re-serializar u optimizar imágenes añadidas puede cambiar el tamaño, sin garantía de reducción ni recomprimir imágenes arbitrarias existentes. Un modo de rasterización es necesariamente con pérdida y debe indicarlo. |
| Proteger con contraseña, permisos o cifrado | Ninguno instalado | **No disponible** | `pdf-lib` no soporta documentos cifrados ni crea cifrado. No mostrar controles de seguridad que no produzcan un PDF cifrado verificable. |
| Desbloquear con contraseña conocida | Ninguno instalado | **No disponible para exportación** | PDF.js puede visualizar tras autenticarse, pero no se debe exportar una supuesta copia descifrada con el stack actual. Nunca se intenta romper contraseñas. |
| Redacción segura | MuPDF opcional | **No disponible en el stack actual** | Un rectángulo negro o un texto cubierto son sólo redacción visual. MuPDF expone anotaciones de redacción y `applyRedactions`, pero su incorporación queda bloqueada por licencia y por una prueba de seguridad específica. |
| PDF/A, Word fiel, eliminación forense de datos y edición semántica de contenido | Ninguno instalado | **No disponible** | No se anuncian ni se simulan. Requieren motores, validación y pruebas de interoperabilidad adicionales. |

## Decisiones por fase

### Fase 1 — pilares técnicos a habilitar por incrementos

1. PDF.js para apertura local, render virtualizado, zoom, miniaturas y búsqueda
   de texto local. El prompt de contraseña queda diferido hasta tener su flujo
   completo y probado.
2. Un modelo inmutable de proyecto: bytes fuente + operaciones serializables +
   escena de overlays en coordenadas PDF. Las acciones de UI no mutan un
   `PDFDocument` desde React.
3. `pdf-lib` para exportar una copia: texto añadido, imagen PNG/JPEG,
   formas, dibujo, firma visual, metadatos básicos, rotación, eliminación y
   reordenamiento simple de páginas sin cifrar.
4. Deshacer/rehacer sobre comandos y exportación en worker cuando el tamaño
   del documento lo justifique. Volver a abrir el resultado con PDF.js como
   verificación mínima.
5. Modo visual de reemplazo de texto etiquetado como tal; no como modificación
   semántica ni redacción.

### Diferir hasta una fase posterior y una prueba dedicada

| Función | Condición para habilitarla |
| --- | --- |
| OCR | Instalar Tesseract.js, autoalojar WASM/idiomas, implementar cola cancelable y medir memoria/calidad. |
| Formularios avanzados y XFA | Corpus AcroForm/XFA, apariencias, caracteres no latinos y aplanado en lectores distintos. XFA queda sólo en lectura inicialmente. |
| Editor de anotaciones PDF.js | Adaptador aislado, pruebas de guardar/reabrir y seguimiento de cambios de la API. |
| `extractPages` de PDF.js | Pruebas de regresión con PDFs reales: formularios, adjuntos, enlaces, firmas, etiquetas, rotaciones y documentos grandes. |
| Compresión profunda | Elegir y probar un motor que recomprima de forma verificable; el modo rasterizado debe ser explícitamente con pérdida. |
| Cifrado, desbloqueo, redacción segura y firma digital | Motor especializado y auditoría de seguridad; no basta con Canvas, Web Crypto o `pdf-lib` solos. |
| MuPDF | Decisión de licencia AGPL para todo el producto o compra de licencia comercial, prueba de tamaño/rendimiento WASM y pruebas de salida. |

## MuPDF: capacidad no equivale a autorización de uso

MuPDF.js/MuPDF WASM sería una vía técnica para funciones que el stack actual
no cubre: autenticación de contraseña, permisos, operaciones de páginas,
anotaciones nativas, redacción aplicada y opciones de guardado como
compresión, recolección de objetos y cifrado. Su documentación indica
explícitamente que `applyRedactions` elimina el contenido afectado y que las
opciones de escritura incluyen `encrypt`, contraseñas, compresión y garbage
collection.

Sin embargo, Artifex distribuye MuPDF bajo AGPL o licencia comercial. Incluir
su WASM en GitHub Pages es distribuirlo: antes de añadirlo hay que elegir una
licencia compatible para el repositorio y cumplir sus obligaciones, o adquirir
una licencia comercial. MuPDF WebViewer comercial también requiere una clave
para producción y no es sustituto gratuito de esta decisión. Por ello este
proyecto no lo usa por defecto ni lo presenta como una dependencia libre de
coste/obligaciones.

## Reglas de arquitectura y privacidad

1. **Lector y escritor separados.** PDF.js nunca se llama desde componentes
   de edición para escribir; `PdfReader` y `PdfWriter` se ocultan tras un
   `PDFEngine`/adaptadores tipados.
2. **Una sola geometría.** La escena usa puntos PDF de página, y
   `CoordinateTransformer` delega las conversiones de pantalla a
   `PageViewport`. Zoom, rotación y DPR no cambian las coordenadas guardadas.
3. **Original inmutable.** Se guardan bytes fuente y un journal de comandos;
   el PDF se materializa al exportar a un `Blob` nuevo. IndexedDB es opcional
   y sólo persiste tras consentimiento.
4. **Trabajo pesado fuera de la UI.** PDF.js ya usa worker. OCR y exportaciones
   grandes necesitarán workers, progreso y cancelación antes de anunciarse
   como no bloqueantes. No se transfieren los bytes a una red.
5. **Assets realmente offline.** Worker PDF.js, CMaps/fuentes si se usan,
   archivos `.wasm`, `*.traineddata(.gz)` y sus workers deben estar en el
   build y en la estrategia de caché PWA. La configuración actual de Workbox
   debe incluir extensiones como `mjs`, `wasm` y `gz` cuando se añadan.
6. **Contenido activo desactivado.** No ejecutar JavaScript, acciones, adjuntos
   ni URLs del PDF automáticamente. Si se añade detección con
   `getJSActions()`/`hasJSActions()`, debe avisar sin afirmar que una
   reexportación elimina todo contenido activo sin una prueba específica.

## Fuentes primarias

- [PDF.js API: `PDFDocumentProxy`](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html)
  y [PDFPageProxy](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html).
- APIs locales instaladas: `node_modules/pdfjs-dist/types/src/display/api.d.ts`
  y `pages_mapper.d.ts` (incluyen `saveDocument`, `extractPages`, formularios,
  firmas, adjuntos y `PagesMapper`).
- [pdf-lib: funciones y limitaciones](https://github.com/Hopding/pdf-lib),
  [PDFDocument](https://pdf-lib.js.org/docs/api/classes/pdfdocument),
  [PDFPage](https://pdf-lib.js.org/docs/api/classes/pdfpage),
  [PDFForm](https://pdf-lib.js.org/docs/api/classes/pdfform) y
  [PDFSignature](https://pdf-lib.js.org/docs/api/classes/pdfsignature).
- [FAQ de Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md)
  y [ejemplos de salida PDF](https://github.com/naptha/tesseract.js/blob/master/docs/examples.md).
- [MuPDF JavaScript: `PDFDocument`](https://mupdf.readthedocs.io/en/latest/reference/javascript/types/PDFDocument.html),
  [redacciones](https://mupdf.readthedocs.io/en/1.26.4/reference/javascript/types/PDFPage.html)
  y [opciones de escritura](https://mupdf.readthedocs.io/en/1.28.0/reference/common/pdf-write-options.html).
- [Licencia y distribución de MuPDF](https://mupdf.com/releases) y
  [requisito de licencia de MuPDF WebViewer en producción](https://webviewer-docs.mupdf.com/getting-started).
