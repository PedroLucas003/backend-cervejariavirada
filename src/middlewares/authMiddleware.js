const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    // Verificar se o header Authorization existe
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'Token de autorização não fornecido ou formato inválido' 
      });
    }

    // Extrair o token
    const token = authHeader.split(' ')[1];
    
    // Verificar o token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar se o usuário ainda existe
    const user = await User.findById(decoded.id).select('-senha');
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Usuário associado a este token não existe mais' 
      });
    }

    // Adicionar informações do usuário à requisição
    req.userId = decoded.id;
    req.user = user;
    
    next();
  } catch (error) {
    // Tratamento específico para diferentes tipos de erros JWT
    let message = 'Token inválido';
    if (error.name === 'TokenExpiredError') {
      message = 'Token expirado';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Token malformado';
    }

    return res.status(401).json({ 
      success: false,
      message
    });
  }
};