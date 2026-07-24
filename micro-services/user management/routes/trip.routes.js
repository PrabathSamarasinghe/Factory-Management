const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const travelController = require('../controllers/trip.controllers');

router.get('/lorry', authenticateToken, travelController.getAllLorries);
router.post('/lorry', authenticateToken, travelController.createLorry);
router.patch('/lorry', authenticateToken, travelController.updateLorry);
router.delete('/lorry/:lorry_id', authenticateToken, travelController.deleteLorry);

router.post('/route', authenticateToken, travelController.addRoute);
router.get('/route', authenticateToken, travelController.getAllRoutes);

router.get('/trip', authenticateToken, travelController.getAllTrips);
router.post('/trip', authenticateToken, travelController.createTrip);
router.patch('/trip', authenticateToken, travelController.updateEndMileage);

module.exports = router;