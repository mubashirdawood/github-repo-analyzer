/**
 * Verifies DELETE cascade for a repo (Questions, FileCache, RepositoryAnalysis, Repo).
 * Run: npx tsx scripts/verify-delete-repo.js  OR  node scripts/verify-delete-repo.js
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import Repo from '../models/Repo.js';
import Question from '../models/Question.js';
import FileCache from '../models/FileCache.js';
import RepositoryAnalysis from '../models/RepositoryAnalysis.js';
import User from '../models/User.js';

dotenv.config();

const API = `http://127.0.0.1:${process.env.PORT || 5000}`;

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI missing');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET missing');

  await mongoose.connect(uri);

  let user = await User.findOne({ email: 'delete-test@gitlens.local' });
  if (!user) {
    user = await User.create({
      email: 'delete-test@gitlens.local',
      passwordHash: 'not-used-for-this-test'
    });
  }

  const repo = await Repo.create({
    userId: user._id,
    githubUrl: 'https://github.com/example/delete-me',
    owner: 'example',
    repoName: 'delete-me',
    fileTree: [{ path: 'README.md', type: 'file', sizeBytes: 10 }],
    status: 'analyzed',
    commitSha: 'abc123deleteverify',
    architectureSummary: 'test summary',
    diagramSyntax: 'flowchart TD\n  A-->B',
    requestFlowDiagram: 'sequenceDiagram\n  A->>B: hi'
  });

  await Question.create({
    repoId: repo._id,
    question: 'What is this?',
    answer: 'A test.',
    filesUsed: ['README.md']
  });

  await FileCache.create({
    repoId: repo._id,
    path: 'README.md',
    content: '# hello',
    tokenCount: 2
  });

  await RepositoryAnalysis.create({
    repoId: repo._id,
    owner: 'example',
    repoName: 'delete-me',
    commitSha: 'abc123deleteverify',
    architectureSummary: 'test summary',
    architectureDiagram: 'flowchart TD\n  A-->B',
    requestFlowDiagram: 'sequenceDiagram\n  A->>B: hi',
    repositoryGraph: { nodes: [], edges: [] },
    analyzedAt: new Date()
  });

  const RequestFlowAnalysis = (await import('../models/RequestFlowAnalysis.js')).default;
  await RequestFlowAnalysis.create({
    repositoryId: repo._id,
    branch: 'main',
    commitSha: 'abc123deleteverify',
    mermaid:
      'flowchart TD\n  User("User")\n  Frontend["Frontend"]\n  Backend["Backend"]\n  User --> Frontend\n  Frontend --> Backend',
    stats: {
      framework: 'Unknown',
      frontendComponents: 0,
      pages: 0,
      apiRoutes: 0,
      controllers: 0,
      services: 0,
      models: 0,
      middleware: 0,
      databaseCollections: 0,
      externalApis: 0,
      authentication: 'None',
      totalSourceFiles: 1,
      languages: [],
      complexity: 'low',
      complexityScore: 10,
      architectureLayers: 2,
      layers: ['Frontend', 'Backend'],
      technologies: [],
      entryPoints: [],
      summary: 'test'
    },
    summary: 'test',
    layers: ['Frontend', 'Backend'],
    technologies: [],
    entryPoints: [],
    complexity: 'low',
    complexityScore: 10,
    generatedFlows: []
  });

  const token = jwt.sign({ userId: String(user._id) }, process.env.JWT_SECRET, {
    expiresIn: '1h'
  });

  const res = await fetch(`${API}/api/repos/${repo._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  const body = await res.json().catch(() => ({}));
  console.log('HTTP', res.status, body);

  if (!res.ok) {
    // Cleanup leftovers if API failed
    await Promise.all([
      Question.deleteMany({ repoId: repo._id }),
      FileCache.deleteMany({ repoId: repo._id }),
      RepositoryAnalysis.deleteMany({ repoId: repo._id }),
      (await import('../models/RequestFlowAnalysis.js')).default.deleteMany({
        repositoryId: repo._id
      }),
      Repo.deleteOne({ _id: repo._id })
    ]);
    throw new Error(`Delete API failed: ${res.status} ${JSON.stringify(body)}`);
  }

  const RequestFlowAnalysis = (await import('../models/RequestFlowAnalysis.js')).default;
  const [repoLeft, qLeft, fLeft, aLeft, rfLeft] = await Promise.all([
    Repo.countDocuments({ _id: repo._id }),
    Question.countDocuments({ repoId: repo._id }),
    FileCache.countDocuments({ repoId: repo._id }),
    RepositoryAnalysis.countDocuments({
      $or: [{ repoId: repo._id }, { owner: 'example', repoName: 'delete-me', commitSha: 'abc123deleteverify' }]
    }),
    RequestFlowAnalysis.countDocuments({ repositoryId: repo._id })
  ]);

  console.log('Remaining counts:', { repoLeft, qLeft, fLeft, aLeft, rfLeft });

  if (repoLeft || qLeft || fLeft || aLeft || rfLeft) {
    throw new Error('Cascade delete incomplete — leftover documents found');
  }

  console.log('OK: delete cascade verified');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('FAIL:', err.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
