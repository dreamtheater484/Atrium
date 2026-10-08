import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@atrium/ui';
import { ui, useUi } from '../../lib/store';

export function ImportWizard() {
  const open = useUi((s) => s.importOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => ui.set({ importOpen: o })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>Coming in the next step.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
