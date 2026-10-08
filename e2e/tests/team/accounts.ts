import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ADMIN = {
  name: 'Ada Admin',
  email: 'ada@acme.test',
  password: 'correct horse battery staple',
};

export const ENGINEER = {
  name: 'Eli Engineer',
  email: 'eli@acme.test',
  password: 'another long test password',
};

const AUTH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.auth');
export const ADMIN_STATE = join(AUTH, 'admin.json');
export const ENGINEER_STATE = join(AUTH, 'engineer.json');
