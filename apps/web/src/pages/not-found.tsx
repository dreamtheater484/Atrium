import { Button, EmptyState } from '@atrium/ui';
import { Link } from '@tanstack/react-router';
import { Compass } from 'lucide-react';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={<Compass />}
      title="This page doesn't exist"
      className="mt-24"
      action={
        <Button asChild variant="primary">
          <Link to="/">Go home</Link>
        </Button>
      }
    >
      The link may be out of date.
    </EmptyState>
  );
}
