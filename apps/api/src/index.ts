import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const app = express();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());

import { authRouter } from './routes/auth';
import { merchantRouter } from './routes/merchant';
import { nigeriaWebhookRouter } from './routes/webhooks/nigeria';

app.use('/auth', authRouter);
app.use('/merchant', merchantRouter);
app.use('/webhooks/nigeria', nigeriaWebhookRouter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`SokoPay API listening on port ${port}`);
});
