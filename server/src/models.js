import mongoose from 'mongoose';

const cashflowSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    amount: { type: Number, required: true }
  },
  { _id: false }
);

const bondSchema = new mongoose.Schema(
  {
    isin: { type: String, unique: true, required: true, index: true },
    face: { type: Number, default: 100 },
    receipts: { type: [Number], default: [] },
    cashflows: { type: [cashflowSchema], default: [] }
  },
  { timestamps: true }
);

export const Bond = mongoose.model('Bond', bondSchema);