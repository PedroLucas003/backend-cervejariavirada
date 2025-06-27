require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
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

// Configuração avançada do CORS
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://frontend-cervejariavirada1.vercel.app',
      /https:\/\/frontend-cervejariavirada1-.*\.vercel\.app/,
      'http://localhost:3000'
    ];
    
    // Permitir requests sem origin (mobile apps, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') {
        return origin === pattern;
      } else if (pattern instanceof RegExp) {
        return pattern.test(origin);
      }
      return false;
    })) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Powered-By']
};

app.use(cors(corsOptions));

// Middleware para headers de segurança
app.use((req, res, next) => {
  // Headers para CORS
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Headers de segurança
  res.header('X-Powered-By', 'Cervejaria Virada API');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  next();
});

// Middleware para parsear JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rota para o manifest.json
app.get('/manifest.json', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

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
    
    if (req.body.action === 'payment.updated') {
      const paymentId = req.body.data.id;
      const paymentStatus = req.body.data.status;
      
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
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'API da Cervejaria Virada está funcionando!',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    documentation: `${process.env.BACKEND_URL}/api-docs`
  });
});

// Middleware para rotas não encontradas
app.use((req, res, next) => {
  res.status(404).json({ 
    success: false, 
    message: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

// Middleware para tratamento de erros
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Tratamento específico para erros de CORS
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      success: false,
      message: 'Acesso não permitido pela política CORS',
      origin: req.headers.origin
    });
  }
  
  res.status(500).json({ 
    success: false, 
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`Backend URL: ${process.env.BACKEND_URL}`);
  console.log(`Banco de Dados: ${process.env.DB_FULL_URI ? 'Conectado' : 'Não configurado'}`);
});

// Encerramento adequado do servidor
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (err) => {
  console.error('Erro não tratado:', err);
  server.close(() => process.exit(1));
});