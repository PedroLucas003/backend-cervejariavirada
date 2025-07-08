const Order = require('../models/Order');
const Beer = require('../models/Beer'); // Importar o modelo Beer para estorno de estoque
const { MercadoPagoConfig, Payment } = require('mercadopago'); // Importar Payment para reembolsos
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN }); // Cliente MP

// ==========================================================
// FUNÇÃO DE CRIAR PEDIDO
// ==========================================================
exports.createOrder = async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'O carrinho não pode estar vazio.'
      });
    }
    
    const newOrder = new Order({
      user: req.userId,
      userEmail: req.user.email,
      items: items.map(item => ({
        productId: item._id,
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

    res.status(201).json({
        success: true,
        message: 'Pedido criado com sucesso!',
        data: savedOrder
    });

  } catch (error) {
    console.error('Erro ao criar pedido:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao criar o pedido. Verifique os dados enviados.',
      error: error.message
    });
  }
};


// ==========================================================
// FUNÇÃO PARA BUSCAR PEDIDOS DO USUÁRIO
// ==========================================================
exports.getUserOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.userId })
      .populate({ 
        path: 'items.productId',
        select: 'nome imagem' 
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Erro ao buscar pedidos do usuário:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar seus pedidos.'
    });
  }
};


// ==========================================================
// FUNÇÃO PARA ADMIN BUSCAR TODOS OS PEDIDOS
// ==========================================================
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate('user', 'nomeCompleto email') 
      .populate({ 
        path: 'items.productId',
        select: 'nome imagem'
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: orders
    });
  } catch (error) {
    console.error('Erro ao buscar todos os pedidos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar todos os pedidos.'
    });
  }
};

// ==========================================================
// FUNÇÃO: ATUALIZAR STATUS DO PEDIDO (PARA ADMIN)
// ==========================================================
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus } = req.body; 

    if (!['pending', 'processing', 'shipped', 'delivered', 'cancelled'].includes(newStatus)) {
      return res.status(400).json({ success: false, message: 'Status inválido fornecido.' });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    }

    if (newStatus === 'shipped' && !order.shippedAt) {
      order.shippedAt = new Date();
    }
    if (newStatus === 'delivered' && !order.deliveredAt) {
      order.deliveredAt = new Date();
    }

    order.status = newStatus;
    await order.save();

    res.status(200).json({ success: true, message: 'Status do pedido atualizado com sucesso.', data: order });

  } catch (error) {
    console.error('Erro ao atualizar status do pedido:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao atualizar status do pedido.' });
  }
};


// ==========================================================
// FUNÇÃO: CANCELAR PEDIDO E REEMBOLSAR (PARA ADMIN) - CORRIGIDA
// ==========================================================
exports.cancelOrder = async (req, res) => {
  try {
    const { id: orderId } = req.params; 

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });
    }

    if (order.status === 'cancelled' || order.status === 'delivered') {
      return res.status(400).json({ success: false, message: 'Não é possível cancelar ou reembolsar um pedido neste status.' });
    }

    if (order.paymentInfo.paymentStatus !== 'approved' && order.paymentInfo.paymentStatus !== 'authorized') {
      return res.status(400).json({ success: false, message: `Pagamento com status '${order.paymentInfo.paymentStatus}' não pode ser reembolsado.` });
    }
    
    if (!order.paymentInfo.paymentId) {
        return res.status(400).json({ success: false, message: 'ID de pagamento do Mercado Pago não encontrado para este pedido.' });
    }

    const paymentService = new Payment(client); // Cria a instância do serviço de Pagamento

    try {
        const refundResponse = await paymentService.refunds.create({ // CORRIGIDO: Acessa refunds.create
            payment_id: order.paymentInfo.paymentId, // CORRIGIDO: usa payment_id
            body: { 
                amount: order.total 
            }
        });

        if (refundResponse.status === 'approved' || refundResponse.status === 'pending') {
            order.status = 'cancelled'; 
            order.paymentInfo.paymentStatus = 'refunded'; 
            order.notes = (order.notes || '') + `\nPedido cancelado e reembolsado em ${new Date().toISOString()}. Status MP: ${refundResponse.status_detail}`;
            
            // Certifique-se que order.isStockReduced existe e foi definido pelo webhook
            // Se o estoque foi reduzido no webhook, estornamos aqui
            if (order.isStockReduced) { 
                for (const item of order.items) {
                    await Beer.findByIdAndUpdate(item.productId, { $inc: { quantity: item.quantity } }); 
                    console.log(`Estoque de ${item.name} (${item.productId}) estornado em ${item.quantity} unidades.`);
                }
                order.isStockReduced = false; 
            }

            await order.save();
            return res.status(200).json({ success: true, message: 'Pedido cancelado e reembolsado com sucesso!', data: order, refundDetails: refundResponse });

        } else {
            console.error('Erro no reembolso do Mercado Pago (resposta API):', refundResponse);
            return res.status(400).json({ success: false, message: `Falha no reembolso via Mercado Pago. Status: ${refundResponse.status} - ${refundResponse.status_detail}` });
        }

    } catch (mpError) {
        console.error('Erro ao chamar API de Reembolso do Mercado Pago (execução):', mpError.response ? mpError.response.data : mpError.message);
        return res.status(500).json({ success: false, message: 'Erro ao processar o reembolso via Mercado Pago API.' });
    }

  } catch (error) {
    console.error('Erro ao cancelar pedido:', error);
    res.status(500).json({ success: false, message: 'Erro interno ao cancelar o pedido.' });
  }
};