import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Sql } from '@atrium/db';

/** endoflife.date product id → words that identify it in a technology name. */
export const EOL_PRODUCTS: Record<string, string[]> = {
  postgresql: ['postgresql', 'postgres', 'pgsql'],
  mysql: ['mysql'],
  mariadb: ['mariadb'],
  mongodb: ['mongodb', 'mongo'],
  redis: ['redis'],
  elasticsearch: ['elasticsearch', 'elastic search'],
  mssqlserver: ['sql server', 'mssql', 'mssqlserver'],
  'oracle-database': ['oracle database', 'oracle db', 'oracle'],
  'ibm-db2': ['db2'],
  'apache-cassandra': ['cassandra'],
  nodejs: ['node.js', 'nodejs', 'node js', 'node'],
  python: ['python'],
  'oracle-jdk': ['java', 'jdk', 'oracle jdk', 'jre'],
  'eclipse-temurin': ['temurin', 'adoptium', 'openjdk'],
  dotnet: ['.net core', 'dotnet', '.net'],
  dotnetfx: ['.net framework'],
  php: ['php'],
  ruby: ['ruby'],
  go: ['golang', 'go'],
  kotlin: ['kotlin'],
  angular: ['angular'],
  angularjs: ['angularjs', 'angular.js'],
  react: ['react'],
  vue: ['vue', 'vue.js'],
  nextjs: ['next.js', 'nextjs'],
  'spring-boot': ['spring boot', 'spring-boot'],
  'spring-framework': ['spring framework', 'spring'],
  django: ['django'],
  rails: ['rails', 'ruby on rails'],
  laravel: ['laravel'],
  kubernetes: ['kubernetes', 'k8s'],
  'red-hat-openshift': ['openshift'],
  'docker-engine': ['docker'],
  ubuntu: ['ubuntu'],
  rhel: ['rhel', 'red hat enterprise linux'],
  centos: ['centos'],
  debian: ['debian'],
  sles: ['sles', 'suse linux enterprise'],
  'oracle-linux': ['oracle linux'],
  'windows-server': ['windows server'],
  'alpine-linux': ['alpine'],
  nginx: ['nginx'],
  'apache-http-server': ['apache http', 'httpd', 'apache web server'],
  tomcat: ['tomcat'],
  'apache-kafka': ['kafka'],
  rabbitmq: ['rabbitmq'],
  'apache-activemq': ['activemq'],
  'ibm-mq': ['ibm mq', 'websphere mq', 'mq series'],
  'mulesoft-runtime': ['mulesoft', 'mule runtime', 'mule'],
  'apache-camel': ['camel'],
  'apache-spark': ['spark'],
  'apache-hadoop': ['hadoop'],
  'apache-airflow': ['airflow'],
  jenkins: ['jenkins'],
  terraform: ['terraform'],
  esxi: ['esxi', 'vsphere'],
  vcenter: ['vcenter'],
  sharepoint: ['sharepoint'],
  solr: ['solr'],
  'couchbase-server': ['couchbase'],
};

interface SnapshotCycle {
  c: string;
  eol: string | boolean;
  r?: string;
}

let snapshot: { fetchedAt: string; products: Record<string, SnapshotCycle[]> } | null = null;

function loadSnapshot() {
  if (snapshot) return snapshot;
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, '..', 'data', 'eol-snapshot.json'), join(here, 'data', 'eol-snapshot.json')]) {
    try {
      snapshot = JSON.parse(readFileSync(p, 'utf8'));
      return snapshot!;
    } catch {
      // try next location
    }
  }
  snapshot = { fetchedAt: '', products: {} };
  return snapshot;
}

/** Guesses the endoflife.date product from a technology name like "PostgreSQL 12". */
export function inferProduct(name: string, product?: string | null): string | null {
  const candidates = [product, name].filter(Boolean).map((s) => ` ${s!.toLowerCase()} `);
  // Longest alias first so "spring boot" wins over "spring" and "oracle linux" over "oracle".
  const aliases = Object.entries(EOL_PRODUCTS)
    .flatMap(([id, words]) => words.map((w) => [id, w] as const))
    .sort((a, b) => b[1].length - a[1].length);
  for (const text of candidates) {
    if (product && EOL_PRODUCTS[product.toLowerCase()]) return product.toLowerCase();
    for (const [id, word] of aliases) {
      const re = new RegExp(`[^a-z]${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`);
      if (re.test(text)) return id;
    }
  }
  return null;
}

/** Extracts a version like "12", "8", "2012 R2" or "16.04" from a name. */
export function inferVersion(name: string): string | null {
  const m = name.match(/\b(\d{4}\s?r2|\d+(?:\.\d+){0,2})\b/i);
  return m ? m[1]!.replace(/\s/g, ' ').toUpperCase().replace('R2', 'R2') : null;
}

export interface EolInfo {
  product: string;
  cycle: string;
  eolDate: string | null;
  supported: boolean | null;
  source: 'snapshot' | 'live';
}

function matchCycle(cycles: SnapshotCycle[], version: string): SnapshotCycle | undefined {
  const v = version.toLowerCase().replace(/\s+/g, '-');
  const exact = cycles.find((c) => c.c.toLowerCase() === v);
  if (exact) return exact;
  // "12.4" → cycle "12"; "16.04.3" → "16.04"
  return cycles
    .filter((c) => v.startsWith(`${c.c.toLowerCase()}.`) || v.startsWith(`${c.c.toLowerCase()}-`))
    .sort((a, b) => b.c.length - a.c.length)[0];
}

function toInfo(product: string, cycle: SnapshotCycle, source: EolInfo['source']): EolInfo {
  const eolDate = typeof cycle.eol === 'string' ? cycle.eol : null;
  const supported = typeof cycle.eol === 'boolean' ? !cycle.eol : null;
  return { product, cycle: cycle.c, eolDate, supported, source };
}

/** Looks up end of life from the bundled snapshot (works offline). */
export function lookupEol(product: string, version: string | null | undefined): EolInfo | null {
  if (!version) return null;
  const cycles = loadSnapshot().products[product];
  if (!cycles) return null;
  const cycle = matchCycle(cycles, version);
  return cycle ? toInfo(product, cycle, 'snapshot') : null;
}

/** Optional live lookup with a 30-day cache in Postgres. */
export class EolService {
  constructor(
    private sql: Sql,
    private live: boolean,
  ) {}

  async lookup(name: string, product?: string | null, version?: string | null): Promise<EolInfo | null> {
    const id = inferProduct(name, product);
    const ver = version || inferVersion(name);
    if (!id || !ver) return null;
    if (this.live) {
      try {
        const cached = await this.sql`
          select data from eol_cache where product = ${id} and fetched_at > now() - interval '30 days'`;
        let cycles = cached[0]?.data as SnapshotCycle[] | undefined;
        if (!cycles) {
          const res = await fetch(`https://endoflife.date/api/${id}.json`, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const raw = (await res.json()) as Array<{ cycle: string; eol: string | boolean; releaseDate?: string }>;
            cycles = raw.map((c) => ({ c: String(c.cycle), eol: c.eol, r: c.releaseDate }));
            await this.sql`
              insert into eol_cache (product, data) values (${id}, ${this.sql.json(cycles as never)})
              on conflict (product) do update set data = excluded.data, fetched_at = now()`;
          }
        }
        if (cycles) {
          const c = matchCycle(cycles, ver);
          if (c) return toInfo(id, c, 'live');
        }
      } catch {
        // fall back to the snapshot
      }
    }
    return lookupEol(id, ver);
  }
}
