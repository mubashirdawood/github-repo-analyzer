import express from 'express';
import {
  listUserRepos,
  getRepoById,
  analyzeRepo,
  deleteRepo,
  askRepoQuestion,
  getArchitectureSummary,
  getRequestFlows,
  invalidateRequestFlows
} from '../controllers/repoController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.get('/', asyncHandler(listUserRepos));
router.post('/analyze', asyncHandler(analyzeRepo));
router.get('/:id', asyncHandler(getRepoById));
router.delete('/:id', asyncHandler(deleteRepo));
router.post('/:id/ask', asyncHandler(askRepoQuestion));
router.post('/:id/architecture', asyncHandler(getArchitectureSummary));
router.post('/:id/request-flows', asyncHandler(getRequestFlows));
router.delete('/:id/request-flows', asyncHandler(invalidateRequestFlows));

export default router;
