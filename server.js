require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const authMiddleware = require('./src/middlewares/authMiddleware');
const Order = require('./src/models/Order');
const mongoose = require('mongoose');

// Configuração do Cliente Mercado Pago
const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN 
});

const app = express();

// Configuração do CORS para produção e desenvolvimento

const allowedOrigins = [
  'https://frontend-cervejariavirada1.vercel.app',
  'https://frontend-cervejariavirada1-p7zdbq8if-pedrolucas003s-projects.vercel.app',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origin (como mobile apps ou curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Middleware para parsear JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Conectar ao MongoDB
connectDB();

// =======================================================
// ROTAS DE PAGAMENTO (MERCADO PAGO)
// =======================================================

// Rota para criar a preferência de pagamento
app.post('/api/payments/create-preference', authMiddleware, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    const { user, userId } = req;

    // Cria o pedido no banco de dados com status 'pending'
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
      paymentInfo: {
        paymentId: new mongoose.Types.ObjectId().toString(),
        paymentStatus: 'pending'
      },
      status: 'pending'
    });
    
    const savedOrder = await newOrder.save();

    // Cria a preferência de pagamento no Mercado Pago
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

// Rota de webhook para receber notificações do Mercado Pago
app.post('/api/payments/webhook', async (req, res) => {
  try {
    console.log('Webhook do Mercado Pago recebido:', req.body);
    
    // Aqui você deve implementar a lógica para verificar e atualizar o status do pagamento
    // Exemplo básico:
    if (req.body.action === 'payment.updated') {
      const paymentId = req.body.data.id;
      const paymentStatus = req.body.data.status;
      
      // Atualize o pedido no seu banco de dados
      await Order.findOneAndUpdate(
        { 'paymentInfo.paymentId': paymentId },
        { 
          'paymentInfo.paymentStatus': paymentStatus,
          status: paymentStatus === 'approved' ? 'processing' : paymentStatus
        }
      );
    }
    
    res.status(200).send('ok');
  } catch (error) {
    console.error('Erro no webhook:', error);
    res.status(500).send('Erro ao processar webhook');
  }
});

// =======================================================
// ROTAS DA APLICAÇÃO
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

// Rota de health check para o Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Rota raiz
app.get('/', (req, res) => {
  res.send('API da Cervejaria Virada está funcionando!');
});

// Middleware para rotas não encontradas
app.use((req, res, next) => {
  res.status(404).json({ success: false, message: 'Rota não encontrada' });
});

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Erro interno do servidor' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`Backend URL: ${process.env.BACKEND_URL}`);
});

// Encerramento adequado do servidor
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});