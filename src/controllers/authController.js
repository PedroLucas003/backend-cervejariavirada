const jwt = require('jsonwebtoken');
const User = require('../models/User');
const mongoose = require('mongoose');

// Registrar novo usuário
exports.register = async (req, res) => {
  try {
    const { nomeCompleto, email, cpf, senha, dataNascimento, telefone, enderecos } = req.body;

    // Verificar se usuário já existe
    const userExists = await User.findOne({ $or: [{ email }, { cpf }] });
    if (userExists) {
      return res.status(400).json({ 
        success: false,
        message: 'Email ou CPF já cadastrado' 
      });
    }

    // Criar novo usuário
    const user = await User.create({
      nomeCompleto,
      email,
      cpf,
      senha,
      dataNascimento,
      telefone,
      enderecos
    });

    // Criar token JWT sem expiração
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    // Retornar resposta sem a senha
    user.senha = undefined;

    res.status(201).json({
      success: true,
      token,
      user
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erro ao registrar usuário',
      error: error.message 
    });
  }
};

// Login do usuário
exports.login = async (req, res) => {
  try {
    const { email, senha } = req.body;

    // Verificar se usuário existe
    const user = await User.findOne({ email }).select('+senha');
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Credenciais inválidas' 
      });
    }

    // Verificar senha
    const isMatch = await user.comparePassword(senha);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Credenciais inválidas' 
      });
    }

    // Criar token JWT sem expiração
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    // Retornar resposta sem a senha
    user.senha = undefined;

    res.status(200).json({
      success: true,
      token,
      user
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      message: 'Erro ao fazer login',
      error: error.message 
    });
  }
};

// Atualizar usuário
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuário inválido'
      });
    }

    if (id !== req.userId.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Não autorizado para atualizar este perfil' 
      });
    }

    const allowedUpdates = {
      nomeCompleto: req.body.nomeCompleto,
      email: req.body.email,
      dataNascimento: req.body.dataNascimento,
      telefone: req.body.telefone,
      enderecos: req.body.enderecos
    };

    const user = await User.findByIdAndUpdate(id, allowedUpdates, { 
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
      message: 'Perfil atualizado com sucesso',
      user
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erro de validação',
        errors
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Erro ao atualizar usuário',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Validar token
exports.validateToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ valid: false });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ valid: false });
    }

    res.status(200).json({ 
      valid: true,
      user 
    });

  } catch (error) {
    res.status(401).json({ valid: false });
  }
};