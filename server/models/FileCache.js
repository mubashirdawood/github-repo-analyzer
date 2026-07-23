import mongoose from 'mongoose';

const fileCacheSchema = new mongoose.Schema({
  repoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repo',
    required: true,
  },
  path: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  tokenCount: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Compound index on repoId and path for fast cache lookups
fileCacheSchema.index({ repoId: 1, path: 1 });

const FileCache = mongoose.model('FileCache', fileCacheSchema);
export default FileCache;
