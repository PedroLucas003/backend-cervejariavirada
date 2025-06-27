const User = require('../models/User');
const mongoose = require('mongoose');

// Obter todos os usuários
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-senha');
    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuários',
      error: error.message
    });
  }
};

// Criar novo usuário (admin)
exports.createUser = async (req, res) => {
  try {
    // Validações adicionais
    if (!req.body.nomeCompleto || !req.body.email || !req.body.cpf || !req.body.senha) {
      return res.status(400).json({
        success: false,
        message: 'Todos os campos obrigatórios devem ser preenchidos'
      });
    }

    // Verificar se o CPF tem 11 dígitos
    if (req.body.cpf.replace(/\D/g, '').length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'CPF inválido'
      });
    }

    // Verificar formato do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Email inválido'
      });
    }

    // Verificar se o telefone tem pelo menos 10 dígitos
    if (req.body.telefone && req.body.telefone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Telefone inválido'
      });
    }

    // Verificar se o estado é válido (2 letras)
    if (req.body.enderecos && req.body.enderecos[0] && req.body.enderecos[0].estado) {
      const estado = req.body.enderecos[0].estado.toUpperCase();
      if (estado.length !== 2 || !/^[A-Z]{2}$/.test(estado)) {
        return res.status(400).json({
          success: false,
          message: 'Estado inválido (deve ser a sigla com 2 letras)'
        });
      }
      // Garante que o estado seja salvo em maiúsculas
      req.body.enderecos[0].estado = estado;
    }

    const user = await User.create(req.body);
    user.senha = undefined;
    
    res.status(201).json({
      success: true,
      data: user
    });
  } catch (error) {
    // Tratar erros específicos do MongoDB
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const message = field === 'email' 
        ? 'Email já cadastrado' 
        : 'CPF já cadastrado';
      
      return res.status(400).json({
        success: false,
        message
      });
    }
    
    res.status(400).json({
      success: false,
      message: 'Erro ao criar usuário',
      error: error.message
    });
  }
};

// Obter um usuário específico
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-senha');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar usuário',
      error: error.message
    });
  }
};

// Atualizar usuário (admin)
exports.updateUser = async (req, res) => {
  try {
    // Verificar se o usuário é admin ou está editando seu próprio perfil
    if (!req.user.isAdmin && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({
        success: false,
        message: 'Você só pode editar seu próprio perfil'
      });
    }

    const user = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).select('-senha');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Erro ao atualizar usuário',
      error: error.message
    });
  }
};

// Deletar usuário
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Usuário removido com sucesso'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Erro ao remover usuário',
      error: error.message
    });
  }
};