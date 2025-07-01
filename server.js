require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./src/config/db');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const authMiddleware = require('./src/middlewares/authMiddleware');
const Order = require('./src/models/Order');
const Beer = require('./src/models/Beer'); // IMPORTANTE: Importar o modelo Beer
const mongoose = require('mongoose');

const client = new MercadoPagoConfig({ 
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN 
});

const app = express();

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://frontend-cervejariavirada1.vercel.app',
      /https:\/\/frontend-cervejariavirada1-.*\.vercel\.app/,
      'http://localhost:3000'
    ];
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Cache-Control'],
  exposedHeaders: ['Content-Length', 'X-Powered-By']
};

app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('X-Powered-By', 'Cervejaria Virada API');
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/manifest.json', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

connectDB();

app.post('/api/payments/create-preference', authMiddleware, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    const { user, userId } = req;

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
        paymentStatus: 'pending'
      },
      status: 'pending'
    });
    
    const savedOrder = await newOrder.save();

    const notificationUrl = `${process.env.BACKEND_URL}/api/payments/webhook`; 
    console.log('DEBUG: notification_url sendo enviada ao Mercado Pago:', notificationUrl); 

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
          success: `${process.env.FRONTEND_URL}/my-orders`, // Redireciona para Meus Pedidos
          failure: `${process.env.FRONTEND_URL}/payment-failure`,
          pending: `${process.env.FRONTEND_URL}/payment-pending`,
        },
        auto_return: 'approved',
        external_reference: savedOrder._id.toString(), 
        notification_url: notificationUrl,
      }
    });

    savedOrder.paymentInfo.preferenceId = preferenceResponse.id;
    await savedOrder.save();

    res.json({
      preferenceId: preferenceResponse.id,
      init_point: preferenceResponse.init_point,
    });

  } catch (error) {
    console.error('Erro ao criar preferência de pagamento:', error);
    res.status(500).json({ message: 'Erro ao criar preferência de pagamento.' });
  }
});

app.post('/api/payments/create-pix-payment', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body; 
    const { user } = req;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Pedido não encontrado.' });
    }

    if (order.status !== 'pending' && order.paymentInfo.paymentStatus !== 'pending') {
      return res.status(400).json({ message: 'Pedido já foi processado ou está em status inválido para PIX.' });
    }

    const notificationUrl = `${process.env.BACKEND_URL}/api/payments/webhook`; 
    console.log('DEBUG: notification_url sendo enviada ao Mercado Pago (PIX API):', notificationUrl); 

    const paymentInstance = new Payment(client);
    const paymentResponse = await paymentInstance.create({
      body: {
        transaction_amount: parseFloat(order.total.toFixed(2)), 
        description: `Pedido Cervejaria Virada #${order._id.toString()}`,
        payment_method_id: 'pix', 
        payer: {
          email: user.email, 
          first_name: user.nomeCompleto.split(' ')[0] || 'Cliente',
          last_name: user.nomeCompleto.split(' ').slice(1).join(' ') || '',
          identification: { 
            type: user.documentType || 'CPF', 
            number: user.documentNumber || '99999999999' 
          }
        },
        external_reference: order._id.toString(), 
        notification_url: notificationUrl,
        back_urls: {
          success: `${process.env.FRONTEND_URL}/my-orders`, // Redireciona para Meus Pedidos
          failure: `${process.env.FRONTEND_URL}/payment-failure`,
          pending: `${process.env.FRONTEND_URL}/payment-pending`,
        },
        auto_return: 'approved',
      }
    });

    order.paymentInfo = {
      ...order.paymentInfo, 
      paymentId: paymentResponse.id, 
      paymentMethod: 'pix',
      paymentStatus: paymentResponse.status, 
      pixCode: paymentResponse.point_of_interaction.transaction_data.qr_code, 
      qrCodeBase64: paymentResponse.point_of_interaction.transaction_data.qr_code_base64, 
      expirationDate: new Date(paymentResponse.date_of_expiration), 
      paymentDetails: paymentResponse 
    };
    await order.save();

    res.json({
      success: true,
      qrCodeBase64: order.paymentInfo.qrCodeBase64,
      pixCode: order.paymentInfo.pixCode,
      expirationDate: order.paymentInfo.expirationDate,
      amount: order.total,
      paymentIdMP: order.paymentInfo.paymentId 
    });

  } catch (error) {
    console.error('Erro ao criar pagamento PIX via Mercado Pago API:', error);
    if (error.cause && error.cause.length > 0) {
        error.cause.forEach(e => console.error('MP API Error:', e.code, e.description));
    }
    res.status(500).json({ 
      message: 'Erro ao criar pagamento PIX.',
      error: error.message,
      mp_error_details: error.cause ? error.cause.map(e => ({ code: e.code, description: e.description })) : undefined
    });
  }
});

app.post('/api/payments/webhook', async (req, res) => {
  console.log('Webhook do Mercado Pago recebido:', JSON.stringify(req.body, null, 2));

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
      console.error('MERCADOPAGO_WEBHOOK_SECRET não configurado no .env!');
  } else {
      console.log('Webhook Secret carregado para possível validação.');
  }

  if (req.body && req.body.type === 'payment' && req.body.data && req.body.data.id) {
    const paymentId = req.body.data.id;
    console.log(`Webhook de pagamento recebido para Payment ID: ${paymentId}`);

    try {
      const payment = new Payment(client);
      const paymentDetails = await payment.get({ id: paymentId });
      console.log('Detalhes completos do pagamento do Mercado Pago:', JSON.stringify(paymentDetails, null, 2));

      const externalReference = paymentDetails.external_reference;
      const paymentStatusMP = paymentDetails.status;
      const netReceivedAmount = paymentDetails.transaction_details?.net_received_amount;
      const mercadoPagoFee = paymentDetails.fee_details?.reduce((sum, fee) => sum + fee.amount, 0);

      if (externalReference) {
        const order = await Order.findById(externalReference);

        if (order) {
          console.log(`Atualizando pedido ${order._id} com status de pagamento: ${paymentStatusMP}`);
          
          order.paymentInfo.paymentId = paymentId;
          order.paymentInfo.paymentStatus = paymentStatusMP;
          order.paymentInfo.paymentDetails = paymentDetails;
          order.paymentInfo.netReceivedAmount = netReceivedAmount;
          order.paymentInfo.mercadoPagoFee = mercadoPagoFee;

          if (paymentStatusMP === 'approved') {
            order.status = 'processing';
            order.paidAt = new Date();
            
            // --- LÓGICA DE ATUALIZAÇÃO DE ESTOQUE ---
            for (const item of order.items) {
                try {
                    // Usamos findByIdAndUpdate com $inc para uma atualização atômica e segura
                    const updatedBeer = await Beer.findByIdAndUpdate(
                        item.productId,
                        { $inc: { quantity: -item.quantity } },
                        { new: true } // Retorna o documento atualizado
                    );

                    if (updatedBeer) {
                        console.log(`Estoque da cerveja ${updatedBeer.beerType} (${updatedBeer._id}) reduzido em ${item.quantity}. Novo estoque: ${updatedBeer.quantity}`);
                        if (updatedBeer.quantity < 0) {
                            console.warn(`Estoque negativo para ${updatedBeer.beerType} (${updatedBeer._id}) após pedido ${order._id}. Isso pode indicar um problema de concorrência ou validação.`);
                            // Considere adicionar lógica para notificar admin ou ajustar o pedido
                        }
                    } else {
                        console.warn(`Cerveja com ID ${item.productId} não encontrada para atualização de estoque no pedido ${order._id}.`);
                    }
                } catch (stockErr) {
                    console.error(`Erro ao atualizar estoque para item ${item.productId} no pedido ${order._id}:`, stockErr);
                }
            }
            // --- FIM DA LÓGICA DE ATUALIZAÇÃO DE ESTOQUE ---

          } else if (paymentStatusMP === 'pending' || paymentStatusMP === 'in_process') {
            order.status = 'pending'; 
          } else if (paymentStatusMP === 'rejected' || paymentStatusMP === 'cancelled' || paymentStatusMP === 'refunded' || paymentStatusMP === 'charged_back') {
            order.status = 'cancelled'; 
          }

          await order.save();
          console.log(`Pedido ${order._id} atualizado com sucesso para status: ${order.status}`);
        } else {
          console.warn('Webhook: Pedido com external_reference ${externalReference} não encontrado no banco de dados.');
        }
      } else {
        console.warn('Webhook: Notificação recebida sem external_reference. Não foi possível associar a um pedido.');
      }

    } catch (error) {
      console.error('Erro ao processar webhook do Mercado Pago:', error);
      if (error.response && error.response.data) {
          console.error('MP API Error Response:', error.response.data);
      }
    }
  } else {
    console.warn('Webhook: Notificação recebida com formato inesperado ou tipo não processado:', req.body);
  }

  res.status(200).send('ok');
});

const authRoutes = require('./src/routes/authRoutes');
const beerRoutes = require('./src/routes/beerRoutes');
const userRoutes = require('./src/routes/userRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const pixRoutes = require('./src/routes/pixRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/beers', beerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'API da Cervejaria Virada está funcionando!',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    documentation: `${process.env.BACKEND_URL}/api-docs`
  });
});

app.use((req, res, next) => {
  res.status(404).json({ 
    success: false, 
    message: 'Rota não encontrada',
    path: req.path,
    method: req.method
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
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

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Modo: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL}`);
  console.log(`Backend URL: ${process.env.BACKEND_URL}`);
  console.log(`Banco de Dados: ${process.env.DB_FULL_URI ? 'Conectado' : 'Não configurado'}`);
});

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

process.on('unhandledRejection', (err) => {
  console.error('Erro não tratado:', err);
  server.close(() => process.exit(1));
});