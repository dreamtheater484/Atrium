import { FileUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { openImport } from '../../lib/store';

/** Drop a file anywhere in Atrium to import it. */
export function GlobalDropZone() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) openImport(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-primary/10 p-6 backdrop-blur-[1px]">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-surface px-12 py-10 text-center shadow-lg">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <FileUp className="size-6" />
        </span>
        <p className="text-base font-semibold">Drop to import</p>
        <p className="text-[13px] text-muted-foreground">Excel, CSV, ArchiMate, Backstage or atrium.yaml</p>
      </div>
    </div>
  );
}
