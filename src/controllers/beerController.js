const Beer = require('../models/Beer');

// Controller para a rota pública
const getPublicBeers = async (req, res) => {
  try {
    const beers = await Beer.find({}, { 
      beerType: 1, 
      description: 1, 
      alcoholContent: 1, 
      yearCreated: 1, 
      price: 1, 
      quantity: 1,
      _id: 1
    });
    
    res.status(200).json({
      success: true,
      data: beers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar cervejas',
      error: error.message
    });
  }
};

// Controller para rotas protegidas
const getAllBeers = async (req, res) => {
  try {
    const beers = await Beer.find({});
    res.status(200).json({
      success: true,
      data: beers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar cervejas',
      error: error.message
    });
  }
};

const createBeer = async (req, res) => {
  try {
    const beer = await Beer.create(req.body);
    res.status(201).json({
      success: true,
      data: beer
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Erro ao criar cerveja',
      error: error.message
    });
  }
};

const updateBeer = async (req, res) => {
  try {
    const beer = await Beer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    if (!beer) {
      return res.status(404).json({
        success: false,
        message: 'Cerveja não encontrada'
      });
    }
    
    res.status(200).json({
      success: true,
      data: beer
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Erro ao atualizar cerveja',
      error: error.message
    });
  }
};

const deleteBeer = async (req, res) => {
  try {
    const beer = await Beer.findByIdAndDelete(req.params.id);
    
    if (!beer) {
      return res.status(404).json({
        success: false,
        message: 'Cerveja não encontrada'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Cerveja removida com sucesso'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Erro ao remover cerveja',
      error: error.message
    });
  }
};

module.exports = {
  getPublicBeers,
  getAllBeers,
  createBeer,
  updateBeer,
  deleteBeer
};