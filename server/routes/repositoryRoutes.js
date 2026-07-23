import express from 'express';
import {
  getCachedRequestFlows,
  createRequestFlows,
  deleteRequestFlowsCache
} from '../controllers/requestFlowController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * /api/repositories/:id/request-flows
 * All routes require authentication (applied at mount).
 */
const router = express.Router({ mergeParams: true });

router.get('/:id/request-flows', asyncHandler(getCachedRequestFlows));
router.post('/:id/request-flows', asyncHandler(createRequestFlows));
router.delete('/:id/request-flows', asyncHandler(deleteRequestFlowsCache));

export default router;
