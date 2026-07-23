import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  repoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Repo',
    required: true,
  },
  question: {
    type: String,
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
  filesUsed: [
    {
      type: String,
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Question = mongoose.model('Question', questionSchema);
export default Question;
