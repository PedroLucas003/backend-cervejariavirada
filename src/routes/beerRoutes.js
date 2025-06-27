const express = require('express');
const router = express.Router();
const beerController = require('../controllers/beerController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// Rota pública - SEM autenticação
router.get('/public', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600'); // Cache de 1 hora
  beerController.getPublicBeers(req, res);
});

// Todas as rotas abaixo requerem autenticação e privilégios de admin
router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/', beerController.getAllBeers);
router.post('/', beerController.createBeer);
router.put('/:id', beerController.updateBeer);
router.delete('/:id', beerController.deleteBeer);

module.exports = router;