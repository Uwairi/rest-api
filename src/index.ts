import express, { Request, Response } from 'express';
import mongoose, {  Schema, Document } from 'mongoose';
import { Server as SocketIOServer } from 'socket.io';
import { Server } from 'http';
import cors from 'cors';

mongoose.connect('mongodb+srv://rezaakbar:gSyG7BAjtrJXEsBo@coba.q4whz5h.mongodb.net/?retryWrites=true&w=majority&appName=coba')
  .then(() => {
    console.log('Berhasil terhubung ke MongoDB');
  })
  .catch((error: any) => {
    console.log('Koneksi ke MongoDB gagal:', error.message);
  });

const asyncLock = require('async-lock');
const lock = new asyncLock();

interface ScanData {
  isDefect: boolean;
  amount: number;
  amount50: number;
  totalBad: number;
  total: number;
  createdAt?: Date;
}

interface MachineState extends Document {
  isOn: boolean;
}

interface ManualState extends Document {
  isAvailable: boolean;
}

const machineStateSchema: Schema = new mongoose.Schema({
  isOn: Boolean,
});

const manualStateSchema: Schema = new mongoose.Schema({
  isAvailable: Boolean,
});

const scanDataSchema: Schema = new mongoose.Schema({
  isDefect: Boolean,
  amount: Number,
  amount50: Number,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const countDataSchema = new mongoose.Schema({
  amount50: Number,
  badCount: Number,
  goodCount: Number,
});

const CountData = mongoose.model('CountData', countDataSchema);
const MachineState = mongoose.model<MachineState>('MachineState', machineStateSchema);
const ManualState = mongoose.model<ManualState>('ManualState', manualStateSchema);
const ScanData = mongoose.model<ScanData & Document>('ScanData', scanDataSchema);

const app = express();
const httpServer = new Server(app);
const io = new SocketIOServer(httpServer);

// Function to send scan data to all connected clients
const sendScanDataToClients = async () => {
  try {
    // Get your scan data from the database
    const countData = await CountData.findOne({});
    const data = {
      goodCount: countData?.goodCount || 0,
      badCount: countData?.badCount || 0,
      amount50: countData?.amount50 || 0,
      totalBad: (countData?.badCount || 0) + (countData?.amount50 || 0),
      total: (countData?.goodCount || 0) + (countData?.badCount || 0) + (countData?.amount50 || 0),
    };

    // Send scan data to all connected clients
    io.emit('scanDataUpdate', data);
  } catch (error: any) {
    console.log('Error sending scan data to clients:', error.message);
  }
};

let previousMachineState: MachineState | null = null; // Declare the type of previousMachineState - we declare this to avoid the same machine state being sent to clients multiple times

// Function to send machine state to all connected clients
const sendMachineStateToClients = async () => {
  try {
    // Get the latest machine state from the database
    const machineState = await MachineState.findOne().sort({ _id: -1 });

    // Only emit the machine state if it's different from the previous state
    if (!previousMachineState || machineState?.isOn !== previousMachineState?.isOn) {
      io.emit('machineStateUpdate', machineState);
      previousMachineState = machineState;
    }
  } catch (error: any) {
    console.log('Error sending machine state to clients:', error.message);
  }
};

let previousManualState: ManualState | null = null; 

const sendManualStateToClients = async () => {
  try {
    const manualState = await ManualState.findOne().sort({ _id: -1 });

    if (!previousManualState || manualState?.isAvailable !== previousManualState?.isAvailable) {
      io.emit('manualStateUpdate', manualState);
      previousManualState = manualState;
    }
  } catch (error: any) {
    console.log('Error sending manual state to clients:', error.message);
  }
};

// Function to listen for changes in the machine-state collection and send updates to clients
const listenForMachineStateChanges = () => {
  MachineState.watch().on('change', async (change) => {
    if (change.operationType === 'insert' || change.operationType === 'update') {
      // When the machine state changes, send the updated machine state to clients
      console.log('machine state changed');
      sendMachineStateToClients();
    }
  });
};

const listenForManualStateChanges = () => {
  ManualState.watch().on('change', async (change) => {
    if (change.operationType === 'insert' || change.operationType === 'update') {
      // When the machine state changes, send the updated machine state to clients
      console.log('manual state changed');
      sendManualStateToClients();
    }
  });
};

// Listen for WebSocket connections
io.on('connection', (socket) => {
  console.log('Client connected');

  // Send initial scan data and machine state when a new client connects
  sendScanDataToClients();
  sendMachineStateToClients();
  sendManualStateToClients();
  
  // Handle 'toggleMachineState' event
  socket.on('toggleMachineState', async () => {
    try {
      await lock.acquire('machineStateLock', async () => {
        const machineState = await MachineState.findOne().sort({ _id: -1 });
        if (machineState) {
          machineState.isOn = !machineState.isOn;
          await machineState.save();
  
          sendMachineStateToClients();
        }
      });
    } catch (error: any) {
      console.log('Error toggling machine state:', error.message);
    }
  });

  socket.on('toggleManualState', async () => {
    try {
      await lock.acquire('manualStateLock', async () => {
        const manualState = await ManualState.findOne().sort({ _id: -1 });
        if (manualState) {
          manualState.isAvailable = !manualState.isAvailable;
          await manualState.save();
  
          sendManualStateToClients();
        }
      });
    } catch (error: any) {
      console.log('Error toggling machine state:', error.message);
    }
  });

  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

listenForMachineStateChanges();
listenForManualStateChanges();

app.use(express.json());
app.use(cors());

app.get('/', async (req: Request, res: Response) => {
  res.json('Server is Up!');
});

app.get('/machine-state', async (_req: Request, res: Response) => {
  const machineState = await MachineState.findOne().sort({ _id: -1 });
  res.json(machineState);
});

app.get('/manual-state', async (_req: Request, res: Response) => {
  const manualState = await ManualState.findOne().sort({ _id: -1 });
  res.json(manualState);
});

app.post('/machine-state', async (_req: Request, res: Response) => {
  const machineState = await MachineState.findOne().sort({ _id: -1 });
  if (!machineState) {
    const newMachineState = new MachineState({ isOn: true });
    await newMachineState.save();
    res.status(201).json({ success: true, data: newMachineState });
  } else {
    machineState.isOn = !machineState.isOn;
    await machineState.save();
    res.status(200).json({ success: true, data: machineState });
  }
});

app.post('/manual-state', async (req: Request, res: Response) => {
  try {
    const { isAvailable } = req.body;
    const manualState = await ManualState.findOne().sort({ _id: -1 });
    if (!manualState) {
      // Create a new manual state if it doesn't exist
      const newManualState = new ManualState({ isAvailable });
      await newManualState.save();
      res.status(201).json({ success: true, data: newManualState });
    } else {
      // Update the existing manual state
      manualState.isAvailable = isAvailable;
      await manualState.save();
      res.status(200).json({ success: true, data: manualState });
    }
  } catch (error: any) {
    console.log('Error updating manual state:', error.message);
    res.status(500).json({ error: 'Failed to update manual state' });
  }
});

// Modify the endpoint to return the counts from the CountData collection
app.get('/scan-data', async (req: Request, res: Response) => {
  try {
    const countData = await CountData.findOne({});
    const data = {
      goodCount: countData?.goodCount || 0,
      badCount: countData?.badCount || 0,
      amount50: countData?.amount50 || 0,
      totalBad: (countData?.badCount || 0) + (countData?.amount50 || 0),
      total: (countData?.goodCount || 0) + (countData?.badCount || 0) + (countData?.amount50 || 0),
    };
    res.json(data);
  } catch (error: any) {
    console.log('Error getting scan data:', error.message);
    res.status(500).json({ error: 'Failed to get scan data' });
  }
});

app.post('/scan-data', async (req: Request, res: Response) => {
  try {
    const { isDefect, amount, amount50 } = req.body;

    if (typeof amount !== 'number' || isNaN(amount) || typeof amount50 !== 'number' || isNaN(amount50)) {
      return res.status(400).json({ error: 'Invalid input data. Amount and amount50 must be valid numbers.' });
    }

    // Increment counts in CountData based on the received data
    await lock.acquire('countDataLock', async () => {
      const countData = await CountData.findOne({});
      if (!countData) {
        const newCountData = new CountData({
          goodCount: isDefect ? 0 : amount,
          badCount: isDefect ? amount : 0,
          amount50: isDefect ? amount50 : 0,
        });
        await newCountData.save();
      } else {
        if (isDefect) {
          countData.badCount = (countData.badCount || 0) + amount;
          countData.amount50 = (countData.amount50 || 0) + amount50;
        } else {
          countData.goodCount = (countData.goodCount || 0) + amount;
        }
        await countData.save();
      }
    });

    // Send the updated counts to clients
    sendScanDataToClients();

    res.json({ message: 'Scan data updated successfully' });
  } catch (error: any) {
    console.log('Error updating scan data:', error.message);
    res.status(500).json({ error: 'Failed to update scan data' });
  }
});


const PORT = parseInt(process.env.PORT || '8888', 10);
httpServer.listen(PORT, '0.0.0.0', () =>
  console.log(`⚡️[server]: Server is running at 0.0.0.0:${PORT}`)
);
