import { describe, expect, it } from 'vitest';
import { applyOrder, type PendingChange } from './builder';

const create = (id: string, after: Record<string, unknown> = {}): PendingChange => ({
  op: 'create',
  entity: 'element',
  id,
  before: null,
  after: { id, parentId: null, domainId: null, ...after },
});

describe('applyOrder', () => {
  it('keeps the order changes were made in when nothing points ahead', () => {
    const changes = [create('a'), create('b', { parentId: 'a' }), create('c')];
    expect(applyOrder(changes).map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('moves an element after the parent and domain created later in the same set', () => {
    // An import meets "b" as a parent first, then its own row gives it parent "c".
    const changes = [
      create('a', { parentId: 'b' }),
      create('b', { parentId: 'c', domainId: 'd' }),
      create('c'),
      create('d'),
      {
        op: 'create',
        entity: 'relation',
        id: 'r',
        before: null,
        after: { id: 'r', sourceId: 'a', targetId: 'e' },
      } satisfies PendingChange,
      create('e'),
    ];
    const order = applyOrder(changes).map((c) => c.id);
    expect(order).toEqual(['c', 'd', 'b', 'a', 'e', 'r']);
  });

  it('does not loop on a cycle', () => {
    const changes = [create('a', { parentId: 'b' }), create('b', { parentId: 'a' })];
    expect(applyOrder(changes)).toHaveLength(2);
  });
});
