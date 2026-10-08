import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type AtriumYaml, slugify } from '@atrium/schema';
import { parseAllDocuments, parse as parseYaml } from 'yaml';

export interface ScanResult {
  doc: AtriumYaml;
  found: string[];
}

type Tech = { name: string; version?: string };

const NPM_TECH: Record<string, string> = {
  react: 'React',
  '@angular/core': 'Angular',
  vue: 'Vue',
  next: 'Next.js',
  express: 'Express',
  '@nestjs/core': 'NestJS',
  fastify: 'Fastify',
  pg: 'PostgreSQL',
  postgres: 'PostgreSQL',
  mysql2: 'MySQL',
  mongodb: 'MongoDB',
  mongoose: 'MongoDB',
  redis: 'Redis',
  ioredis: 'Redis',
  kafkajs: 'Apache Kafka',
  '@prisma/client': 'Prisma',
  typescript: 'TypeScript',
};

const IMAGE_TECH: Array<[RegExp, string]> = [
  [/^(?:.*\/)?node$/, 'Node.js'],
  [/^(?:.*\/)?python$/, 'Python'],
  [/^(?:.*\/)?(?:eclipse-temurin|openjdk|amazoncorretto)$/, 'Java'],
  [/^(?:.*\/)?golang$/, 'Go'],
  [/^(?:.*\/)?postgres$/, 'PostgreSQL'],
  [/^(?:.*\/)?mysql$/, 'MySQL'],
  [/^(?:.*\/)?mariadb$/, 'MariaDB'],
  [/^(?:.*\/)?mongo$/, 'MongoDB'],
  [/^(?:.*\/)?redis$/, 'Redis'],
  [/^(?:.*\/)?nginx$/, 'nginx'],
  [/(?:^|\/)(?:dotnet\/)?aspnet$|dotnet\/runtime$/, '.NET'],
  [/kafka/, 'Apache Kafka'],
];

function majorVersion(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const m = v.replace(/^[^\d]*/, '').match(/^(\d+(?:\.\d+)?)/);
  if (!m) return undefined;
  const [maj, min] = m[1]!.split('.');
  // Keep minor versions where products version that way (Python 3.12, PostgreSQL stays major)
  return min && Number(maj) < 5 ? `${maj}.${min}` : maj;
}

function read(dir: string, file: string): string | null {
  const p = join(dir, file);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function addTech(list: Tech[], t: Tech) {
  const existing = list.find((x) => x.name === t.name);
  if (existing) {
    if (!existing.version && t.version) existing.version = t.version;
    return;
  }
  list.push(t);
}

/** Reads a repository and pre-fills atrium.yaml: name, description, owner, technologies, dependencies. */
export function scanRepository(dir: string): ScanResult {
  const found: string[] = [];
  const techs: Tech[] = [];
  let name = basename(dir);
  let description: string | undefined;
  let owner: string | undefined;
  let team: string | undefined;
  let domain: string | undefined;
  const dependsOn: string[] = [];
  const provides: Array<{
    key: string;
    name?: string;
    protocol?: 'rest' | 'event' | 'graphql' | 'grpc';
  }> = [];
  const consumes: string[] = [];
  let repository: string | undefined;

  // Backstage catalog file: the richest source if present.
  const catalog = read(dir, 'catalog-info.yaml') ?? read(dir, 'catalog-info.yml');
  if (catalog) {
    for (const d of parseAllDocuments(catalog)) {
      const e = d.toJSON() as {
        kind?: string;
        metadata?: { name?: string; title?: string; description?: string };
        spec?: Record<string, unknown>;
      };
      if (e?.kind === 'Component') {
        name = e.metadata?.title ?? e.metadata?.name ?? name;
        description = e.metadata?.description ?? description;
        team = String(e.spec?.owner ?? '').replace(/^group:(default\/)?/, '') || team;
        domain = (e.spec?.system as string) ?? domain;
        for (const dep of (e.spec?.dependsOn as string[]) ?? [])
          dependsOn.push(dep.replace(/^\w+:(default\/)?/, ''));
        for (const api of (e.spec?.providesApis as string[]) ?? [])
          provides.push({ key: api.replace(/^api:(default\/)?/, ''), protocol: 'rest' });
        for (const api of (e.spec?.consumesApis as string[]) ?? [])
          consumes.push(api.replace(/^api:(default\/)?/, ''));
        found.push('catalog-info.yaml (Backstage)');
      }
    }
  }

  const pkg = read(dir, 'package.json');
  if (pkg) {
    const p = JSON.parse(pkg) as {
      name?: string;
      description?: string;
      author?: string | { name?: string };
      engines?: { node?: string };
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    if (!catalog) {
      name = p.name?.replace(/^@[^/]+\//, '') ?? name;
      description = p.description ?? description;
    }
    owner ??= typeof p.author === 'string' ? p.author : p.author?.name;
    const nvmrc = read(dir, '.nvmrc') ?? read(dir, '.node-version');
    addTech(techs, { name: 'Node.js', version: majorVersion(nvmrc?.trim() ?? p.engines?.node) });
    const deps = { ...(p.dependencies ?? {}) };
    for (const [d, v] of Object.entries(deps)) {
      const t = NPM_TECH[d];
      if (t && t !== 'TypeScript' && t !== 'Prisma')
        addTech(techs, {
          name: t,
          version: ['React', 'Angular', 'Vue', 'Next.js', 'NestJS'].includes(t)
            ? majorVersion(v)
            : undefined,
        });
    }
    found.push('package.json');
  }

  const pom = read(dir, 'pom.xml');
  if (pom) {
    const java = pom.match(
      /<(?:maven\.compiler\.release|java\.version|maven\.compiler\.source)>([\d.]+)</,
    )?.[1];
    addTech(techs, { name: 'Java', version: java === '1.8' ? '8' : majorVersion(java) });
    const boot = pom.match(
      /<artifactId>spring-boot-starter-parent<\/artifactId>\s*<version>([\d.]+)/,
    )?.[1];
    if (boot)
      addTech(techs, { name: 'Spring Boot', version: boot.split('.').slice(0, 2).join('.') });
    if (!catalog) {
      name =
        pom.match(/<name>([^<]+)<\/name>/)?.[1] ??
        pom.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1] ??
        name;
      description = pom.match(/<description>([^<]+)<\/description>/)?.[1] ?? description;
    }
    found.push('pom.xml');
  }

  const gradle = read(dir, 'build.gradle') ?? read(dir, 'build.gradle.kts');
  if (gradle) {
    const java =
      gradle.match(/JavaVersion\.VERSION_(\d+)/)?.[1] ??
      gradle.match(/languageVersion\.set\(JavaLanguageVersion\.of\((\d+)\)\)/)?.[1] ??
      gradle.match(/sourceCompatibility\s*=\s*['"]?(\d+)/)?.[1];
    addTech(techs, { name: 'Java', version: java });
    const boot = gradle.match(/org\.springframework\.boot['"]?\)?\s*version\s*['"]([\d.]+)/)?.[1];
    if (boot)
      addTech(techs, { name: 'Spring Boot', version: boot.split('.').slice(0, 2).join('.') });
    found.push('build.gradle');
  }

  const pyproject = read(dir, 'pyproject.toml');
  const requirements = read(dir, 'requirements.txt');
  if (pyproject || requirements) {
    const py =
      pyproject?.match(/requires-python\s*=\s*["'][^\d]*([\d.]+)/)?.[1] ??
      read(dir, '.python-version')?.trim();
    addTech(techs, { name: 'Python', version: majorVersion(py) });
    const text = `${pyproject ?? ''}\n${requirements ?? ''}`.toLowerCase();
    for (const [lib, tech] of [
      ['django', 'Django'],
      ['fastapi', 'FastAPI'],
      ['flask', 'Flask'],
      ['psycopg', 'PostgreSQL'],
      ['sqlalchemy', 'SQLAlchemy'],
      ['pyspark', 'Apache Spark'],
    ]) {
      if (text.includes(lib!)) addTech(techs, { name: tech! });
    }
    if (!catalog && pyproject) {
      name = pyproject.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? name;
      description = pyproject.match(/^description\s*=\s*"([^"]+)"/m)?.[1] ?? description;
    }
    found.push(pyproject ? 'pyproject.toml' : 'requirements.txt');
  }

  const gomod = read(dir, 'go.mod');
  if (gomod) {
    addTech(techs, { name: 'Go', version: gomod.match(/^go\s+([\d.]+)/m)?.[1] });
    found.push('go.mod');
  }

  const csproj = readdirSync(dir).find((f) => f.endsWith('.csproj'));
  if (csproj) {
    const tf = read(dir, csproj)?.match(/<TargetFramework>net(\d+)\.\d+</)?.[1];
    addTech(techs, { name: '.NET', version: tf });
    found.push(csproj);
  }

  const dockerfile = read(dir, 'Dockerfile');
  if (dockerfile) {
    for (const m of dockerfile.matchAll(/^FROM\s+([^\s:]+)(?::([^\s]+))?/gim)) {
      const image = m[1]!.toLowerCase();
      const hit = IMAGE_TECH.find(([re]) => re.test(image));
      if (hit) addTech(techs, { name: hit[1], version: majorVersion(m[2]) });
    }
    found.push('Dockerfile');
  }

  for (const compose of [
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ]) {
    const text = read(dir, compose);
    if (!text) continue;
    try {
      const c = parseYaml(text) as { services?: Record<string, { image?: string }> };
      for (const svc of Object.values(c.services ?? {})) {
        if (!svc.image) continue;
        const [image, tag] = svc.image.toLowerCase().split(':');
        const hit = IMAGE_TECH.find(([re]) => re.test(image!));
        if (hit && !['Node.js', 'Python', 'Java', 'Go', '.NET'].includes(hit[1]))
          addTech(techs, { name: hit[1], version: majorVersion(tag) });
      }
      found.push(compose);
    } catch {
      // ignore
    }
  }

  try {
    repository = execSync('git config --get remote.origin.url', {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/\.git$/, '');
  } catch {
    // not a git repo
  }

  const pretty = name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const doc: AtriumYaml = {
    apiVersion: 'atrium/v1',
    kind: 'Service',
    metadata: {
      key: slugify(name) || 'my-service',
      name: pretty,
      description,
      owner,
      team,
      domain,
      lifecycle: 'active',
      links: repository ? { repository } : undefined,
    },
    spec: {
      dependsOn: dependsOn.length ? dependsOn : undefined,
      provides: provides.length ? provides : undefined,
      consumes: consumes.length ? consumes : undefined,
      technologies: techs.length ? techs : undefined,
    },
  };
  return { doc, found };
}
