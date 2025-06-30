const mongoose = require('mongoose');

const beerSchema = new mongoose.Schema({
  beerType: {
    type: String,
    required: [true, 'Tipo de cerveja é obrigatório'],
    enum: ['Belgian Blonde Ale', 'Tripel', 'Extra Stout', 'Irish Red Ale'],
    trim: true
  },
  description: {
    type: String,
    required: [true, 'Descrição é obrigatória'],
    trim: true
  },
  alcoholContent: {
    type: String,
    required: [true, 'Teor alcoólico é obrigatório'],
    trim: true
  },
  yearCreated: {
    type: String,
    required: [true, 'Ano de criação é obrigatório'],
    trim: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantidade é obrigatória'],
    min: [0, 'Quantidade não pode ser negativa']
  },
  price: {
    type: Number,
    required: [true, 'Preço é obrigatório'],
    min: [0, 'Preço não pode ser negativo']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Beer', beerSchema);