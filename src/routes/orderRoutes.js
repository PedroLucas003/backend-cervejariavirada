// src/routes/orderRoutes.js 
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Aplica o middleware de autenticação para todas as rotas de pedido
router.use(authMiddleware);

router.post('/', orderController.createOrder); 
router.get('/myorders', orderController.getUserOrders);

// Rotas exclusivas para admin
router.get('/', adminMiddleware, orderController.getAllOrders);
router.patch('/:id/status', adminMiddleware, orderController.updateOrderStatus); // Rota para atualizar status
router.post('/:id/cancel', adminMiddleware, orderController.cancelOrder); // NOVA ROTA: Cancelar e Reembolsar

module.exports = router;