import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@atrium/ui';
import { ui, useUi } from '../../lib/store';

export function ConnectAgentDialog() {
  const open = useUi((s) => s.connectAgentOpen);
  return (
    <Dialog open={open} onOpenChange={(o) => ui.set({ connectAgentOpen: o })}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a coding agent</DialogTitle>
          <DialogDescription>Coming in the next step.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
