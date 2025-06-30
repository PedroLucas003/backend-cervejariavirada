// src/routes/orderRoutes.js (VERSÃO CORRIGIDA)
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Aplica o middleware de autenticação para todas as rotas de pedido
router.use(authMiddleware);

router.post('/', orderController.createOrder); 

router.get('/myorders', orderController.getUserOrders);

router.get('/', adminMiddleware, orderController.getAllOrders);

module.exports = router;