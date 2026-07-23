import type { ProjectType } from './types.js';
import {
  collectNpmDeps,
  hasNpmDep,
  parseComposerJson,
  parsePackageJson,
  textIncludesAny,
  type ParsedPackageJson
} from './manifests.js';
import { getFileName } from './ignore.js';

export interface ProjectTypeSignals {
  packageJson?: ParsedPackageJson | null;
  requirementsText?: string;
  pyprojectText?: string;
  pomXml?: string;
  buildGradle?: string;
  composerJson?: string;
  csprojText?: string;
  files: string[];
}

function pathHints(files: string[]) {
  const lower = files.map((f) => f.toLowerCase());
  const names = new Set(lower.map((f) => getFileName(f)));
  const joined = lower.join('\n');

  return {
    has: (name: string) => names.has(name.toLowerCase()),
    includes: (fragment: string) => joined.includes(fragment.toLowerCase()),
    hasExt: (ext: string) => lower.some((f) => f.endsWith(ext.toLowerCase())),
    hasDir: (dir: string) =>
      lower.some((f) => f.split('/').includes(dir.toLowerCase()))
  };
}

/**
 * Classify the primary project type using manifests first, then path heuristics.
 * MERN is preferred when Mongo + Express + React (+ Node) are all present.
 */
export function detectProjectType(signals: ProjectTypeSignals): ProjectType {
  const deps = collectNpmDeps(signals.packageJson ?? null);
  const scripts = signals.packageJson?.scripts ?? {};
  const scriptBlob = Object.values(scripts).join(' ').toLowerCase();
  const paths = pathHints(signals.files);

  const hasReact =
    hasNpmDep(deps, 'react', 'react-dom') || paths.includes('jsx') || paths.includes('.tsx');
  const hasNext =
    hasNpmDep(deps, 'next') ||
    scriptBlob.includes('next ') ||
    paths.has('next.config.js') ||
    paths.has('next.config.mjs') ||
    paths.has('next.config.ts') ||
    paths.hasDir('app') && paths.has('next.config.js');
  const hasVue =
    hasNpmDep(deps, 'vue', 'nuxt', '@vue/cli-service') ||
    paths.has('vue.config.js') ||
    paths.has('nuxt.config.ts') ||
    paths.has('nuxt.config.js') ||
    paths.includes('.vue');
  const hasAngular =
    hasNpmDep(deps, '@angular/core', '@angular/cli') ||
    paths.has('angular.json');
  const hasNest =
    hasNpmDep(deps, '@nestjs/core', '@nestjs/common') ||
    paths.includes('main.ts') && paths.includes('.module.ts');
  const hasExpress =
    hasNpmDep(deps, 'express') ||
    (paths.has('server.js') || paths.has('app.js')) && !hasNext && !hasNest;
  const hasMongo =
    hasNpmDep(deps, 'mongoose', 'mongodb', 'mongo') ||
    paths.includes('mongoose') ||
    textIncludesAny(signals.requirementsText, ['pymongo', 'mongoengine']);

  // Python
  const django =
    textIncludesAny(signals.requirementsText, ['django']) ||
    textIncludesAny(signals.pyprojectText, ['django']) ||
    paths.has('manage.py') ||
    paths.includes('django');
  const flask =
    textIncludesAny(signals.requirementsText, ['flask']) ||
    textIncludesAny(signals.pyprojectText, ['flask']) ||
    paths.includes('flask');

  // Java / Spring
  const spring =
    textIncludesAny(signals.pomXml, ['spring-boot', 'springframework']) ||
    textIncludesAny(signals.buildGradle, ['spring-boot', 'springframework']) ||
    paths.includes('application.properties') ||
    paths.includes('application.yml');

  // PHP / Laravel
  const composer = parseComposerJson(signals.composerJson);
  const laravel =
    Boolean(composer?.require?.['laravel/framework']) ||
    textIncludesAny(signals.composerJson, ['laravel/framework']) ||
    paths.has('artisan') ||
    paths.includes('laravel');

  // ASP.NET
  const aspnet =
    textIncludesAny(signals.csprojText, [
      'Microsoft.AspNetCore',
      'Microsoft.NET.Sdk.Web',
      'AspNetCore'
    ]) ||
    paths.hasExt('.csproj') && (paths.includes('startup.cs') || paths.includes('program.cs'));

  // Priority: specific frameworks before generic React/Express
  if (hasNext) return 'Next.js';
  if (hasNest) return 'NestJS';
  if (hasAngular) return 'Angular';
  if (hasVue) return 'Vue';

  // MERN: Mongo + Express + React (Node implied by package.json / Express)
  if (hasReact && hasExpress && hasMongo) return 'MERN';

  if (hasReact) return 'React';
  if (hasExpress) return 'Express';
  if (django) return 'Django';
  if (flask) return 'Flask';
  if (spring) return 'Spring Boot';
  if (laravel) return 'Laravel';
  if (aspnet) return 'ASP.NET';

  // Soft path-only fallbacks
  if (paths.has('manage.py')) return 'Django';
  if (paths.has('artisan')) return 'Laravel';
  if (paths.has('angular.json')) return 'Angular';

  return 'Unknown';
}
