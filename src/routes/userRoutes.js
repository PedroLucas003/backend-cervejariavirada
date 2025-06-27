const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
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

// Aplicar middleware de autenticação para todas as rotas
router.use(authMiddleware);

// Rotas que requerem admin
router.get('/', adminMiddleware, userController.getAllUsers);
router.post('/', adminMiddleware, userController.createUser);

// Rotas que podem ser acessadas pelo próprio usuário ou admin
router.get('/:id', userController.getUser);
router.put('/:id', updateUserValidation, userController.updateUser);
router.delete('/:id', userController.deleteUser);

module.exports = router;