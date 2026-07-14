const { config } = require('dotenv');
config(); // Load environment variables from .env file

//Required packages
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

//Other required packages and configurations can be added here
const boughtLeafRoutes = require('./routes/boughtLeaf.routes');

const app = express();

app.use(helmet());
app.use(express.json());
app.use(cors(
    
));

app.get('/', (req, res) => {
  res.send('Bought Leaf microservice is running');
});

app.use('/bought-leaf', boughtLeafRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Bought Leaf microservice is running on port ${process.env.PORT}`);
});