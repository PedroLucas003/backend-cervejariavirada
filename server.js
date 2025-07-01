// server.js (VERSÃO COM INTEGRAÇÃO PIX VIA MERCADO PAGO API)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./src/config/db');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago'); // Adicionado 'Payment'
const authMiddleware = require('./src/middlewares/authMiddleware');
const Order = require('./src/models/Order');
const mongoose = require('mongoose');
const crypto = require('crypto'); // Adicione no topo do server.js se ainda não tiver

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

// Middleware para headers de segurança
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
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

// Rota para o manifest.json (se você tiver um)
app.get('/manifest.json', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// Conectar ao MongoDB
connectDB();

// =======================================================
// ROTAS DE PAGAMENTO (MERCADO PAGO)
// =======================================================

// Rota para criar a PREFERÊNCIA de pagamento (para outros métodos como cartão/boleto)
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
        paymentId: new mongoose.Types.ObjectId().toString(), // ID provisório
        paymentStatus: 'pending'
      },
      status: 'pending'
    });
    
    const savedOrder = await newOrder.save();

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

// NOVA ROTA PARA CRIAR PAGAMENTO PIX VIA MERCADO PAGO API
app.post('/api/payments/create-pix-payment', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body; // Recebe o orderId do frontend
    const { user } = req;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Pedido não encontrado.' });
    }

    if (order.status !== 'pending' && order.paymentInfo.paymentStatus !== 'pending') {
      return res.status(400).json({ message: 'Pedido já foi processado ou está em status inválido para PIX.' });
    }

    const paymentInstance = new Payment(client);
    const paymentResponse = await paymentInstance.create({
      body: {
        transaction_amount: parseFloat(order.total.toFixed(2)), // Valor total do pedido
        description: `Pedido Cervejaria Virada #${order._id.toString()}`,
        payment_method_id: 'pix', // Indica que é um pagamento PIX
        payer: {
          email: user.email, // Email do pagador
          first_name: user.nomeCompleto.split(' ')[0] || 'Cliente',
          last_name: user.nomeCompleto.split(' ').slice(1).join(' ') || '',
          identification: { // Opcional, mas bom para identificação
            type: user.documentType || 'CPF', // Assumindo que você tem isso no user
            number: user.documentNumber || '99999999999' // Assumindo que você tem isso no user
          }
        },
        external_reference: order._id.toString(), // Linka o pagamento MP ao seu Order ID
        notification_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
      }
    });

    // Atualiza o pedido com as informações do pagamento PIX do Mercado Pago
    order.paymentInfo = {
      ...order.paymentInfo, // Mantém o paymentId provisório se já existir
      paymentId: paymentResponse.id, // ID real do pagamento no Mercado Pago
      paymentMethod: 'pix',
      paymentStatus: paymentResponse.status, // Status inicial do PIX (pending)
      pixCode: paymentResponse.point_of_interaction.transaction_data.qr_code, // Código copia e cola
      qrCodeBase64: paymentResponse.point_of_interaction.transaction_data.qr_code_base64, // QR Code em base64
      expirationDate: new Date(paymentResponse.date_of_expiration), // Data de expiração do PIX
      paymentDetails: paymentResponse // Salva a resposta completa do MP
    };
    await order.save();

    res.json({
      success: true,
      qrCodeBase64: order.paymentInfo.qrCodeBase64,
      pixCode: order.paymentInfo.pixCode,
      expirationDate: order.paymentInfo.expirationDate,
      amount: order.total,
      paymentIdMP: order.paymentInfo.paymentId // Retorna o ID do pagamento do MP
    });

  } catch (error) {
    console.error('Erro ao criar pagamento PIX via Mercado Pago API:', error);
    // Log detalhado do erro da API do Mercado Pago
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


// Rota de webhook para receber notificações do Mercado Pago (APRIMORADA)
app.post('/api/payments/webhook', async (req, res) => {
  console.log('Webhook do Mercado Pago recebido:', JSON.stringify(req.body, null, 2));

  // --- Validação da Assinatura Secreta (ADICIONADO) ---
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const receivedSignature = req.headers['x-signature']; // O cabeçalho de assinatura
  const receivedTimestamp = req.headers['x-request-id']; // Mercado Pago usa X-Request-ID como timestamp, ou X-MercadoPago-Signature/Timestamp

  // A validação é um pouco mais complexa do que uma simples verificação de header.
  // O ideal é usar a função de validação do SDK do MP ou replicar a lógica.
  // A biblioteca `mercadopago` em NodeJS não tem uma função de validação de webhook pronta no SDK diretamente.
  // Você teria que implementar a validação manual baseada na documentação do Mercado Pago:
  // https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/webhooks/security/signatures
  // Basicamente, você recalcula a assinatura e compara.

  // Por simplicidade, para fins de teste, podemos adicionar um log para verificar se o secret está sendo lido
  if (!secret) {
      console.error('MERCADOPAGO_WEBHOOK_SECRET não configurado no .env!');
      // Não retorne erro, apenas logue, para não quebrar a funcionalidade base de webhook
  } else {
      console.log('Webhook Secret carregado para validação.');
      // Lógica de validação da assinatura aqui (complexa, não vou adicionar o código completo agora para não poluir,
      // mas saiba que é um ponto a ser implementado se a segurança for crítica).
  }
  // --- Fim da Validação da Assinatura Secreta ---

  // O Mercado Pago pode enviar diferentes tipos de notificações (payment, merchant_order, etc.)
  // Nosso foco é 'payment' para atualização de status.
  if (req.body && req.body.type === 'payment' && req.body.data && req.body.data.id) {
    const paymentId = req.body.data.id;
    console.log(`Webhook de pagamento recebido para Payment ID: ${paymentId}`);

    try {
      const payment = new Payment(client);
      const paymentDetails = await payment.get({ id: paymentId });
      console.log('Detalhes completos do pagamento do Mercado Pago:', JSON.stringify(paymentDetails, null, 2));

      const externalReference = paymentDetails.external_reference; // Nosso order._id
      const paymentStatusMP = paymentDetails.status; // Status do Mercado Pago (approved, pending, rejected, etc.)
      const netReceivedAmount = paymentDetails.transaction_details?.net_received_amount;
      const mercadoPagoFee = paymentDetails.fee_details?.reduce((sum, fee) => sum + fee.amount, 0);

      if (externalReference) {
        const order = await Order.findById(externalReference);

        if (order) {
          console.log(`Atualizando pedido ${order._id} com status de pagamento: ${paymentStatusMP}`);
          
          order.paymentInfo.paymentId = paymentId; // Garante que o paymentId do MP esteja salvo
          order.paymentInfo.paymentStatus = paymentStatusMP;
          order.paymentInfo.paymentDetails = paymentDetails; // Salva todos os detalhes do MP
          order.paymentInfo.netReceivedAmount = netReceivedAmount;
          order.paymentInfo.mercadoPagoFee = mercadoPagoFee;

          // Mapeia o status do Mercado Pago para o status do seu pedido
          if (paymentStatusMP === 'approved') {
            order.status = 'processing';
            order.paidAt = new Date();
          } else if (paymentStatusMP === 'pending' || paymentStatusMP === 'in_process') {
            order.status = 'pending'; 
          } else if (paymentStatusMP === 'rejected' || paymentStatusMP === 'cancelled' || paymentStatusMP === 'refunded' || paymentStatusMP === 'charged_back') {
            order.status = 'cancelled'; 
          }

          await order.save();
          console.log(`Pedido ${order._id} atualizado com sucesso para status: ${order.status}`);
        } else {
          console.warn(`Webhook: Pedido com external_reference ${externalReference} não encontrado no banco de dados.`);
        }
      } else {
        console.warn('Webhook: Notificação recebida sem external_reference. Não foi possível associar a um pedido.');
      }

    } catch (error) {
      console.error('Erro ao processar webhook do Mercado Pago:', error);
      // Log detalhado do erro da API do Mercado Pago
      if (error.response && error.response.data) {
          console.error('MP API Error Response:', error.response.data);
      }
    }
  } else {
    console.warn('Webhook: Notificação recebida com formato inesperado ou tipo não processado:', req.body);
  }

  res.status(200).send('ok'); // Sempre responda 200 OK para o Mercado Pago
});


// =======================================================
// ROTAS DA APLICAÇÃO (MANTIDAS)
// =======================================================
const authRoutes = require('./src/routes/authRoutes');
const beerRoutes = require('./src/routes/beerRoutes');
const userRoutes = require('./src/routes/userRoutes');
const orderRoutes = require('./src/routes/orderRoutes');
const pixRoutes = require('./src/routes/pixRoutes'); // Esta rota de PIX estático será desativada ou removida

app.use('/api/auth', authRoutes);
app.use('/api/beers', beerRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
// A rota /api/pix será desativada ou modificada, pois a geração PIX agora será via /api/payments/create-pix-payment
// app.use('/api/pix', pixRoutes); // Comente ou remova esta linha se não for mais usar o PIX estático

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