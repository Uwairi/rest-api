const express = require("express");
const createError = require("http-errors");
const cors = require("cors");
const mongoose = require("mongoose");
mongoose.connect("mongodb+srv://rezaakbar:gSyG7BAjtrJXEsBo@coba.q4whz5h.mongodb.net/?retryWrites=true&w=majority&appName=coba", {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("Berhasil terhubung ke MongoDB");
}).catch(error => {
  console.log("Koneksi ke MongoDB gagal:", error.message);
});
const machineStateSchema = new mongoose.Schema({
  isOn: Boolean
});
const scanDataSchema = new mongoose.Schema({
  isDefect: Boolean,
  amount: Number,
  amount50: Number,
  totalBad: Number,
  total: Number,
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const MachineState = mongoose.model("MachineState", machineStateSchema);
const ScanData = mongoose.model("ScanData", scanDataSchema);
const app = express();
app.use(express.json());
app.use(cors());
app.get("/machine-state", async (req, res) => {
  const posts = await MachineState.findOne().sort({
    _id: -1
  });
  res.json(posts);
});
app.post("/machine-state", async (req, res) => {
  const {
    isOn
  } = req.body;
  const post = new MachineState({
    isOn
  });
  try {
    await post.save();
    res.status(201).json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
const getDate = (givenDate = new Date()) => {
  const offset = givenDate.getTimezoneOffset();
  givenDate = new Date(givenDate.getTime() - offset * 60 * 1000);
  return givenDate.toISOString().split("T")[0];
};

// Define a new collection to store the counts
const CountData = mongoose.model('CountData', new mongoose.Schema({
  goodCount: Number,
  badCount: Number,
  amount50: Number
}));

// Whenever a new ScanData document is created or updated, update the counts in the CountData collection
ScanData.watch().on('change', async change => {
  if (change.operationType === 'insert' || change.operationType === 'update') {
    const goodScans = await ScanData.find({
      isDefect: false,
      createdAt: {
        $gte: new Date(getDate())
      }
    });
    const badScans = await ScanData.find({
      isDefect: true,
      createdAt: {
        $gte: new Date(getDate())
      }
    });
    const goodCount = goodScans.reduce((acc, v) => acc + v.amount, 0);
    const badCount = badScans.reduce((acc, v) => acc + v.amount, 0);
    const amount50 = badScans.reduce((acc, v) => acc + v.amount50, 0);
    await CountData.updateOne({}, {
      goodCount,
      badCount,
      amount50
    }, {
      upsert: true
    });
  }
});

// Modify the endpoint to return the counts from the CountData collection
app.get("/scan-data", async (req, res) => {
  const countData = await CountData.findOne({});
  res.json({
    goodCount: countData?.goodCount || 0,
    badCount: countData?.badCount || 0,
    amount50: countData?.amount50 || 0,
    totalBad: (countData?.badCount || 0) + (countData?.amount50 || 0),
    total: (countData?.goodCount || 0) + (countData?.badCount || 0) + (countData?.amount50 || 0)
  });
});
app.post("/scan-data", async (req, res) => {
  const {
    isDefect,
    amount,
    amount50,
    totalBad,
    total
  } = req.body;
  const scanData = new ScanData({
    isDefect,
    amount,
    amount50,
    totalBad,
    total
  });
  await scanData.save();
  7;
  res.json(scanData);
});
app.use((req, res, next) => {
  next(createError(404));
});
app.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log(`⚡️[server]: Server is running at :${process.env.PORT || 3000}`));