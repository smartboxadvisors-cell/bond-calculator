import mongoose from 'mongoose';

const cashflowSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    amount: { type: Number, required: true }
  },
  { _id: false }
);

const scheduleConfigSchema = new mongoose.Schema(
  {
    form: { type: mongoose.Schema.Types.Mixed, default: null },
    schedule: { type: mongoose.Schema.Types.Mixed, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const bondSchema = new mongoose.Schema(
  {
    isin: { type: String, unique: true, required: true, index: true },
    face: { type: Number, default: 100 },
    receipts: { type: [Number], default: [] },
    cashflows: { type: [cashflowSchema], default: [] },
    scheduleConfig: { type: scheduleConfigSchema, default: null }
  },
  { timestamps: true }
);

export const Bond = mongoose.model('Bond', bondSchema);
