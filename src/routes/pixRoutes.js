const express = require('express');
const router = express.Router();
const pixController = require('../controllers/pixController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/generate', authMiddleware, pixController.generatePixPayment);
router.get('/status/:orderId', authMiddleware, pixController.checkPaymentStatus);
router.post('/confirm', authMiddleware, pixController.confirmPayment);

module.exports = router;