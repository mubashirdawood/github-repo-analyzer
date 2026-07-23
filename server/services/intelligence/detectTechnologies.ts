import type { ProjectType, TechnologyStack } from './types.js';
import {
  collectNpmDeps,
  hasNpmDep,
  parseComposerJson,
  textIncludesAny
} from './manifests.js';
import type { ProjectTypeSignals } from './detectProjectType.js';
import { getFileName } from './ignore.js';

function firstMatch(checks: Array<[boolean, string]>): string | null {
  for (const [ok, label] of checks) {
    if (ok) return label;
  }
  return null;
}

function joinUnique(labels: Array<string | null | undefined>): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out.length ? out.join(', ') : null;
}

/**
 * Extract the technology stack object from manifests + path cues.
 */
export function detectTechnologies(
  signals: ProjectTypeSignals,
  projectType: ProjectType
): TechnologyStack {
  const deps = collectNpmDeps(signals.packageJson ?? null);
  const req = signals.requirementsText ?? '';
  const pyproject = signals.pyprojectText ?? '';
  const pom = signals.pomXml ?? '';
  const gradle = signals.buildGradle ?? '';
  const composerRaw = signals.composerJson ?? '';
  const composer = parseComposerJson(composerRaw);
  const csproj = signals.csprojText ?? '';
  const files = signals.files.map((f) => f.toLowerCase());
  const names = new Set(files.map((f) => getFileName(f)));
  const blob = files.join('\n');

  const hasFile = (...needles: string[]) =>
    needles.some((n) => names.has(n.toLowerCase()) || blob.includes(n.toLowerCase()));

  // —— Frontend ——
  const frontend = firstMatch([
    [projectType === 'Next.js' || hasNpmDep(deps, 'next'), 'Next.js'],
    [projectType === 'Angular' || hasNpmDep(deps, '@angular/core'), 'Angular'],
    [projectType === 'Vue' || hasNpmDep(deps, 'vue'), 'Vue'],
    [hasNpmDep(deps, 'svelte', '@sveltejs/kit'), 'Svelte'],
    [projectType === 'React' || projectType === 'MERN' || hasNpmDep(deps, 'react'), 'React'],
    [hasNpmDep(deps, 'solid-js'), 'SolidJS']
  ]);

  // —— Backend ——
  const backend = firstMatch([
    [projectType === 'NestJS' || hasNpmDep(deps, '@nestjs/core'), 'NestJS'],
    [projectType === 'Express' || projectType === 'MERN' || hasNpmDep(deps, 'express'), 'Express'],
    [hasNpmDep(deps, 'fastify'), 'Fastify'],
    [hasNpmDep(deps, 'koa'), 'Koa'],
    [hasNpmDep(deps, 'hapi', '@hapi/hapi'), 'Hapi'],
    [projectType === 'Django' || textIncludesAny(req, ['django']) || textIncludesAny(pyproject, ['django']), 'Django'],
    [projectType === 'Flask' || textIncludesAny(req, ['flask']) || textIncludesAny(pyproject, ['flask']), 'Flask'],
    [textIncludesAny(req, ['fastapi']) || textIncludesAny(pyproject, ['fastapi']), 'FastAPI'],
    [projectType === 'Spring Boot' || textIncludesAny(pom, ['spring-boot']) || textIncludesAny(gradle, ['spring-boot']), 'Spring Boot'],
    [projectType === 'Laravel' || Boolean(composer?.require?.['laravel/framework']), 'Laravel'],
    [projectType === 'ASP.NET' || textIncludesAny(csproj, ['Microsoft.AspNetCore']), 'ASP.NET'],
    [hasNpmDep(deps, 'next') && hasFile('app/api', 'pages/api'), 'Next.js API Routes']
  ]);

  // —— Framework (primary runtime identity) ——
  const framework =
    projectType !== 'Unknown'
      ? projectType
      : joinUnique([frontend, backend]);

  // —— Database ——
  const database = joinUnique([
    firstMatch([
      [hasNpmDep(deps, 'mongoose', 'mongodb') || textIncludesAny(req, ['pymongo', 'mongoengine']), 'MongoDB'],
      [
        hasNpmDep(deps, 'pg', 'postgres', 'postgresql') ||
          (hasNpmDep(deps, 'prisma') && (blob.includes('postgresql') || blob.includes('postgres'))) ||
          textIncludesAny(req, ['psycopg', 'asyncpg']),
        'PostgreSQL'
      ],
      [hasNpmDep(deps, 'mysql', 'mysql2', 'mariadb') || textIncludesAny(req, ['mysqlclient', 'pymysql']), 'MySQL'],
      [hasNpmDep(deps, 'sqlite3', 'better-sqlite3') || textIncludesAny(req, ['sqlite']), 'SQLite'],
      [hasNpmDep(deps, '@supabase/supabase-js'), 'Supabase'],
      [hasNpmDep(deps, 'firebase', 'firebase-admin'), 'Firebase'],
      [hasNpmDep(deps, '@neondatabase/serverless'), 'Neon']
    ]),
    hasNpmDep(deps, 'prisma') || hasFile('schema.prisma') ? 'Prisma' : null,
    hasNpmDep(deps, 'typeorm') ? 'TypeORM' : null,
    hasNpmDep(deps, 'sequelize') ? 'Sequelize' : null,
    hasNpmDep(deps, 'drizzle-orm') ? 'Drizzle' : null,
    textIncludesAny(req, ['sqlalchemy']) ? 'SQLAlchemy' : null,
    textIncludesAny(pom + gradle, ['mongodb']) ? 'MongoDB' : null,
    textIncludesAny(pom + gradle, ['postgresql', 'postgres']) ? 'PostgreSQL' : null,
    textIncludesAny(composerRaw, ['doctrine/dbal']) ? 'Doctrine' : null
  ]);

  // —— Auth ——
  const authentication = firstMatch([
    [hasNpmDep(deps, 'next-auth', '@auth/core'), 'NextAuth'],
    [hasNpmDep(deps, 'passport'), 'Passport'],
    [hasNpmDep(deps, 'jsonwebtoken', 'jose', 'bcrypt', 'bcryptjs'), 'JWT'],
    [hasNpmDep(deps, '@clerk/nextjs', '@clerk/clerk-react'), 'Clerk'],
    [hasNpmDep(deps, '@supabase/auth-helpers-nextjs', '@supabase/auth-ui-react'), 'Supabase Auth'],
    [hasNpmDep(deps, 'firebase') && blob.includes('auth'), 'Firebase Auth'],
    [hasNpmDep(deps, 'auth0', '@auth0/nextjs-auth0'), 'Auth0'],
    [textIncludesAny(req, ['djangorestframework-simplejwt', 'django-allauth', 'PyJWT']), 'Django Auth / JWT'],
    [textIncludesAny(pom + gradle, ['spring-security']), 'Spring Security'],
    [textIncludesAny(composerRaw, ['laravel/sanctum', 'laravel/passport']), 'Laravel Sanctum/Passport'],
    [textIncludesAny(csproj, ['Microsoft.AspNetCore.Identity', 'JwtBearer']), 'ASP.NET Identity']
  ]);

  // —— State management ——
  const stateManagement = firstMatch([
    [hasNpmDep(deps, '@reduxjs/toolkit', 'redux', 'react-redux'), 'Redux'],
    [hasNpmDep(deps, 'zustand'), 'Zustand'],
    [hasNpmDep(deps, 'jotai'), 'Jotai'],
    [hasNpmDep(deps, 'recoil'), 'Recoil'],
    [hasNpmDep(deps, 'mobx', 'mobx-react', 'mobx-react-lite'), 'MobX'],
    [hasNpmDep(deps, 'xstate', '@xstate/react'), 'XState'],
    [hasNpmDep(deps, 'vuex'), 'Vuex'],
    [hasNpmDep(deps, 'pinia'), 'Pinia'],
    [hasNpmDep(deps, '@ngrx/store'), 'NgRx'],
    [hasNpmDep(deps, '@tanstack/react-query', 'react-query'), 'TanStack Query']
  ]);

  // —— UI library ——
  const uiLibrary = firstMatch([
    [hasNpmDep(deps, '@mui/material', '@material-ui/core'), 'Material UI'],
    [hasNpmDep(deps, 'antd'), 'Ant Design'],
    [hasNpmDep(deps, '@chakra-ui/react'), 'Chakra UI'],
    [hasNpmDep(deps, '@shadcn/ui') || hasFile('components/ui'), 'shadcn/ui'],
    [hasNpmDep(deps, 'tailwindcss'), 'Tailwind CSS'],
    [hasNpmDep(deps, 'bootstrap', 'react-bootstrap'), 'Bootstrap'],
    [hasNpmDep(deps, '@headlessui/react'), 'Headless UI'],
    [hasNpmDep(deps, 'vuetify'), 'Vuetify'],
    [hasNpmDep(deps, 'primevue', 'primereact'), 'PrimeNG/PrimeReact'],
    [hasNpmDep(deps, '@angular/material'), 'Angular Material'],
    [hasNpmDep(deps, 'styled-components'), 'styled-components'],
    [hasNpmDep(deps, '@emotion/react', '@emotion/styled'), 'Emotion']
  ]);

  // —— Deployment ——
  const deployment = firstMatch([
    [hasFile('dockerfile', 'dockerfile.dev', 'docker-compose.yml', 'docker-compose.yaml', 'compose.yaml'), 'Docker'],
    [hasFile('vercel.json') || hasNpmDep(deps, 'vercel'), 'Vercel'],
    [hasFile('netlify.toml'), 'Netlify'],
    [hasFile('fly.toml'), 'Fly.io'],
    [hasFile('render.yaml'), 'Render'],
    [hasFile('procfile'), 'Heroku/Procfile'],
    [hasFile('.github/workflows') || blob.includes('.github/workflows/'), 'GitHub Actions'],
    [hasFile('serverless.yml', 'serverless.yaml'), 'Serverless'],
    [hasFile('kubernetes', 'k8s') || blob.includes('/k8s/'), 'Kubernetes'],
    [textIncludesAny(csproj, ['Azure']), 'Azure']
  ]);

  // —— Testing ——
  const testing = joinUnique([
    firstMatch([
      [hasNpmDep(deps, 'vitest'), 'Vitest'],
      [hasNpmDep(deps, 'jest', '@types/jest'), 'Jest'],
      [hasNpmDep(deps, 'mocha'), 'Mocha'],
      [hasNpmDep(deps, 'ava'), 'AVA']
    ]),
    hasNpmDep(deps, 'cypress') ? 'Cypress' : null,
    hasNpmDep(deps, 'playwright', '@playwright/test') ? 'Playwright' : null,
    hasNpmDep(deps, '@testing-library/react', '@testing-library/jest-dom')
      ? 'Testing Library'
      : null,
    textIncludesAny(req + pyproject, ['pytest']) ? 'pytest' : null,
    textIncludesAny(pom + gradle, ['junit', 'testng']) ? 'JUnit' : null,
    textIncludesAny(composerRaw, ['phpunit']) ? 'PHPUnit' : null,
    textIncludesAny(csproj, ['xunit', 'nunit', 'mstest']) ? 'xUnit/NUnit' : null
  ]);

  // —— Realtime ——
  const realtime = firstMatch([
    [hasNpmDep(deps, 'socket.io', 'socket.io-client'), 'Socket.IO'],
    [hasNpmDep(deps, 'ws'), 'WebSocket (ws)'],
    [hasNpmDep(deps, 'pusher', 'pusher-js'), 'Pusher'],
    [hasNpmDep(deps, '@supabase/realtime-js'), 'Supabase Realtime'],
    [hasNpmDep(deps, 'ably'), 'Ably'],
    [hasNpmDep(deps, 'firebase') && blob.includes('firestore'), 'Firebase Realtime/Firestore'],
    [textIncludesAny(req, ['channels', 'django-channels']), 'Django Channels'],
    [textIncludesAny(composerRaw, ['laravel-echo', 'pusher/pusher-php-server']), 'Laravel Echo']
  ]);

  // —— Cache ——
  const cache = firstMatch([
    [hasNpmDep(deps, 'ioredis', 'redis', '@redis/client'), 'Redis'],
    [hasNpmDep(deps, 'memjs', 'memcached'), 'Memcached'],
    [hasNpmDep(deps, 'node-cache', 'lru-cache'), 'In-memory cache'],
    [textIncludesAny(req, ['redis', 'django-redis']), 'Redis'],
    [textIncludesAny(pom + gradle, ['redis']), 'Redis'],
    [textIncludesAny(composerRaw, ['predis', 'illuminate/redis']), 'Redis']
  ]);

  return {
    framework,
    frontend,
    backend,
    database,
    authentication,
    stateManagement,
    uiLibrary,
    deployment,
    testing,
    realtime,
    cache
  };
}
