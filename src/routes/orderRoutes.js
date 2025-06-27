// src/routes/orderRoutes.js (VERSÃO CORRIGIDA)
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Aplica o middleware de autenticação para todas as rotas de pedido
router.use(authMiddleware);

// ==========================================================
// LINHA ADICIONADA: Rota para um usuário CRIAR um novo pedido
// POST /api/orders
router.post('/', orderController.createOrder); // <<<<<<<<<<< ADICIONE ESTA LINHA
// ==========================================================

// Rota para um usuário buscar seus próprios pedidos
// GET /api/orders/myorders
router.get('/myorders', orderController.getUserOrders);

// Rota para o admin buscar TODOS os pedidos.
// GET /api/orders/
// Primeiro, o 'adminMiddleware' é executado para verificar se o usuário é admin.
router.get('/', adminMiddleware, orderController.getAllOrders);

module.exports = router;