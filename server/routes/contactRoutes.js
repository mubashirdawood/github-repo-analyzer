import express from 'express';
import { submitContact } from '../controllers/contactController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

router.post('/', asyncHandler(submitContact));

export default router;
