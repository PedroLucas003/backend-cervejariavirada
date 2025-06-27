// server.js (VERSÃO FINAL E COMPLETA)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const authMiddleware = require('./src/middlewares/authMiddleware');
const Order = require('./src/models/Order');
const mongoose = require('mongoose');

// --- Configuração do Cliente Mercado Pago ---
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN 
});

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Conectar ao MongoDB
connectDB();

// =======================================================
// --- NOVAS ROTAS DE PAGAMENTO (MERCADO PAGO) ---
// =======================================================

// ROTA PARA CRIAR A PREFERÊNCIA DE PAGAMENTO
app.post('/api/payments/create-preference', authMiddleware, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    const { user, userId } = req;

    // 1. Cria o pedido no seu banco de dados com status 'pending'
    const newOrder = new Order({
      user: userId,
      userEmail: user.email,
      items: items.map(item => ({
        productId: new mongoose.Types.ObjectId(item._id),
        name: item.nome,
        type: item.tipo,
        quantity: item.quantity,
        price: item.price,
        image: item.imagem,
      })),
      shippingAddress: {
        logradouro: shippingAddress.address,
        numero: shippingAddress.number,
        complemento: shippingAddress.complement,
        bairro: shippingAddress.neighborhood,
        cidade: shippingAddress.city,
        estado: shippingAddress.state,
        cep: shippingAddress.cep.replace(/\D/g, ''),
      },
      // Adiciona o paymentInfo obrigatório com um ID provisório
      paymentInfo: {
        paymentId: new mongoose.Types.ObjectId().toString(),
        paymentStatus: 'pending'
      },
      status: 'pending'
    });
    
    const savedOrder = await newOrder.save();

    // 2. Cria a preferência de pagamento no Mercado Pago
    const preference = new Preference(client);
    const preferenceResponse = await preference.create({
      body: {
        items: savedOrder.items.map(item => ({
          id: item.productId.toString(),
          title: item.name,
          quantity: item.quantity,
          unit_price: item.price,
          currency_id: 'BRL',
        })),
        payer: {
          name: user.nomeCompleto,
          email: user.email,
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/payment-success`,
          failure: `${process.env.FRONTEND_URL}/payment-failure`,
          pending: `${process.env.FRONTEND_URL}/payment-pending`,
        },
        auto_return: 'approved',
        external_reference: savedOrder._id.toString(),
        notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
      }
    });

    res.json({
      preferenceId: preferenceResponse.id,
      init_point: preferenceResponse.init_point,
    });

  } catch (error) {
    console.error('Erro ao criar preferência de pagamento:', error);
    res.status(500).json({ message: 'Erro ao criar preferência de pagamento.' });
  }
});

// ROTA DE WEBHOOK PARA RECEBER NOTIFICAÇÕES DO MERCADO PAGO
app.post('/api/payments/webhook', (req, res) => {
  console.log('Webhook do Mercado Pago recebido:', req.body);
  // Lógica futura para atualizar o status do pedido
  res.status(200).send('ok');
});


// =======================================================
// --- ROTAS EXISTENTES DA APLICAÇÃO ---
// =======================================================
const authRoutes = require('./src/routes/authRoutes');
const beerRoutes = require('./src/routes/beerRoutes');
const userRoutes = require('./src/routes/userRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const pixRoutes = require('./src/routes/pixRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/beers', beerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/pix', pixRoutes);

// Rotas básicas e manipuladores de erro
app.get('/', (req, res) => {
  res.send('API da Cervejaria Virada está funcionando!');
});
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Rota não encontrada' });
});
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Erro interno do servidor' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});