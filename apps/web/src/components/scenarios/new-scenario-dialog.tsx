import type { Scenario } from '@atrium/schema';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  Textarea,
} from '@atrium/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useInvalidateModel } from '../../lib/queries';
import { ui } from '../../lib/store';

export function NewScenarioDialog({
  open,
  onOpenChange,
  makeTarget,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  makeTarget?: boolean;
}) {
  const nextYear = new Date().getFullYear() + 2;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isTarget, setIsTarget] = useState(!!makeTarget);
  const [targetDate, setTargetDate] = useState(`${nextYear}-12-31`);
  const invalidate = useInvalidateModel();
  const create = useMutation({
    mutationFn: () => api<Scenario>('/scenarios', { body: { name: name.trim(), description, isTarget, targetDate } }),
    onSuccess: (s) => {
      invalidate();
      ui.set({ scenario: s.isTarget ? 'target' : s.id });
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      setIsTarget(!!makeTarget);
      setName(makeTarget ? `Target ${nextYear}` : '');
      setDescription('');
    }
  }, [open, makeTarget, nextYear]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isTarget ? 'Plan the target state' : 'New what-if scenario'}</DialogTitle>
          <DialogDescription>
            A scenario starts as a copy of today. Edit it freely; today's model doesn't change until you decide it should.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="sc-name">Name</Label>
            <Input id="sc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cloud-first variant" autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sc-desc">What are you exploring?</Label>
            <Textarea id="sc-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sc-date">Target date</Label>
              <Input id="sc-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 self-end pb-1.5 text-[13px]">
              <Switch checked={isTarget} onCheckedChange={setIsTarget} /> This is our agreed target
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
