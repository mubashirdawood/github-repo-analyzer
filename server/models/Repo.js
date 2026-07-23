import mongoose from 'mongoose';

const repoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  githubUrl: {
    type: String,
    required: true,
  },
  owner: {
    type: String,
  },
  repoName: {
    type: String,
  },
  fileTree: [
    {
      path: { type: String },
      type: { type: String }, // Structuring to avoid mongoose "type" keyword collision
      sizeBytes: { type: Number },
    }
  ],
  status: {
    type: String,
    enum: ['pending', 'analyzed', 'failed'],
    default: 'pending',
  },
  architectureSummary: {
    type: String,
    default: null,
  },
  diagramSyntax: {
    type: String,
    default: null,
  },
  requestFlowDiagram: {
    type: String,
    default: null,
  },
  /** GitHub HEAD commit SHA when the repo was last fetched / analyzed */
  commitSha: {
    type: String,
    default: null,
    index: true,
  },
  truncated: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Repo = mongoose.model('Repo', repoSchema);
export default Repo;
