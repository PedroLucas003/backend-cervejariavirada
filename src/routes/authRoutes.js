const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const { celebrate, Joi } = require('celebrate');

// Validação para atualização de usuário
const updateUserValidation = celebrate({
  params: Joi.object({
    id: Joi.string().hex().length(24).required()
  }),
  body: Joi.object({
    nomeCompleto: Joi.string().min(3).max(100),
    email: Joi.string().email(),
    dataNascimento: Joi.date().less('now'),
    telefone: Joi.string().pattern(/^[0-9]{10,11}$/),
    enderecos: Joi.array().items(
      Joi.object({
        cep: Joi.string().pattern(/^[0-9]{8}$/).required(),
        logradouro: Joi.string().required(),
        numero: Joi.string().required(),
        complemento: Joi.string().allow(''),
        bairro: Joi.string().required(),
        cidade: Joi.string().required(),
        estado: Joi.string().length(2).required(),
        principal: Joi.boolean()
      })
    )
  })
});

// Rotas de autenticação
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/validate', authController.validateToken);
router.put('/:id', authMiddleware, updateUserValidation, authController.updateUser);

module.exports = router;