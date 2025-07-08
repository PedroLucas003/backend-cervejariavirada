const Order = require('../models/Order');
const mongoose = require('mongoose');

// ==========================================================
// FUNÇÃO DE CRIAR PEDIDO (MANTENHA COMO ESTÁ)
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
        paymentId: new mongoose.Types.ObjectId(),
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
// FUNÇÃO PARA BUSCAR PEDIDOS DO USUÁRIO (AGORA PREENCHIDA)
// ==========================================================
exports.getUserOrders = async (req, res) => {
  try {
    // Busca no banco os pedidos que pertencem ao ID do usuário logado
    const orders = await Order.find({ user: req.userId })
      .populate({ // Popula os detalhes dos produtos dentro dos itens
        path: 'items.productId',
        select: 'nome imagem' // Seleciona apenas nome e imagem do produto
      })
      .sort({ createdAt: -1 }); // Ordena do mais novo para o mais antigo

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
// FUNÇÃO PARA ADMIN BUSCAR TODOS OS PEDIDOS (AGORA PREENCHIDA)
// ==========================================================
exports.getAllOrders = async (req, res) => {
  try {
    // Busca TODOS os pedidos, sem filtro
    const orders = await Order.find({})
      .populate('user', 'nomeCompleto email') // Popula os dados do usuário que fez o pedido
      .populate({ // Popula os detalhes dos produtos
        path: 'items.productId',
        select: 'nome imagem'
      })
      .sort({ createdAt: -1 }); // Ordena do mais novo para o mais antigo

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