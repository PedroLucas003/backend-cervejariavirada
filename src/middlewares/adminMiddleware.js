const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ 
        success: false,
        message: 'Acesso negado. Requer privilégios de administrador.' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Erro no middleware admin:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro ao verificar privilégios de administrador'
    });
  }
};