import { Copy, RotateCw, Trash2, Type } from "lucide-react";
import type { ReactNode } from "react";
import { useEditorStore } from "@/features/editor/store/editorStore";
import type { EditorObject } from "@/types/pdf";

export function InspectorPanel() {
  const project = useEditorStore((state) => state.project);
  const activePageId = useEditorStore((state) => state.activePageId);
  const selectedObjectIds = useEditorStore((state) => state.selectedObjectIds);
  const updateObject = useEditorStore((state) => state.updateObject);
  const removeObject = useEditorStore((state) => state.removeObject);
  const rotatePage = useEditorStore((state) => state.rotatePage);
  const duplicatePage = useEditorStore((state) => state.duplicatePage);
  const deletePage = useEditorStore((state) => state.deletePage);

  const selectedObject = project?.overlays.find((object) => object.id === selectedObjectIds[0]);
  const activePage = project?.pages.find((page) => page.id === activePageId);

  return (
    <aside className="inspector" aria-label="Propiedades">
      <div className="panel-heading"><h2>Propiedades</h2></div>
      <div className="inspector__body">
        {selectedObject ? (
          <ObjectInspector object={selectedObject} onUpdate={(update) => updateObject(selectedObject.id, update)} onDelete={() => removeObject(selectedObject.id)} />
        ) : activePage && project ? (
          <section className="inspector__section">
            <h3 className="inspector__section-title">Página {project.pages.findIndex((page) => page.id === activePage.id) + 1}</h3>
            <p className="inspector__hint">Las operaciones modifican la copia de trabajo. El PDF original queda intacto.</p>
            <button type="button" className="btn" onClick={() => rotatePage(activePage.id, 90)}><RotateCw size={14} /> Rotar 90°</button>
            <button type="button" className="btn" onClick={() => duplicatePage(activePage.id)}><Copy size={14} /> Duplicar página</button>
            <button type="button" className="btn btn--danger" disabled={project.pages.length <= 1} onClick={() => deletePage(activePage.id)}><Trash2 size={14} /> Eliminar página</button>
          </section>
        ) : (
          <div className="inspector__empty"><Type size={21} aria-hidden="true" /><p>Selecciona un objeto para editar sus propiedades.</p></div>
        )}
      </div>
    </aside>
  );
}

interface ObjectInspectorProps {
  object: EditorObject;
  onUpdate: (update: (object: EditorObject) => EditorObject) => void;
  onDelete: () => void;
}

function ObjectInspector({ object, onUpdate, onDelete }: ObjectInspectorProps) {
  const supportsGeometry = object.type !== "drawing";
  const geometry = supportsGeometry ? (
    <section className="inspector__section">
      <h3 className="inspector__section-title">Posición y tamaño</h3>
      <div className="inspector__grid">
        <NumberField label="X" value={object.x} onChange={(value) => onUpdate((current) => ({ ...current, x: value }))} />
        <NumberField label="Y" value={object.y} onChange={(value) => onUpdate((current) => ({ ...current, y: value }))} />
        <NumberField label="Ancho" value={object.width} min={16} onChange={(value) => onUpdate((current) => ({ ...current, width: value }))} />
        <NumberField label="Alto" value={object.height} min={16} onChange={(value) => onUpdate((current) => ({ ...current, height: value }))} />
      </div>
    </section>
  ) : null;

  return (
    <>
      {object.type === "text" && (
        <section className="inspector__section">
          <h3 className="inspector__section-title">Texto</h3>
          <label className="inspector__field">
            <span className="field-label">Contenido</span>
            <textarea className="field-input inspector__textarea" value={object.text} rows={4} onChange={(event) => onUpdate((current) => current.type === "text" ? { ...current, text: event.target.value } : current)} />
          </label>
          <div className="inspector__grid">
            <NumberField label="Tamaño" value={object.fontSize} min={6} onChange={(value) => onUpdate((current) => current.type === "text" ? { ...current, fontSize: value, lineHeight: Math.max(value * 1.22, current.lineHeight) } : current)} />
            <ColorField label="Color" value={object.color} onChange={(value) => onUpdate((current) => current.type === "text" ? { ...current, color: value } : current)} />
          </div>
          <div className="style-buttons" aria-label="Estilo del texto">
            <ToggleButton label="Negrita" active={object.fontWeight === "bold"} onClick={() => onUpdate((current) => current.type === "text" ? { ...current, fontWeight: current.fontWeight === "bold" ? "normal" : "bold" } : current)}>B</ToggleButton>
            <ToggleButton label="Cursiva" active={object.fontStyle === "italic"} onClick={() => onUpdate((current) => current.type === "text" ? { ...current, fontStyle: current.fontStyle === "italic" ? "normal" : "italic" } : current)}><em>I</em></ToggleButton>
            <ToggleButton label="Subrayado" active={object.textDecoration === "underline"} onClick={() => onUpdate((current) => current.type === "text" ? { ...current, textDecoration: current.textDecoration === "underline" ? "none" : "underline" } : current)}><u>U</u></ToggleButton>
          </div>
        </section>
      )}
      {object.type === "note" && (
        <section className="inspector__section">
          <h3 className="inspector__section-title">Nota visual</h3>
          <p className="inspector__hint">La nota se aplanará como contenido visual en la copia exportada; no es un comentario PDF nativo.</p>
          <label className="inspector__field">
            <span className="field-label">Contenido</span>
            <textarea className="field-input inspector__textarea" value={object.content} rows={4} onChange={(event) => onUpdate((current) => current.type === "note" ? { ...current, content: event.target.value } : current)} />
          </label>
          <div className="inspector__grid">
            <ColorField label="Fondo" value={object.color} onChange={(value) => onUpdate((current) => current.type === "note" ? { ...current, color: value } : current)} />
            <ColorField label="Texto" value={object.textColor} onChange={(value) => onUpdate((current) => current.type === "note" ? { ...current, textColor: value } : current)} />
          </div>
          <NumberField label="Tamaño" value={object.fontSize} min={7} onChange={(value) => onUpdate((current) => current.type === "note" ? { ...current, fontSize: value } : current)} />
        </section>
      )}
      {object.type === "shape" && (
        <section className="inspector__section">
          <h3 className="inspector__section-title">Forma</h3>
          <div className="inspector__grid">
            <ColorField label="Relleno" value={object.fillColor ?? "#ffffff"} onChange={(value) => onUpdate((current) => current.type === "shape" ? { ...current, fillColor: value } : current)} />
            <ColorField label="Borde" value={object.stroke?.color ?? "#2854db"} onChange={(value) => onUpdate((current) => current.type === "shape" ? { ...current, stroke: { ...(current.stroke ?? { width: 1.5 }), color: value } } : current)} />
          </div>
          <NumberField label="Grosor del borde" value={object.stroke?.width ?? 0} min={0} step={0.5} onChange={(value) => onUpdate((current) => current.type === "shape" ? { ...current, stroke: value === 0 ? null : { ...(current.stroke ?? { color: "#2854db" }), width: value } } : current)} />
        </section>
      )}
      {object.type === "image" && (
        <section className="inspector__section"><h3 className="inspector__section-title">Imagen</h3><p className="inspector__hint">La imagen se incrusta en la copia exportada. No se sube a ningún servidor.</p></section>
      )}
      {object.type === "signature" && (
        <section className="inspector__section"><h3 className="inspector__section-title">Firma visual</h3><p className="inspector__hint">Esta firma es una representación visual. No es una firma digital certificada.</p></section>
      )}
      {object.type === "stamp" && (
        <section className="inspector__section"><h3 className="inspector__section-title">Sello visual</h3><p className="inspector__hint">«{object.stamp.label}» se incorporará como contenido visual permanente. No es una anotación PDF nativa ni una aprobación verificable.</p></section>
      )}
      {object.type === "drawing" && (
        <section className="inspector__section"><h3 className="inspector__section-title">Trazo</h3><p className="inspector__hint">Usa Deshacer o Eliminar para retirar este trazo.</p></section>
      )}
      <section className="inspector__section">
        <h3 className="inspector__section-title">Apariencia</h3>
        <NumberField label="Opacidad (%)" value={Math.round(object.opacity * 100)} min={0} max={100} onChange={(value) => onUpdate((current) => ({ ...current, opacity: value / 100 }))} />
        {supportsGeometry && <NumberField label="Rotación" value={object.rotation} onChange={(value) => onUpdate((current) => ({ ...current, rotation: value }))} />}
      </section>
      {geometry}
      <button className="btn btn--danger" type="button" onClick={onDelete}><Trash2 size={14} /> Eliminar objeto</button>
    </>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, min, max, step = 1, onChange }: NumberFieldProps) {
  return <label className="inspector__field"><span className="field-label">{label}</span><input className="field-input" type="number" value={Number.isFinite(value) ? Number(value.toFixed(1)) : 0} min={min} max={max} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} /></label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="inspector__field"><span className="field-label">{label}</span><input className="field-input" type="color" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function ToggleButton({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={`style-button ${active ? "is-active" : ""}`} type="button" title={label} aria-pressed={active} onClick={onClick}>{children}</button>;
}
